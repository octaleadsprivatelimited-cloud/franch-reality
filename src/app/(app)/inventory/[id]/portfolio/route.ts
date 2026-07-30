import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import {
  loadPortfolioLogo,
  PortfolioImagesUnavailableError,
  portfolioPdfFilename,
  renderPropertyPortfolioPdf,
} from "@/lib/pdf/property-portfolio-service";

// Generates the Property Specification Portfolio PDF for one property, on demand.
// Re-checks auth + city scope (mirrors /api/attachments), embeds the property's
// uploaded photos (normalizing JPEG/PNG/GIF/WebP for reliable embedding), renders the
// type-aware document server-side and streams it back as a download.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const property = await prisma.property.findFirst({
    where: { id, deletedAt: null },
    include: {
      locality: true,
      attachments: { orderBy: { uploadedAt: "asc" } },
    },
  });
  if (!property) return new NextResponse("Not found", { status: 404 });

  // City scope: an agent may only generate portfolios for properties in their cities.
  if (user.role === "AGENT" && !user.cities.includes(property.city)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const logo = await loadPortfolioLogo();
  let rendered;
  try {
    rendered = await renderPropertyPortfolioPdf({ property, user, logo });
  } catch (error) {
    if (error instanceof PortfolioImagesUnavailableError) {
      return new NextResponse(error.message, { status: 502 });
    }
    return new NextResponse("Could not generate the portfolio PDF.", { status: 500 });
  }

  // Best-effort audit — never block the download if the audit write fails.
  try {
    await writeAudit({
      userId: user.id,
      action: "Portfolio PDF downloaded",
      entityType: "Property",
      entityId: property.id,
      after: {
        fileNo: property.fileNo,
        imageCandidates: rendered.imageCandidates,
        imagesEmbedded: rendered.imagesEmbedded,
        documentsListed: rendered.documentsListed,
      },
    });
  } catch {
    /* ignore */
  }

  const filename = portfolioPdfFilename(property.fileNo);
  return new NextResponse(new Uint8Array(rendered.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
