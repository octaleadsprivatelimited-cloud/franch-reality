import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { processWhatsappOutbox } from "@/lib/whatsapp/conversations";

// Retry worker endpoint for QUEUED outbound WhatsApp messages. Outside the auth
// group; enforces its own CRON_SECRET (Bearer header only). A scheduled ACA job
// hits this every few minutes. No-ops cleanly while WhatsApp is unconfigured.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const sha256 = (s: string) => createHash("sha256").update(s).digest();

function authorized(req: Request): boolean {
  const presented = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!presented) return false;
  return timingSafeEqual(sha256(presented), sha256(env.CRON_SECRET));
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await processWhatsappOutbox();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Outbox processing failed" },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
