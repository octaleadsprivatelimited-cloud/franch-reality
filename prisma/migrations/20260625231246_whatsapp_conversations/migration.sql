-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'TEMPLATE', 'IMAGE', 'DOCUMENT', 'AUDIO', 'OTHER');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'RECEIVED');

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endedById" TEXT,
    "customerWindowExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "direction" "MessageDirection" NOT NULL,
    "type" "MessageType" NOT NULL DEFAULT 'TEXT',
    "body" TEXT,
    "templateName" TEXT,
    "attachmentId" TEXT,
    "mediaUrl" TEXT,
    "waMessageId" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "sentById" TEXT,
    "errorDetail" TEXT,
    "rawJson" JSONB,
    "sentAt" TIMESTAMP(3),
    "statusUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shared_properties" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "messageId" TEXT,
    "matchId" TEXT,
    "sharedById" TEXT NOT NULL,
    "includedPdf" BOOLEAN NOT NULL DEFAULT false,
    "includedImages" BOOLEAN NOT NULL DEFAULT false,
    "includedBrochure" BOOLEAN NOT NULL DEFAULT false,
    "includedText" BOOLEAN NOT NULL DEFAULT true,
    "snapshotJson" JSONB NOT NULL,
    "sharedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shared_properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_activities" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT,
    "leadId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "criteriaJson" JSONB NOT NULL,
    "resultPropertyIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resultSnapshotJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversations_leadId_status_idx" ON "conversations"("leadId", "status");

-- CreateIndex
CREATE INDEX "conversations_agentId_status_idx" ON "conversations"("agentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "messages_waMessageId_key" ON "messages"("waMessageId");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "shared_properties_conversationId_idx" ON "shared_properties"("conversationId");

-- CreateIndex
CREATE INDEX "shared_properties_leadId_idx" ON "shared_properties"("leadId");

-- CreateIndex
CREATE INDEX "shared_properties_propertyId_idx" ON "shared_properties"("propertyId");

-- CreateIndex
CREATE INDEX "search_activities_leadId_createdAt_idx" ON "search_activities"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "search_activities_agentId_createdAt_idx" ON "search_activities"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "search_activities_conversationId_idx" ON "search_activities"("conversationId");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_properties" ADD CONSTRAINT "shared_properties_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_properties" ADD CONSTRAINT "shared_properties_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_properties" ADD CONSTRAINT "shared_properties_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_properties" ADD CONSTRAINT "shared_properties_sharedById_fkey" FOREIGN KEY ("sharedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_activities" ADD CONSTRAINT "search_activities_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_activities" ADD CONSTRAINT "search_activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_activities" ADD CONSTRAINT "search_activities_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Exclusive conversation lock: at most ONE ACTIVE conversation may exist per lead.
-- A partial unique index enforces this at the DB level so two agents cannot both
-- open a conversation with the same client even under a simultaneous race.
CREATE UNIQUE INDEX "conversations_one_active_per_lead" ON "conversations"("leadId") WHERE "status" = 'ACTIVE';
