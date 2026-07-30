-- AlterTable
ALTER TABLE "matches" ADD COLUMN     "teleduceWritebackAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "teleduceWritebackNextRetryAt" TIMESTAMP(3);
