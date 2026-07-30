import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { mapRawLeadToTeleduceLead } from "@/lib/teleduce/corefactors-client";
import { upsertTeleduceLead, buildLocalityIndex, leadNotificationData } from "@/lib/teleduce/sync";
import { writeAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { buildCorefactorsOwnerIndex } from "@/lib/leads/corefactors-owner";

// Real-time lead webhook for Corefactors / Teleduce. When a lead is created or
// updated in the CRM, Corefactors POSTs it here and we map + upsert it through the
// SAME pipeline as the scheduled pull (idempotent by teleduceLeadId), so changes
// reflect in the platform within seconds instead of waiting for a poll.
//
// Authenticated by a shared secret supplied in the URL (?token=…) — or an
// X-Webhook-Token / Authorization: Bearer header — since the provider configures a
// single static callback URL. Fails closed if no secret is configured.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function authorized(req: Request): boolean {
  const secret = env.TELEDUCE_WEBHOOK_SECRET;
  if (!secret) return false; // not configured → refuse (fail closed)
  // Header methods are preferred (a query token lands in access logs); kept for
  // providers that can only configure a static callback URL. All compared timing-safe.
  const header = req.headers.get("x-webhook-token");
  const auth = req.headers.get("authorization");
  const bearer = auth && /^bearer /i.test(auth) ? auth.slice(7).trim() : null;
  const token = new URL(req.url).searchParams.get("token");
  for (const candidate of [header, bearer, token]) {
    if (candidate && safeEq(candidate, secret)) return true;
  }
  return false;
}

/** Pull lead row(s) out of whatever envelope Corefactors sends. */
function extractRows(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    for (const key of ["response", "data", "leads", "lead", "records", "record"]) {
      const v = o[key];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
      if (v && typeof v === "object") return [v as Record<string, unknown>];
    }
    return [o]; // the body itself is a single lead row
  }
  return [];
}

// Health / verification probe — echoes a challenge param if the provider sends one.
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const challenge = sp.get("challenge") ?? sp.get("hub.challenge");
  // Only reflect a challenge to an authenticated caller (no open reflector), bounded.
  if (challenge && authorized(req)) return new NextResponse(challenge.slice(0, 512), { status: 200 });
  return NextResponse.json({ ok: true, service: "teleduce-lead-webhook" });
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const rows = extractRows(body);
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const failedSamples: { error: string; id: string; fields: string[] }[] = [];
  // Dedupe repeats within a single payload so the same lead id delivered twice yields
  // exactly one notification and one "created" (mirrors the pull's `seen` guard).
  const seen = new Set<string>();

  try {
    const [index, ownerIndex] = await Promise.all([
      buildLocalityIndex(prisma),
      buildCorefactorsOwnerIndex(prisma),
    ]);
    // Use the DATABASE clock as the "created this request" reference so created-vs-
    // updated (createdAt >= reference) is compared against the same clock that stamps
    // createdAt — an app/DB clock skew must not silently drop a real-time new-lead notify.
    const [{ now }] = await prisma.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
    // Ids an admin permanently deleted — never re-create them from a webhook either.
    const suppressed = new Set(
      (await prisma.deletedTeleduceLead.findMany({ select: { teleduceLeadId: true } })).map(
        (r) => r.teleduceLeadId,
      ),
    );
    for (const row of rows) {
      try {
        const tlead = mapRawLeadToTeleduceLead(row);
        const { outcome, lead } = await upsertTeleduceLead(
          prisma,
          tlead,
          index,
          now,
          ownerIndex,
          true,
          suppressed,
        );
        if (outcome === "skipped") {
          skipped++;
        } else {
          const firstTime = !seen.has(tlead.teleduceLeadId);
          seen.add(tlead.teleduceLeadId);
          if (outcome === "created" && firstTime) {
            created++;
            // Emit a notification for every new lead so admins are alerted in real time
            // and it lands in the 90-day notification history. Best-effort: a
            // notification write must never fail the webhook delivery (→ provider retry).
            if (lead) {
              try {
                await prisma.notification.create({ data: leadNotificationData(lead, "webhook") });
              } catch {
                /* non-critical — never fail the webhook on a notification write */
              }
            }
          } else {
            // "updated", or a repeat of an id already handled in this payload.
            updated++;
          }
        }
      } catch (e) {
        failed++;
        // Capture a few failed rows so the FIRST real deliveries are debuggable if
        // Corefactors' push payload shape differs from the retrieval API's.
        if (failedSamples.length < 3) {
          // Redacted: capture only the lead id + which fields were present (NOT the
          // PII values) so a shape mismatch is debuggable without storing PII.
          failedSamples.push({
            error: e instanceof Error ? e.message : String(e),
            id: String(row["ID"] ?? row["id"] ?? "?"),
            fields: Object.keys(row),
          });
        }
      }
    }
  } catch (e) {
    // Infra-level failure (e.g. DB) → 500 so the provider retries the delivery.
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "processing error" },
      { status: 500 },
    );
  }

  try {
    await writeAudit({
      userId: null,
      action: "Teleduce lead webhook",
      entityType: "Sync",
      after: {
        received: rows.length,
        created,
        updated,
        skipped,
        failed,
        ...(failedSamples.length ? { failedSamples } : {}),
      },
    });
  } catch {
    /* never fail the webhook on an audit error */
  }

  return NextResponse.json({ ok: true, received: rows.length, created, updated, skipped, failed });
}
