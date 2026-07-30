import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { currentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { type DeleteSelection, MAX_BULK } from "@/lib/bulk-delete";
import { leadSelectionWhere, propertySelectionWhere, SELECTION_ORDER } from "@/lib/bulk-where";
import { TEMPLATE_HEADERS } from "@/lib/import/book1";
import {
  cityLabel,
  transactionTypeLabel,
  propertyTypeLabel,
  usageLabel,
  buildingClassificationLabel,
  furnishingLabel,
  availabilityLabel,
  assignmentStatusLabel,
  fromInr,
} from "@/lib/domain";

// Admin-only backup export (.xlsx). POST { mode:"ids"|"filter", ... } so a huge
// "select all matching" selection ships a filter, not thousands of ids. Property
// rows mirror the import template so a backup can be re-imported. Node runtime
// because exceljs buffers the workbook in memory.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const priceUnitLabel: Record<string, string> = { LAKH: "Lakh", CRORE: "Crore", PER_MONTH: "Per Month" };

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ entity: string }> },
) {
  const user = await currentUser();
  if (!user || user.role !== "ADMIN") return new NextResponse("Forbidden", { status: 403 });

  const { entity } = await params;
  let selection: DeleteSelection;
  try {
    selection = (await req.json()) as DeleteSelection;
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }

  const wb = new ExcelJS.Workbook();

  if (entity === "leads") {
    const where = leadSelectionWhere(user, selection);
    const leads = await prisma.lead.findMany({
      where,
      take: MAX_BULK,
      orderBy: SELECTION_ORDER,
      include: {
        assignedAgent: { select: { fullName: true } },
        preferredLocalities: { select: { name: true } },
      },
    });
    const ws = wb.addWorksheet("Leads");
    ws.addRow([
      "Teleduce ID", "First name", "Last name", "Mobile", "Email", "City", "Stage",
      "Assignment status", "Assigned agent", "Budget (₹)", "Transaction", "Property types",
      "BHK", "Preferred areas", "Source", "Owner", "Created", "Last synced",
    ]);
    ws.getRow(1).font = { bold: true };
    for (const l of leads) {
      ws.addRow([
        l.teleduceLeadId ?? "", l.firstName, l.lastName ?? "", l.mobile ?? "", l.email ?? "",
        cityLabel[l.city], l.currentStage, assignmentStatusLabel[l.assignmentStatus],
        l.assignedAgent?.fullName ?? "", l.budgetMax != null ? Number(l.budgetMax) : "",
        l.transactionTypePref ? transactionTypeLabel[l.transactionTypePref] : "",
        l.propertyTypePref.map((t) => propertyTypeLabel[t]).join(", "),
        l.bhkPref.join(", "), l.preferredLocalities.map((p) => p.name).join(", "),
        l.leadSource ?? "", l.leadOwner ?? "",
        l.createdAt.toISOString(), l.lastSyncedAt ? l.lastSyncedAt.toISOString() : "",
      ]);
    }
    ws.columns.forEach((c) => (c.width = 18));
    return xlsx(wb, `leads-backup-${stamp()}.xlsx`);
  }

  if (entity === "properties") {
    const where = propertySelectionWhere(user, selection);
    const props = await prisma.property.findMany({
      where,
      take: MAX_BULK,
      orderBy: SELECTION_ORDER,
      include: { locality: { select: { name: true } } },
    });
    const ws = wb.addWorksheet("Properties");
    // Same columns as the import template → this backup is re-importable.
    ws.addRow([...TEMPLATE_HEADERS]);
    ws.getRow(1).font = { bold: true };
    for (const p of props) {
      ws.addRow([
        p.fileNo, cityLabel[p.city], p.locality.name, transactionTypeLabel[p.transactionType],
        propertyTypeLabel[p.propertyType], usageLabel[p.commercialOrResidential],
        p.buildingClassification ? buildingClassificationLabel[p.buildingClassification] : "",
        p.bhk ?? "", p.builtUpAreaSqft ?? "", p.secondaryAreaSqft ?? "", p.facing ?? "", p.floor ?? "",
        p.parkingCount ?? "", fromInr(Number(p.priceInr), p.priceUnit), priceUnitLabel[p.priceUnit] ?? "",
        p.maintenanceAmount != null ? Number(p.maintenanceAmount) : "", p.ageYears ?? "",
        p.furnishing ? furnishingLabel[p.furnishing] : "", p.additionalFeatures.join(", "),
        p.builderDeveloperName ?? "", availabilityLabel[p.availabilityStatus], p.description ?? "",
      ]);
    }
    ws.columns.forEach((c) => (c.width = 18));
    return xlsx(wb, `properties-backup-${stamp()}.xlsx`);
  }

  return new NextResponse("Not found", { status: 404 });
}

async function xlsx(wb: ExcelJS.Workbook, filename: string): Promise<NextResponse> {
  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buf), {
    headers: {
      "Content-Type": XLSX_TYPE,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
