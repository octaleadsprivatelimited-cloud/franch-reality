import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth-helpers";
import { buildTemplateWorkbook } from "@/lib/import/book1";

// Downloads the clean .xlsx import template (admin only).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (user.role !== "ADMIN") return new NextResponse("Forbidden", { status: 403 });

  const wb = await buildTemplateWorkbook();
  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return new NextResponse(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="franch-inventory-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
