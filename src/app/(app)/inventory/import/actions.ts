"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { parseBook1, type ImportPreview, type MappedProperty } from "@/lib/import/book1";

export interface PreviewState {
  error?: string;
  preview?: ImportPreview;
  /** Server-side staging id; the commit step references this instead of resending rows. */
  batchId?: string;
}

async function loadLocalities() {
  return prisma.locality.findMany({ select: { id: true, name: true, city: true } });
}

export async function previewImportAction(
  _prev: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  const admin = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Please choose an .xlsx file." };
  if (file.size > 10 * 1024 * 1024) return { error: "File must be 10 MB or smaller." };
  const buffer = Buffer.from(await file.arrayBuffer());
  const localities = await loadLocalities();
  try {
    const preview = await parseBook1(buffer, localities);
    // Stage the committable rows server-side; the commit step references the batch
    // by id, so rows are never round-tripped through (and tamperable in) the client.
    const rows = preview.validRows.map((r) => r.mapped);
    const batch = await prisma.importBatch.create({
      data: { createdById: admin.id, rowsJson: rows as unknown as Prisma.InputJsonValue },
    });
    return { preview, batchId: batch.id };
  } catch {
    return { error: "Could not read the spreadsheet. Make sure it is a valid .xlsx file." };
  }
}

// Server-side re-validation of the previewed rows (never trust the client payload).
const mappedSchema = z.object({
  fileNo: z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/),
  city: z.enum(["HYDERABAD", "CHENNAI"]),
  localityId: z.number().int().positive(),
  transactionType: z.enum(["SALE", "RENT"]),
  propertyType: z.enum(["APARTMENT", "VILLA", "PLOT", "COMMERCIAL"]),
  commercialOrResidential: z.enum(["RESIDENTIAL", "COMMERCIAL"]),
  // .default(null) so a batch staged just before this field shipped still commits.
  buildingClassification: z.enum(["GATED_COMMUNITY", "STAND_ALONE", "COMMERCIAL"]).nullable().default(null),
  bhk: z.number().int().min(1).max(20).nullable(),
  builtUpAreaSqft: z.number().int().positive().max(1_000_000).nullable(),
  secondaryAreaSqft: z.number().int().positive().max(1_000_000).nullable(),
  facing: z.string().max(40).nullable(),
  floor: z.string().max(40).nullable(),
  parkingCount: z.number().int().min(0).max(50).nullable(),
  priceInr: z.number().positive(),
  priceUnit: z.enum(["LAKH", "CRORE", "PER_MONTH"]),
  maintenanceAmount: z.number().min(0).max(10_000_000).nullable(),
  ageYears: z.number().int().min(0).max(200).nullable(),
  furnishing: z.enum(["UNFURNISHED", "SEMI_FURNISHED", "FURNISHED"]).nullable(),
  featuresText: z.string().max(4000).nullable(),
  additionalFeatures: z.array(z.string().max(120)).max(30),
  availabilityStatus: z.enum(["AVAILABLE", "BOOKED", "SOLD", "RENTED"]),
  builderDeveloperName: z.string().max(120).nullable(),
  description: z.string().max(4000).nullable(),
});

export interface CommitState {
  error?: string;
  result?: { created: number; updated: number; skipped: number };
}

const CHUNK = 50;

export async function commitImportAction(
  _prev: CommitState,
  formData: FormData,
): Promise<CommitState> {
  const admin = await requireAdmin();

  const batchId = String(formData.get("batchId") ?? "");
  if (!batchId) return { error: "Could not find the import to commit. Run the dry-run preview again." };
  // Load the staged rows by id (and confirm the same admin staged them) — the rows
  // never come from the client, so they can't be tampered with between preview and commit.
  const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
  if (!batch || batch.createdById !== admin.id) {
    return { error: "Import session not found or expired — re-run the dry-run preview." };
  }
  const arr = z.array(mappedSchema).safeParse(batch.rowsJson);
  if (!arr.success) {
    return { error: "Some rows failed server-side validation — re-run the dry-run preview." };
  }

  // Keep-newest within the payload (last occurrence of a FILE NO wins).
  const byFileNo = new Map<string, MappedProperty>();
  for (const r of arr.data) byFileNo.set(r.fileNo, r as MappedProperty);
  const rows = [...byFileNo.values()];
  if (rows.length === 0) return { result: { created: 0, updated: 0, skipped: 0 } };

  // Re-verify each row's locality belongs to its city.
  const localities = await loadLocalities();
  const validLoc = new Set(localities.map((l) => `${l.city}:${l.id}`));

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await prisma.$transaction(async (tx) => {
      for (const m of chunk) {
        if (!validLoc.has(`${m.city}:${m.localityId}`)) {
          skipped++;
          continue;
        }
        const data = {
          city: m.city,
          localityId: m.localityId,
          transactionType: m.transactionType,
          propertyType: m.propertyType,
          commercialOrResidential: m.commercialOrResidential,
          buildingClassification: m.buildingClassification,
          bhk: m.bhk,
          builtUpAreaSqft: m.builtUpAreaSqft,
          secondaryAreaSqft: m.secondaryAreaSqft,
          facing: m.facing,
          floor: m.floor,
          parkingCount: m.parkingCount,
          priceInr: m.priceInr,
          priceUnit: m.priceUnit,
          maintenanceAmount: m.maintenanceAmount,
          ageYears: m.ageYears,
          furnishing: m.furnishing,
          featuresText: m.featuresText,
          additionalFeatures: m.additionalFeatures,
          availabilityStatus: m.availabilityStatus,
          builderDeveloperName: m.builderDeveloperName,
          description: m.description,
        };
        const existing = await tx.property.findUnique({
          where: { fileNo: m.fileNo },
          select: { id: true, deletedAt: true },
        });
        if (existing) {
          // Keep-newest: the import is the latest data → overwrite + audit the change
          // (note if it resurrected a soft-deleted row).
          await tx.property.update({ where: { fileNo: m.fileNo }, data: { ...data, deletedAt: null } });
          await writeAudit(
            {
              userId: admin.id,
              action: "Property updated (import)",
              entityType: "Property",
              entityId: existing.id,
              after: { fileNo: m.fileNo, restored: existing.deletedAt != null },
            },
            tx,
          );
          updated++;
        } else {
          const c = await tx.property.create({ data: { ...data, fileNo: m.fileNo, createdById: admin.id } });
          await writeAudit(
            { userId: admin.id, action: "Property created (import)", entityType: "Property", entityId: c.id, after: { fileNo: m.fileNo } },
            tx,
          );
          created++;
        }
      }
    }, { timeout: 60_000 });
  }

  await writeAudit({
    userId: admin.id,
    action: "Inventory import committed",
    entityType: "Property",
    after: { created, updated, skipped },
  });

  // One-shot: drop the staged batch so it can't be re-committed.
  await prisma.importBatch.delete({ where: { id: batchId } }).catch(() => {});

  revalidatePath("/inventory");
  return { result: { created, updated, skipped } };
}
