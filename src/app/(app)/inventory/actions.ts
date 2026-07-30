"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AttachmentKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  requireUser,
  requireAdmin,
  assertCityAccess,
  ForbiddenError,
} from "@/lib/auth-helpers";
import { propertyInputSchema } from "@/lib/validation/property";
import { toInr } from "@/lib/domain";
import { writeAudit } from "@/lib/audit";
import { putObject, deleteObject, sniffMime } from "@/lib/storage";
import { type DeleteSelection, MAX_BULK } from "@/lib/bulk-delete";
import { propertySelectionWhere, SELECTION_ORDER } from "@/lib/bulk-where";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_DOC_BYTES = 20 * 1024 * 1024; // 20 MB

export interface FormState {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

// Convert FormData to a plain object, turning "" into undefined so optional
// coerced-number fields validate correctly.
function formObject(formData: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v !== "string") continue;
    if (k === "additionalFeatures") {
      obj[k] = v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      obj[k] = v === "" ? undefined : v;
    }
  }
  if (!("additionalFeatures" in obj)) obj.additionalFeatures = [];
  return obj;
}

function zodToFieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? "_");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Validate + store one uploaded file as a property attachment (sniff real MIME,
 * size-limit, put to storage, create row + audit atomically). Returns an error
 * string for a bad file, or null on success. Shared by the create flow and the
 * post-create upload action.
 */
async function persistPropertyMedia(
  propertyId: string,
  file: File,
  kindRaw: string,
  userId: string,
): Promise<string | null> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const realType = sniffMime(buffer);
  if (!realType) return `"${file.name}": only JPEG/PNG/GIF/WebP images or PDF documents are allowed.`;
  const isImage = realType.startsWith("image/");
  if (isImage && file.size > MAX_IMAGE_BYTES) return `"${file.name}": images must be 5 MB or smaller.`;
  if (!isImage && file.size > MAX_DOC_BYTES) return `"${file.name}": documents must be 20 MB or smaller.`;

  const kind: AttachmentKind = isImage
    ? "IMAGE"
    : ["BROCHURE", "FLOORPLAN", "OTHER"].includes(kindRaw)
      ? (kindRaw as AttachmentKind)
      : "BROCHURE";
  // Use a UUID + a type-derived extension for the storage key — never the
  // user-supplied filename (kept only in originalFilename). Avoids any path /
  // virtual-directory tricks in the object key.
  const ext =
    realType === "application/pdf"
      ? "pdf"
      : realType === "image/png"
        ? "png"
        : realType === "image/webp"
          ? "webp"
          : realType === "image/gif"
            ? "gif"
            : realType === "image/jpeg"
              ? "jpg"
              : "bin";
  const key = `properties/${propertyId}/${randomUUID()}.${ext}`;

  await putObject(key, buffer, realType);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.propertyAttachment.create({
        data: { propertyId, kind, r2Key: key, originalFilename: file.name, mimeType: realType, sizeBytes: file.size },
      });
      await writeAudit(
        { userId, action: "Attachment uploaded", entityType: "Property", entityId: propertyId, after: { filename: file.name, kind } },
        tx,
      );
    });
  } catch (e) {
    await deleteObject(key).catch(() => {});
    throw e;
  }
  return null;
}

// Shared data-builder for create/update (excludes fileNo/city handled separately).
function propertyData(data: z.infer<typeof propertyInputSchema>) {
  return {
    reraId: data.reraId ?? null,
    transactionType: data.transactionType,
    propertyType: data.propertyType,
    commercialOrResidential: data.commercialOrResidential,
    buildingClassification: data.buildingClassification ?? null,
    bhk: data.bhk ?? null,
    builtUpAreaSqft: data.builtUpAreaSqft ?? null,
    secondaryAreaSqft: data.secondaryAreaSqft ?? null,
    facing: data.facing ?? null,
    floor: data.floor ?? null,
    parkingCount: data.parkingCount ?? null,
    priceInr: toInr(data.priceAmount, data.priceUnit),
    priceUnit: data.priceUnit,
    maintenanceAmount: data.maintenanceAmount ?? null,
    ageYears: data.ageYears ?? null,
    furnishing: data.furnishing ?? null,
    featuresText: data.featuresText ?? null,
    additionalFeatures: data.additionalFeatures,
    availabilityStatus: data.availabilityStatus,
    builderDeveloperName: data.builderDeveloperName ?? null,
    description: data.description ?? null,
  };
}

export async function createPropertyAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = propertyInputSchema.safeParse(formObject(formData));
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: zodToFieldErrors(parsed.error) };
  }
  const data = parsed.data;

  try {
    assertCityAccess(user, data.city);
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const locality = await prisma.locality.findUnique({ where: { id: data.localityId } });
  if (!locality || locality.city !== data.city) {
    return { error: "Selected locality does not belong to the chosen city.", fieldErrors: { localityId: "Invalid locality" } };
  }

  const existing = await prisma.property.findUnique({ where: { fileNo: data.fileNo } });
  if (existing) {
    return { error: "A property with this file number already exists.", fieldErrors: { fileNo: "Already in use" } };
  }

  // Property create + audit in one transaction → never a state change without its audit row.
  const created = await prisma.$transaction(async (tx) => {
    const c = await tx.property.create({
      data: {
        fileNo: data.fileNo,
        city: data.city,
        localityId: data.localityId,
        createdById: user.id,
        ...propertyData(data),
      },
    });
    await writeAudit(
      { userId: user.id, action: "Property created", entityType: "Property", entityId: c.id, after: { fileNo: c.fileNo, city: c.city } },
      tx,
    );
    return c;
  });

  // Persist any media uploaded with the create form. Each file is best-effort:
  // a single bad/oversized file is skipped (re-addable via the property page)
  // rather than failing the whole property creation.
  const mediaFiles = formData
    .getAll("media")
    .filter((f): f is File => f instanceof File && f.size > 0);
  let mediaFailed = 0;
  for (const file of mediaFiles) {
    try {
      const err = await persistPropertyMedia(created.id, file, "BROCHURE", user.id);
      if (err) mediaFailed++; // bad type / oversize — surfaced on the property page
    } catch {
      mediaFailed++; // storage/db error — property still created
    }
  }

  revalidatePath("/inventory");
  redirect(`/inventory/${created.id}${mediaFailed ? `?mediaFailed=${mediaFailed}` : ""}`);
}

export async function updatePropertyAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const existing = await prisma.property.findFirst({ where: { id, deletedAt: null } });
  if (!existing) return { error: "Property not found." };

  try {
    assertCityAccess(user, existing.city);
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const parsed = propertyInputSchema.safeParse(formObject(formData));
  if (!parsed.success) {
    return { error: "Please fix the highlighted fields.", fieldErrors: zodToFieldErrors(parsed.error) };
  }
  const data = parsed.data;

  try {
    assertCityAccess(user, data.city);
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const locality = await prisma.locality.findUnique({ where: { id: data.localityId } });
  if (!locality || locality.city !== data.city) {
    return { error: "Selected locality does not belong to the chosen city.", fieldErrors: { localityId: "Invalid locality" } };
  }

  if (data.fileNo !== existing.fileNo) {
    const dup = await prisma.property.findUnique({ where: { fileNo: data.fileNo } });
    if (dup) return { error: "A property with this file number already exists.", fieldErrors: { fileNo: "Already in use" } };
  }

  const next = propertyData(data);
  await prisma.$transaction(async (tx) => {
    await tx.property.update({
      where: { id },
      data: { fileNo: data.fileNo, city: data.city, localityId: data.localityId, ...next },
    });
    await writeAudit(
      {
        userId: user.id,
        action: "Property updated",
        entityType: "Property",
        entityId: id,
        before: { availabilityStatus: existing.availabilityStatus, priceInr: existing.priceInr.toString() },
        after: { availabilityStatus: next.availabilityStatus, priceInr: next.priceInr.toString() },
      },
      tx,
    );
  });

  revalidatePath("/inventory");
  revalidatePath(`/inventory/${id}`);
  redirect(`/inventory/${id}`);
}

export async function deletePropertyAction(id: string): Promise<void> {
  const user = await requireAdmin(); // only admins delete
  const existing = await prisma.property.findFirst({
    where: { id, deletedAt: null },
    include: { attachments: { select: { id: true, r2Key: true } } },
  });
  if (!existing) redirect("/inventory");

  // Soft-delete the property and remove its attachment ROWS in one transaction, then
  // best-effort delete the underlying R2 objects so storage isn't orphaned. Match
  // rows are intentionally kept as decision history but excluded from active reads.
  await prisma.$transaction(async (tx) => {
    await tx.property.update({ where: { id }, data: { deletedAt: new Date() } });
    if (existing.attachments.length > 0) {
      await tx.propertyAttachment.deleteMany({ where: { propertyId: id } });
    }
    await writeAudit(
      { userId: user.id, action: "Property deleted", entityType: "Property", entityId: id, before: { fileNo: existing.fileNo } },
      tx,
    );
  });

  await Promise.all(existing.attachments.map((a) => deleteObject(a.r2Key).catch(() => {})));

  revalidatePath("/inventory");
  redirect("/inventory");
}

export async function uploadAttachmentAction(
  propertyId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const property = await prisma.property.findFirst({
    where: { id: propertyId, deletedAt: null },
  });
  if (!property) return { error: "Property not found." };

  try {
    assertCityAccess(user, property.city);
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  // Bulk-capable: the picker allows selecting several files at once. Each is
  // validated + stored independently so one bad/oversized file doesn't sink the
  // rest (the whole batch still shares the Server Action body-size cap).
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  const kindRaw = String(formData.get("kind") ?? "OTHER");
  if (files.length === 0) {
    return { error: "Please choose at least one file to upload." };
  }

  let uploaded = 0;
  const failures: string[] = [];
  for (const file of files) {
    try {
      const err = await persistPropertyMedia(propertyId, file, kindRaw, user.id);
      if (err) failures.push(err);
      else uploaded++;
    } catch {
      failures.push(`"${file.name}": couldn't be uploaded — please retry.`);
    }
  }

  revalidatePath(`/inventory/${propertyId}`);
  if (uploaded === 0) return { error: failures[0] ?? "Upload failed." };
  if (failures.length > 0) {
    return {
      ok: true,
      error: `Uploaded ${uploaded} file${uploaded === 1 ? "" : "s"}. ${failures.length} skipped: ${failures.join(" ")}`,
    };
  }
  return { ok: true };
}

export async function deleteAttachmentAction(attachmentId: string): Promise<{ error?: string } | void> {
  const user = await requireUser();
  const attachment = await prisma.propertyAttachment.findUnique({
    where: { id: attachmentId },
    include: { property: { select: { id: true, city: true } } },
  });
  if (!attachment) return;

  try {
    assertCityAccess(user, attachment.property.city);
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  // Delete the DB row + audit atomically first, then best-effort remove the object.
  await prisma.$transaction(async (tx) => {
    await tx.propertyAttachment.delete({ where: { id: attachmentId } });
    await writeAudit(
      { userId: user.id, action: "Attachment removed", entityType: "Property", entityId: attachment.propertyId, before: { filename: attachment.originalFilename } },
      tx,
    );
  });
  await deleteObject(attachment.r2Key).catch(() => {});

  revalidatePath(`/inventory/${attachment.propertyId}`);
}

// ── Admin bulk PERMANENT delete ───────────────────────────────────────────────────

/**
 * Permanently delete properties (individually or in bulk / all-matching). ADMIN ONLY.
 * Cascades matches + attachment rows; SharedProperty (a RESTRICT FK) is removed first,
 * and the underlying storage blobs are best-effort deleted. Irreversible.
 */
export async function bulkDeletePropertiesAction(
  selection: DeleteSelection,
): Promise<{ ok?: boolean; error?: string; deleted?: number }> {
  const admin = await requireAdmin();
  const where = propertySelectionWhere(admin, selection);

  const count = await prisma.property.count({ where });
  if (count === 0) return { ok: true, deleted: 0 };
  if (count > MAX_BULK) {
    return {
      error: `Too many selected (${count.toLocaleString("en-IN")}). Narrow the filter to ${MAX_BULK.toLocaleString("en-IN")} or fewer, then delete.`,
    };
  }
  const rows = await prisma.property.findMany({ where, select: { id: true }, orderBy: SELECTION_ORDER, take: MAX_BULK });
  const ids = rows.map((r) => r.id);

  let deleted = 0;
  try {
    for (let i = 0; i < ids.length; i += 200) {
      const batch = ids.slice(i, i + 200);
      // Grab the storage keys BEFORE the cascade removes the attachment rows.
      const atts = await prisma.propertyAttachment.findMany({
        where: { propertyId: { in: batch } },
        select: { r2Key: true },
      });
      await prisma.$transaction(async (tx) => {
        // SharedProperty.property is RESTRICT — clear those links so the delete isn't blocked.
        await tx.sharedProperty.deleteMany({ where: { propertyId: { in: batch } } });
        const res = await tx.property.deleteMany({ where: { id: { in: batch } } });
        deleted += res.count;
      });
      // Best-effort blob cleanup — never let a storage hiccup fail the delete.
      await Promise.all(atts.map((a) => deleteObject(a.r2Key).catch(() => {})));
    }
  } catch {
    await writeAudit({
      userId: admin.id,
      action: "Properties permanently deleted (partial — errored)",
      entityType: "Property",
      after: { count: deleted, partial: true },
    });
    revalidatePath("/inventory");
    return { error: `Deletion stopped after ${deleted} due to an error — please retry to remove the rest.`, deleted };
  }

  await writeAudit({
    userId: admin.id,
    action: "Properties permanently deleted",
    entityType: "Property",
    after: { count: deleted },
  });
  revalidatePath("/inventory");
  return { ok: true, deleted };
}
