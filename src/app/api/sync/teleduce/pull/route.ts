import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runTeleducePull } from "@/lib/teleduce/sync";
import { processPendingWritebacks } from "@/lib/teleduce/writeback";

// A scheduled job hits this every 30 minutes for
// archive reconciliation + writeback retries. It is OUTSIDE the (app) auth group
// and the proxy matcher, so it enforces its own CRON_SECRET via the
// `Authorization: Bearer <CRON_SECRET>` header ONLY (never a query-string secret —
// query strings leak into access logs/Referer).
export const runtime = "nodejs"; // node:crypto.timingSafeEqual
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const sha256 = (s: string) => createHash("sha256").update(s).digest();

function authorized(req: Request): boolean {
  const presented = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!presented) return false;
  // Hash both sides to fixed-length buffers → constant-time, length-agnostic compare.
  return timingSafeEqual(sha256(presented), sha256(env.CRON_SECRET));
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const pull = await runTeleducePull();
    const writeback = await processPendingWritebacks();
    return NextResponse.json({ ok: true, pull, writeback });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Sync failed" },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
