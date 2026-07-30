import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

// POST /api/notifications/mark-read
// Body: { ids: string[] } — mark specific notifications read.
// Body: { all: true }    — mark all unread as read.
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  if (body.all === true) {
    const { count } = await prisma.notification.updateMany({
      where: { isRead: false },
      data: { isRead: true },
    });
    return NextResponse.json({ updated: count });
  }

  const ids: string[] = Array.isArray(body.ids) ? body.ids : [];
  if (!ids.length) return NextResponse.json({ updated: 0 });

  const { count } = await prisma.notification.updateMany({
    where: { id: { in: ids } },
    data: { isRead: true },
  });
  return NextResponse.json({ updated: count });
}
