import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, type SessionUser } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { normalizePhone } from "@/lib/whatsapp/phone";
import { sendText, isWhatsAppConfigured } from "@/lib/whatsapp/client";

// Conversation domain service. Enforces the exclusive lock (at most one ACTIVE
// conversation per lead — backed by a partial unique index for race safety) and
// the RBAC rule: a conversation's content is visible only to the owning agent and
// to admins. Other agents can see only THAT a conversation exists (the lock info).

export interface ActiveConvInfo {
  conversationId: string;
  agentId: string;
  agentName: string;
  agentEmail: string;
  startedAt: Date;
}

/** Active-conversation owners for a set of leads — for the leads-list lock badge. */
export async function activeConversationsByLead(
  leadIds: string[],
): Promise<Map<string, ActiveConvInfo>> {
  if (leadIds.length === 0) return new Map();
  const rows = await prisma.conversation.findMany({
    where: { leadId: { in: leadIds }, status: "ACTIVE" },
    select: {
      id: true,
      leadId: true,
      agentId: true,
      startedAt: true,
      agent: { select: { fullName: true, email: true } },
    },
  });
  const map = new Map<string, ActiveConvInfo>();
  for (const r of rows) {
    map.set(r.leadId, {
      conversationId: r.id,
      agentId: r.agentId,
      agentName: r.agent.fullName,
      agentEmail: r.agent.email,
      startedAt: r.startedAt,
    });
  }
  return map;
}

export async function getActiveConversationForLead(leadId: string): Promise<ActiveConvInfo | null> {
  const r = await prisma.conversation.findFirst({
    where: { leadId, status: "ACTIVE" },
    select: { id: true, agentId: true, startedAt: true, agent: { select: { fullName: true, email: true } } },
  });
  return r
    ? { conversationId: r.id, agentId: r.agentId, agentName: r.agent.fullName, agentEmail: r.agent.email, startedAt: r.startedAt }
    : null;
}

export type StartResult =
  | { ok: true; conversationId: string }
  | { ok: false; error: string; activeWith?: ActiveConvInfo };

/** Start (lock) a conversation with a lead's customer. The partial unique index
 *  guarantees only one ACTIVE conversation per lead even under a simultaneous race. */
export async function startConversation(user: SessionUser, leadId: string): Promise<StartResult> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, city: true, mobile: true, isArchivedInTeleduce: true },
  });
  if (!lead) return { ok: false, error: "Lead not found." };
  if (user.role === "AGENT" && !user.cities.includes(lead.city)) {
    return { ok: false, error: "You are not assigned to this lead's city." };
  }
  const phone = normalizePhone(lead.mobile);
  if (!phone) return { ok: false, error: "This lead has no valid phone number to message." };

  try {
    const conv = await prisma.conversation.create({
      data: { leadId, agentId: user.id, customerPhone: phone, status: "ACTIVE" },
      select: { id: true },
    });
    await writeAudit({
      userId: user.id,
      action: "Conversation started",
      entityType: "Conversation",
      entityId: conv.id,
      after: { leadId },
    });
    return { ok: true, conversationId: conv.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const activeWith = (await getActiveConversationForLead(leadId)) ?? undefined;
      return { ok: false, error: "This client is already in an active conversation.", activeWith };
    }
    throw e;
  }
}

/** End (unlock) a conversation. Owner agent or any admin (admins for future transfer). */
export async function endConversation(
  user: SessionUser,
  conversationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, agentId: true, status: true },
  });
  if (!conv) return { ok: false, error: "Conversation not found." };
  if (conv.status !== "ACTIVE") return { ok: true };
  if (user.role !== "ADMIN" && conv.agentId !== user.id) {
    return { ok: false, error: "Only the agent handling this client can end the conversation." };
  }
  // Atomic: only the first updateMany matching status=ACTIVE wins, so two concurrent
  // ends can't overwrite each other's endedById.
  const res = await prisma.conversation.updateMany({
    where: { id: conversationId, status: "ACTIVE" },
    data: { status: "ENDED", endedAt: new Date(), endedById: user.id },
  });
  if (res.count > 0) {
    await writeAudit({
      userId: user.id,
      action: "Conversation ended",
      entityType: "Conversation",
      entityId: conversationId,
    });
  }
  return { ok: true };
}

export const OVERSIGHT_PAGE_SIZE = 50;

/** Admin oversight: conversations across all agents, newest activity first, paginated. */
export async function listConversationsForAdmin(page = 1) {
  return prisma.conversation.findMany({
    orderBy: [{ status: "asc" }, { lastMessageAt: "desc" }, { startedAt: "desc" }],
    skip: (Math.max(1, page) - 1) * OVERSIGHT_PAGE_SIZE,
    take: OVERSIGHT_PAGE_SIZE,
    include: {
      lead: { select: { id: true, firstName: true, lastName: true, mobile: true, city: true } },
      agent: { select: { fullName: true, email: true } },
      _count: { select: { messages: true, sharedProperties: true, searchActivities: true } },
    },
  });
}

export type ConversationDetail = Prisma.ConversationGetPayload<{
  include: {
    lead: true;
    agent: { select: { id: true; fullName: true; email: true } };
    messages: true;
    sharedProperties: { include: { property: { include: { locality: true } } } };
    searchActivities: true;
  };
}>;

/**
 * Load a conversation for viewing with RBAC: the owning agent OR any admin. Other
 * agents are rejected (ForbiddenError) — they never see another agent's content.
 */
export async function getConversationDetail(
  user: SessionUser,
  conversationId: string,
): Promise<ConversationDetail | null> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      lead: true,
      agent: { select: { id: true, fullName: true, email: true } },
      messages: { orderBy: { createdAt: "asc" } },
      sharedProperties: { include: { property: { include: { locality: true } } }, orderBy: { sharedAt: "asc" } },
      searchActivities: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!conv) return null;
  if (user.role !== "ADMIN" && conv.agentId !== user.id) {
    throw new ForbiddenError("This conversation belongs to another agent.");
  }
  return conv;
}

/** Append an outbound message row (after a successful or attempted send). */
export async function recordOutbound(args: {
  conversationId: string;
  sentById: string;
  type: "TEXT" | "TEMPLATE" | "IMAGE" | "DOCUMENT";
  body?: string | null;
  templateName?: string | null;
  attachmentId?: string | null;
  waMessageId?: string | null;
  status: "QUEUED" | "SENT" | "FAILED";
  errorDetail?: string | null;
}): Promise<string> {
  const msg = await prisma.message.create({
    data: {
      conversationId: args.conversationId,
      direction: "OUTBOUND",
      type: args.type,
      body: args.body ?? null,
      templateName: args.templateName ?? null,
      attachmentId: args.attachmentId ?? null,
      waMessageId: args.waMessageId ?? null,
      status: args.status,
      sentById: args.sentById,
      errorDetail: args.errorDetail ?? null,
      sentAt: args.status === "SENT" ? new Date() : null,
    },
    select: { id: true },
  });
  await prisma.conversation.update({
    where: { id: args.conversationId },
    data: { lastMessageAt: new Date() },
  });
  return msg.id;
}

/** Record a property share (snapshot of the property at send time). */
export async function recordShare(args: {
  conversationId: string;
  leadId: string;
  propertyId: string;
  sharedById: string;
  messageId?: string | null;
  includedPdf?: boolean;
  includedImages?: boolean;
  includedBrochure?: boolean;
  includedText?: boolean;
  snapshot: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.sharedProperty.create({
    data: {
      conversationId: args.conversationId,
      leadId: args.leadId,
      propertyId: args.propertyId,
      sharedById: args.sharedById,
      messageId: args.messageId ?? null,
      includedPdf: args.includedPdf ?? false,
      includedImages: args.includedImages ?? false,
      includedBrochure: args.includedBrochure ?? false,
      includedText: args.includedText ?? true,
      snapshotJson: args.snapshot,
    },
  });
}

/**
 * Log a search snapshot for the admin-reconstruction trail, throttled: skips if an
 * identical result set was just logged, or if the last log for this conversation is
 * under 2 minutes old — so opening the workspace repeatedly doesn't spam the trail.
 */
export async function logSearchSnapshot(args: {
  conversationId: string;
  leadId: string;
  agentId: string;
  criteria: Prisma.InputJsonValue;
  resultPropertyIds: string[];
}): Promise<void> {
  const recent = await prisma.searchActivity.findFirst({
    where: { conversationId: args.conversationId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, resultPropertyIds: true },
  });
  if (recent) {
    const same = JSON.stringify(recent.resultPropertyIds) === JSON.stringify(args.resultPropertyIds);
    const fresh = Date.now() - recent.createdAt.getTime() < 2 * 60 * 1000;
    if (same || fresh) return;
  }
  await prisma.searchActivity.create({
    data: {
      conversationId: args.conversationId,
      leadId: args.leadId,
      agentId: args.agentId,
      criteriaJson: args.criteria,
      resultPropertyIds: args.resultPropertyIds,
    },
  });
}

/** Log a matching search an agent ran for a lead (admin-reconstruction trail). */
export async function logSearch(args: {
  leadId: string;
  agentId: string;
  conversationId?: string | null;
  criteria: Prisma.InputJsonValue;
  resultPropertyIds: string[];
}): Promise<void> {
  await prisma.searchActivity.create({
    data: {
      leadId: args.leadId,
      agentId: args.agentId,
      conversationId: args.conversationId ?? null,
      criteriaJson: args.criteria,
      resultPropertyIds: args.resultPropertyIds,
    },
  });
}

const OUTBOX_MAX_AGE_MS = 24 * 60 * 60 * 1000; // give up after 24h → FAILED

/**
 * Retry worker for QUEUED outbound messages — covers messages recorded while
 * WhatsApp was unconfigured, and ones whose live send hit a transient error. Sends
 * each via the Cloud API and advances SENT; leaves it QUEUED to retry next run, or
 * marks FAILED once older than the retry window. Triggered by a scheduled cron.
 */
export async function processWhatsappOutbox(limit = 50): Promise<{
  sent: number;
  failed: number;
  stillQueued: number;
}> {
  if (!isWhatsAppConfigured()) return { sent: 0, failed: 0, stillQueued: 0 };

  const pending = await prisma.message.findMany({
    where: { direction: "OUTBOUND", status: "QUEUED", type: "TEXT" },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      body: true,
      createdAt: true,
      conversation: { select: { customerPhone: true } },
    },
  });

  let sent = 0;
  let failed = 0;
  let stillQueued = 0;
  const tooOld = new Date(Date.now() - OUTBOX_MAX_AGE_MS);

  for (const m of pending) {
    if (!m.body || m.createdAt < tooOld) {
      await prisma.message.update({
        where: { id: m.id },
        data: { status: "FAILED", statusUpdatedAt: new Date() },
      });
      failed++;
      continue;
    }
    try {
      const wamid = await sendText(m.conversation.customerPhone, m.body);
      await prisma.message.update({
        where: { id: m.id },
        data: { status: "SENT", waMessageId: wamid, sentAt: new Date(), statusUpdatedAt: new Date() },
      });
      sent++;
    } catch {
      stillQueued++; // stays QUEUED; retried next run until the age cap
    }
  }
  return { sent, failed, stillQueued };
}
