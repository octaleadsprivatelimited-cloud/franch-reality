import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

// Lightweight message feed for the chat panel's poll (so inbound replies appear
// without a full page refresh / re-running the matching engine). RBAC: the owning
// agent or any admin.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const conv = await prisma.conversation.findUnique({ where: { id }, select: { agentId: true } });
  if (!conv) return new NextResponse("Not found", { status: 404 });
  if (user.role !== "ADMIN" && conv.agentId !== user.id) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const messages = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "asc" },
    take: 300,
    select: { id: true, direction: true, type: true, body: true, status: true, createdAt: true },
  });
  return NextResponse.json(
    { messages: messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
