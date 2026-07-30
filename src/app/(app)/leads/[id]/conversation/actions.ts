"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/auth-helpers";
import { whatsappConfigured } from "@/lib/env";
import { sendText } from "@/lib/whatsapp/client";
import {
  startConversation,
  endConversation,
  recordOutbound,
  recordShare,
} from "@/lib/whatsapp/conversations";
import {
  cityLabel,
  formatPrice,
  propertyTypeLabel,
  transactionTypeLabel,
} from "@/lib/domain";

export interface ConvActionResult {
  ok: boolean;
  error?: string;
  conversationId?: string;
  /** True when the message was recorded but not sent live (WhatsApp creds absent). */
  queuedOnly?: boolean;
}

async function ownedActiveConversation(conversationId: string) {
  const user = await currentUser();
  if (!user) return { user: null, conv: null } as const;
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, agentId: true, status: true, customerPhone: true, leadId: true },
  });
  return { user, conv };
}

export async function startConversationAction(leadId: string): Promise<ConvActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const r = await startConversation(user, leadId);
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath(`/leads/${leadId}/conversation`);
  revalidatePath("/leads");
  return { ok: true, conversationId: r.conversationId };
}

export async function endConversationAction(conversationId: string, leadId: string): Promise<ConvActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const r = await endConversation(user, conversationId);
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath(`/leads/${leadId}/conversation`);
  revalidatePath("/leads");
  return { ok: true };
}

async function deliver(
  conv: { id: string; customerPhone: string },
  userId: string,
  body: string,
  type: "TEXT",
): Promise<{ messageId: string; queuedOnly: boolean }> {
  // Sends are never a hard failure from the agent's view: a transient send error
  // (or WhatsApp not configured) leaves the message QUEUED for the outbox worker.
  let status: "SENT" | "QUEUED" = "QUEUED";
  let waMessageId: string | null = null;
  let errorDetail: string | null = null;
  if (whatsappConfigured) {
    try {
      waMessageId = await sendText(conv.customerPhone, body);
      status = "SENT";
    } catch (e) {
      status = "QUEUED";
      errorDetail = e instanceof Error ? e.message : String(e);
    }
  }
  const messageId = await recordOutbound({
    conversationId: conv.id,
    sentById: userId,
    type,
    body,
    waMessageId,
    status,
    errorDetail,
  });
  return { messageId, queuedOnly: status !== "SENT" };
}

export async function sendMessageAction(
  conversationId: string,
  leadId: string,
  text: string,
): Promise<ConvActionResult> {
  const { user, conv } = await ownedActiveConversation(conversationId);
  if (!user) return { ok: false, error: "Not signed in." };
  if (!conv || conv.status !== "ACTIVE") return { ok: false, error: "Conversation is not active." };
  // Only the owning agent may send — admins have read-only oversight, never send.
  if (conv.agentId !== user.id) {
    return { ok: false, error: "Only the agent handling this conversation can send messages." };
  }
  const body = text.trim();
  if (!body) return { ok: false, error: "Message is empty." };

  const r = await deliver(conv, user.id, body, "TEXT");
  revalidatePath(`/leads/${leadId}/conversation`);
  return { ok: true, queuedOnly: r.queuedOnly };
}

export async function sharePropertyAction(
  conversationId: string,
  leadId: string,
  propertyId: string,
): Promise<ConvActionResult> {
  const { user, conv } = await ownedActiveConversation(conversationId);
  if (!user) return { ok: false, error: "Not signed in." };
  if (!conv || conv.status !== "ACTIVE") return { ok: false, error: "Conversation is not active." };
  if (conv.agentId !== user.id) {
    return { ok: false, error: "Only the agent handling this conversation can share." };
  }

  const p = await prisma.property.findFirst({
    where: { id: propertyId, deletedAt: null },
    include: { locality: true },
  });
  if (!p) return { ok: false, error: "Property not found." };

  const summary = [
    `*${p.fileNo}* — ${propertyTypeLabel[p.propertyType]}${p.bhk ? ` · ${p.bhk} BHK` : ""} for ${transactionTypeLabel[p.transactionType]}`,
    `${p.locality.name}, ${cityLabel[p.city]}`,
    `Price: ${formatPrice(Number(p.priceInr), p.transactionType)}`,
    p.builtUpAreaSqft ? `Area: ${p.builtUpAreaSqft.toLocaleString("en-IN")} sq.ft` : "",
  ]
    .filter(Boolean)
    .join("\n");

  // Snapshot the property AS SHARED so admin oversight is accurate even if it later changes.
  const snapshot = {
    fileNo: p.fileNo,
    propertyType: p.propertyType,
    bhk: p.bhk,
    locality: p.locality.name,
    city: p.city,
    transactionType: p.transactionType,
    priceInr: Number(p.priceInr),
    builtUpAreaSqft: p.builtUpAreaSqft,
    availabilityStatus: p.availabilityStatus,
  };

  const r = await deliver(conv, user.id, summary, "TEXT");
  // The message is SENT or safely QUEUED for retry (never silently dropped), so the
  // share is recorded either way; the message's own status reflects delivery.
  await recordShare({
    conversationId,
    leadId,
    propertyId,
    sharedById: user.id,
    messageId: r.messageId,
    includedText: true,
    snapshot,
  });
  revalidatePath(`/leads/${leadId}/conversation`);
  return { ok: true, queuedOnly: r.queuedOnly };
}
