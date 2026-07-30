-- Round-robin lead assignment: each lead can be auto-assigned to an internal agent
-- (User) for even-load distribution, with admin override. Additive & non-breaking:
-- the column is nullable, existing rows stay unassigned until backfilled/assigned.

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "assignedAgentId" TEXT;
ALTER TABLE "leads" ADD COLUMN     "assignedAt" TIMESTAMP(3);

-- CreateIndex (per-agent load counts + "assigned to agent X" filter)
CREATE INDEX "leads_assignedAgentId_idx" ON "leads"("assignedAgentId");

-- AddForeignKey (deleting/removing a user nulls the assignment rather than blocking)
ALTER TABLE "leads" ADD CONSTRAINT "leads_assignedAgentId_fkey"
  FOREIGN KEY ("assignedAgentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
