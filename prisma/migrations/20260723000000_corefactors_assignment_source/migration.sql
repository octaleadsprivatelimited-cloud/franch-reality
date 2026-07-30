-- Track whether an internal lead assignment mirrors Corefactors, came from the
-- local round robin, or was set manually. This lets a later Corefactors sync
-- replace only Corefactors-owned state without disturbing intentional local work.
CREATE TYPE "AssignmentSource" AS ENUM ('COFACTORS', 'ROUND_ROBIN', 'MANUAL');

ALTER TABLE "leads" ADD COLUMN "assignmentSource" "AssignmentSource";

-- Assignments created before this migration came from the platform's existing
-- even-load/manual workflow. Treat them as round-robin until an upstream owner is
-- matched during the next Corefactors pull.
UPDATE "leads"
SET "assignmentSource" = 'ROUND_ROBIN'
WHERE "assignedAgentId" IS NOT NULL;

CREATE INDEX "leads_assignmentSource_idx" ON "leads"("assignmentSource");
