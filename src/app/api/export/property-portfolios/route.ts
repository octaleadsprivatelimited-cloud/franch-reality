import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { type DeleteSelection } from "@/lib/bulk-delete";
import { propertySelectionWhere, SELECTION_ORDER } from "@/lib/bulk-where";
import { MAX_BULK_PORTFOLIOS } from "@/lib/portfolio-export";
import {
  loadPortfolioLogo,
  portfolioPdfFilename,
  renderPropertyPortfolioPdf,
} from "@/lib/pdf/property-portfolio-service";
import { createStoredZipStream } from "@/lib/zip-stream";
import { writeAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validSelection(value: unknown): value is DeleteSelection {
  if (!value || typeof value !== "object") return false;
  const selection = value as Partial<DeleteSelection>;
  if (selection.mode === "ids") {
    return Array.isArray(selection.ids) && selection.ids.every((id) => typeof id === "string");
  }
  return (
    selection.mode === "filter" &&
    Boolean(selection.params) &&
    typeof selection.params === "object" &&
    Array.isArray(selection.excluded) &&
    selection.excluded.every((id) => typeof id === "string")
  );
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  let selection: DeleteSelection;
  try {
    const body: unknown = await req.json();
    if (!validSelection(body)) throw new Error("Invalid selection");
    selection = body;
  } catch {
    return new NextResponse("Select one or more properties and try again.", { status: 400 });
  }

  const properties = await prisma.property.findMany({
    where: propertySelectionWhere(user, selection),
    take: MAX_BULK_PORTFOLIOS + 1,
    orderBy: SELECTION_ORDER,
    include: {
      locality: true,
      attachments: { orderBy: { uploadedAt: "asc" } },
    },
  });
  if (properties.length === 0) {
    return new NextResponse("No accessible properties were found in this selection.", {
      status: 404,
    });
  }
  if (properties.length > MAX_BULK_PORTFOLIOS) {
    return new NextResponse(
      `Select ${MAX_BULK_PORTFOLIOS} or fewer properties for one portfolio download.`,
      { status: 413 },
    );
  }

  const logo = await loadPortfolioLogo();
  const now = new Date();
  const metrics: Array<{ id: string; fileNo: string; imagesEmbedded: number }> = [];
  const stream = createStoredZipStream(
    properties.map((property) => ({
      name: portfolioPdfFilename(property.fileNo),
      data: async () => {
        const result = await renderPropertyPortfolioPdf({ property, user, logo, now });
        metrics.push({
          id: property.id,
          fileNo: property.fileNo,
          imagesEmbedded: result.imagesEmbedded,
        });
        return new Uint8Array(result.pdf);
      },
    })),
    async () => {
      try {
        await writeAudit({
          userId: user.id,
          action: "Bulk portfolio PDFs downloaded",
          entityType: "Property",
          after: {
            propertyCount: metrics.length,
            properties: metrics,
          },
        });
      } catch {
        // A completed export must not be invalidated by a best-effort audit write.
      }
    },
  );

  const stamp = now.toISOString().slice(0, 10);
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="Property-Portfolios-${stamp}.zip"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
