import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getObjectBytes } from "@/lib/storage";

// Authenticated attachment serving (fixes the public-bucket exposure). Every
// fetch re-checks the signed-in user AND city scope on the owning property, then
// streams the bytes from the (private) bucket. A restrictive CSP + a forced
// download for non-images neutralises any smuggled active content.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  // `?preview=1` serves a PDF INLINE (for the in-app document viewer) instead of
  // forcing a download. Still authenticated + city-scoped, and the response keeps the
  // sandbox CSP + nosniff, so a smuggled script can't execute. Only PDFs are opted in;
  // every other non-image type stays a forced download.
  const preview = new URL(req.url).searchParams.get("preview") === "1";

  const { id } = await params;
  const att = await prisma.propertyAttachment.findUnique({
    where: { id },
    include: { property: { select: { city: true, deletedAt: true } } },
  });
  if (!att || att.property.deletedAt) {
    return new NextResponse("Not found", { status: 404 });
  }
  // City scope: an agent may only read attachments for properties in their cities.
  if (user.role === "AGENT" && !user.cities.includes(att.property.city)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  let bytes: Uint8Array;
  let contentType: string | undefined;
  try {
    ({ bytes, contentType } = await getObjectBytes(att.r2Key));
  } catch {
    return new NextResponse("File unavailable", { status: 502 });
  }

  const isImage = att.mimeType.startsWith("image/");
  const isPdf = att.mimeType === "application/pdf";
  const inline = isImage || (preview && isPdf);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": contentType ?? att.mimeType ?? "application/octet-stream",
      // RFC 6266: a quote/CR/LF-stripped ASCII fallback + a UTF-8 filename* so
      // non-ASCII names work and a quote in the name can't break out of the header.
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${att.originalFilename.replace(
        /["\\\r\n]/g,
        "_",
      )}"; filename*=UTF-8''${encodeURIComponent(att.originalFilename)}`,
      "Cache-Control": "private, max-age=300",
      // A PDF opened in the in-app preview iframe must NOT be sandboxed, or the browser's
      // native PDF viewer renders blank (this broke preview in every browser). We still
      // block external embedding with `frame-ancestors 'self'`, and the correct
      // Content-Type + `nosniff` stop the bytes from ever being interpreted as HTML/JS.
      // Every other response keeps the strict `default-src 'none'; sandbox` lockdown.
      "Content-Security-Policy":
        inline && isPdf ? "frame-ancestors 'self'" : "default-src 'none'; sandbox; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
