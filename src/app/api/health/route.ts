import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Liveness/readiness probe for Azure Container Apps. Confirms the process is up AND
// can reach the database. Public (the proxy matcher excludes /api).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "ok" });
  } catch {
    return NextResponse.json({ ok: false, db: "error" }, { status: 503 });
  }
}
