-- Suppression list for permanently-deleted leads: their Teleduce id is remembered so
-- the pull/webhook never re-create them. Additive (new table only).

-- CreateTable
CREATE TABLE "deleted_teleduce_leads" (
    "teleduceLeadId" TEXT NOT NULL,
    "deletedById" TEXT,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deleted_teleduce_leads_pkey" PRIMARY KEY ("teleduceLeadId")
);

-- AddForeignKey
ALTER TABLE "deleted_teleduce_leads" ADD CONSTRAINT "deleted_teleduce_leads_deletedById_fkey"
  FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
