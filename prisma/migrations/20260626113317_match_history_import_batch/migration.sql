-- CreateTable
CREATE TABLE "match_history" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "status" "MatchStatus" NOT NULL,
    "statusReason" TEXT,
    "band" INTEGER NOT NULL,
    "changedById" TEXT,
    "criteriaSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "rowsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "match_history_matchId_createdAt_idx" ON "match_history"("matchId", "createdAt");

-- CreateIndex
CREATE INDEX "import_batches_createdById_createdAt_idx" ON "import_batches"("createdById", "createdAt");

-- AddForeignKey
ALTER TABLE "match_history" ADD CONSTRAINT "match_history_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
