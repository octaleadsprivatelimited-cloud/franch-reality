-- CreateTable
CREATE TABLE "_AgentAssignedAreas" (
    "A" INTEGER NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AgentAssignedAreas_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_AgentAssignedAreas_B_index" ON "_AgentAssignedAreas"("B");

-- AddForeignKey
ALTER TABLE "_AgentAssignedAreas" ADD CONSTRAINT "_AgentAssignedAreas_A_fkey" FOREIGN KEY ("A") REFERENCES "localities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AgentAssignedAreas" ADD CONSTRAINT "_AgentAssignedAreas_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
