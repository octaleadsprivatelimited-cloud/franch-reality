-- DropIndex
DROP INDEX "users_email_idx";

-- CreateIndex
CREATE INDEX "audit_log_userId_idx" ON "audit_log"("userId");

-- CreateIndex
CREATE INDEX "leads_updatedAt_idx" ON "leads"("updatedAt");

-- CreateIndex
CREATE INDEX "matches_teleduceWritebackStatus_teleduceWritebackNextRetryA_idx" ON "matches"("teleduceWritebackStatus", "teleduceWritebackNextRetryAt");

-- CreateIndex
CREATE INDEX "sync_log_syncType_status_finishedAt_idx" ON "sync_log"("syncType", "status", "finishedAt");
