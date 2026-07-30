import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { Prisma, type MessageStatus, type MessageType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env, whatsappConfigured } from "@/lib/env";
import { normalizePhone } from "@/lib/whatsapp/phone";

// WhatsApp Business Cloud API webhook: Meta sends customer replies and delivery/
// read status callbacks here. GET handles the verification handshake; POST verifies
// the X-Hub-Signature-256 (when an app secret is set), then appends inbound messages
// to the matching active conversation and patches outbound message statuses.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface WAMessage {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
  image?: { caption?: string };
  document?: { caption?: string };
}
interface WAStatus {
  id?: string;
  status?: string;
}
interface WAPayload {
  entry?: { changes?: { value?: { messages?: WAMessage[]; statuses?: WAStatus[] } }[] }[];
}

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const mode = sp.get("hub.mode");
  const token = sp.get("hub.verify_token");
  const challenge = sp.get("hub.challenge");
  if (mode === "subscribe" && token && env.WHATSAPP_VERIFY_TOKEN && safeEq(token, env.WHATSAPP_VERIFY_TOKEN)) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

function verifySignature(raw: string, signature: string | null): boolean {
  const secret = env.WHATSAPP_APP_SECRET;
  // A valid signature is always required once the endpoint is live (POST is gated
  // behind whatsappConfigured below, so reaching here without a secret = misconfig).
  if (!secret) return false;
  if (!signature) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

const MSG_TYPES: MessageType[] = ["TEXT", "IMAGE", "DOCUMENT", "AUDIO"];
// Status rank — only ever advance a message's status (callbacks arrive out of order).
const STATUS_RANK: Record<string, number> = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 3, RECEIVED: 3 };

const MAX_BODY = 1024 * 1024; // 1 MB

export async function POST(req: Request) {
  // Endpoint is inert until WhatsApp is configured — no abuse window pre-launch.
  if (!whatsappConfigured) return new NextResponse("not found", { status: 404 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return new NextResponse("payload too large", { status: 413 });
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("invalid signature", { status: 401 });
  }
  let payload: WAPayload;
  try {
    payload = JSON.parse(raw) as WAPayload;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Each message/status is handled in isolation: one bad item can't abort the
  // whole batch and trigger a Meta redelivery storm. We always 200 so Meta
  // doesn't re-send already-processed items.
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      for (const m of value.messages ?? []) {
        try {
          await handleInbound(m);
        } catch (e) {
          // P2002 = redelivery of an already-stored message → ignore silently.
          if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) {
            console.error("whatsapp inbound error", e);
          }
        }
      }
      for (const st of value.statuses ?? []) {
        try {
          await handleStatus(st);
        } catch (e) {
          console.error("whatsapp status error", e);
        }
      }
    }
  }
  return NextResponse.json({ ok: true });
}

async function handleInbound(m: WAMessage): Promise<void> {
  const from = normalizePhone(m.from);
  if (!from) return;
  const conv = await prisma.conversation.findFirst({
    where: { status: "ACTIVE", customerPhone: from },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true },
  });
  if (!conv) return;

  const upper = String(m.type ?? "text").toUpperCase();
  const type: MessageType = MSG_TYPES.includes(upper as MessageType) ? (upper as MessageType) : "OTHER";
  const body =
    (m.text?.body ?? m.image?.caption ?? m.document?.caption ?? m.button?.text ?? null)?.slice(0, 4096) ?? null;

  // The waMessageId @unique dedupes redeliveries (the caller ignores P2002).
  await prisma.message.create({
    data: {
      conversationId: conv.id,
      direction: "INBOUND",
      type,
      body,
      waMessageId: m.id ?? null,
      status: "RECEIVED",
      rawJson: m as unknown as Prisma.InputJsonValue,
    },
  });
  await prisma.conversation.update({
    where: { id: conv.id },
    data: {
      lastMessageAt: new Date(),
      // A customer reply (re)opens the 24h free-form messaging window.
      customerWindowExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
}

async function handleStatus(st: WAStatus): Promise<void> {
  const wamid = st.id;
  const upper = String(st.status ?? "").toUpperCase();
  if (!wamid || !["SENT", "DELIVERED", "READ", "FAILED"].includes(upper)) return;
  const msg = await prisma.message.findUnique({
    where: { waMessageId: wamid },
    select: { id: true, status: true },
  });
  if (!msg) return;
  // Only advance (callbacks arrive out of order); FAILED always applies.
  if (upper !== "FAILED" && (STATUS_RANK[upper] ?? 0) <= (STATUS_RANK[msg.status] ?? 0)) return;
  await prisma.message.update({
    where: { id: msg.id },
    data: { status: upper as MessageStatus, statusUpdatedAt: new Date() },
  });
}
