-- Agent self-service assignment workflow: a per-agent working status + feedback note
-- on each lead, and a record of agent-initiated "unassign with reason" returns that
-- admins act on. All additive (defaulted column / new nullable column / new table).

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM (
  'NEW', 'ATTEMPTED', 'CONTACTED', 'SITE_VISIT_SCHEDULED', 'VISITED', 'NEGOTIATING', 'CLOSED_WON', 'CLOSED_LOST'
);

-- AlterTable: agent's working status (defaulted for existing rows) + free-text feedback.
ALTER TABLE "leads" ADD COLUMN     "assignmentStatus" "AssignmentStatus" NOT NULL DEFAULT 'NEW';
ALTER TABLE "leads" ADD COLUMN     "assignmentNote" TEXT;

-- CreateTable: agent-initiated lead returns (unassigned with reason).
CREATE TABLE "lead_unassignments" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissedAt" TIMESTAMP(3),
    "dismissedById" TEXT,

    CONSTRAINT "lead_unassignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_unassignments_dismissedAt_createdAt_idx" ON "lead_unassignments"("dismissedAt", "createdAt");
CREATE INDEX "lead_unassignments_leadId_idx" ON "lead_unassignments"("leadId");

-- AddForeignKey
ALTER TABLE "lead_unassignments" ADD CONSTRAINT "lead_unassignments_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_unassignments" ADD CONSTRAINT "lead_unassignments_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_unassignments" ADD CONSTRAINT "lead_unassignments_dismissedById_fkey"
  FOREIGN KEY ("dismissedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
