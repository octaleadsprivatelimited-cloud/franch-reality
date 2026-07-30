-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'AGENT');

-- CreateEnum
CREATE TYPE "City" AS ENUM ('HYDERABAD', 'CHENNAI');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('SALE', 'RENT');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('APARTMENT', 'VILLA', 'PLOT', 'COMMERCIAL');

-- CreateEnum
CREATE TYPE "CommercialOrResidential" AS ENUM ('RESIDENTIAL', 'COMMERCIAL');

-- CreateEnum
CREATE TYPE "PriceUnit" AS ENUM ('LAKH', 'CRORE', 'PER_MONTH');

-- CreateEnum
CREATE TYPE "Furnishing" AS ENUM ('UNFURNISHED', 'SEMI_FURNISHED', 'FURNISHED');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'BOOKED', 'SOLD', 'RENTED');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('IMAGE', 'BROCHURE', 'FLOORPLAN', 'OTHER');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SHORTLISTED', 'SHARED', 'CLOSED_WON', 'CLOSED_LOST', 'CLOSED_NEUTRAL');

-- CreateEnum
CREATE TYPE "WritebackStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncType" AS ENUM ('TELEDUCE_PULL', 'TELEDUCE_WRITEBACK');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "cities" "City"[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "localities" (
    "id" SERIAL NOT NULL,
    "city" "City" NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "teleduceAreaOfInterestValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "localities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "fileNo" TEXT NOT NULL,
    "city" "City" NOT NULL,
    "localityId" INTEGER NOT NULL,
    "transactionType" "TransactionType" NOT NULL,
    "propertyType" "PropertyType" NOT NULL,
    "commercialOrResidential" "CommercialOrResidential" NOT NULL DEFAULT 'RESIDENTIAL',
    "bhk" INTEGER,
    "builtUpAreaSqft" INTEGER,
    "secondaryAreaSqft" INTEGER,
    "facing" TEXT,
    "floor" TEXT,
    "parkingCount" INTEGER,
    "priceInr" DECIMAL(15,2) NOT NULL,
    "priceUnit" "PriceUnit" NOT NULL,
    "pricePerSqft" DECIMAL(12,2),
    "maintenanceAmount" DECIMAL(12,2),
    "ageYears" INTEGER,
    "furnishing" "Furnishing",
    "featuresText" TEXT,
    "additionalFeatures" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "availabilityStatus" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
    "builderDeveloperName" TEXT,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_attachments" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "r2Key" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "teleduceLeadId" TEXT,
    "city" "City" NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "budgetMin" DECIMAL(15,2),
    "budgetMax" DECIMAL(15,2),
    "transactionTypePref" "TransactionType",
    "propertyTypePref" "PropertyType"[] DEFAULT ARRAY[]::"PropertyType"[],
    "bhkPref" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "currentStage" TEXT NOT NULL DEFAULT 'Not yet contacted',
    "teleduceStageId" INTEGER,
    "leadSource" TEXT,
    "leadOwner" TEXT,
    "rawPayload" JSONB,
    "isArchivedInTeleduce" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "band" INTEGER NOT NULL,
    "distanceKm" DOUBLE PRECISION,
    "criteriaSnapshot" JSONB NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'SHORTLISTED',
    "statusReason" TEXT,
    "actionedById" TEXT,
    "actionedAt" TIMESTAMP(3),
    "teleduceWritebackStatus" "WritebackStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "teleduceWritebackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_log" (
    "id" TEXT NOT NULL,
    "syncType" "SyncType" NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "recordsProcessed" INTEGER NOT NULL DEFAULT 0,
    "recordsFailed" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "errorDetails" JSONB,

    CONSTRAINT "sync_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_LeadPreferredLocalities" (
    "A" TEXT NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_LeadPreferredLocalities_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "localities_teleduceAreaOfInterestValue_key" ON "localities"("teleduceAreaOfInterestValue");

-- CreateIndex
CREATE INDEX "localities_city_idx" ON "localities"("city");

-- CreateIndex
CREATE UNIQUE INDEX "localities_city_name_key" ON "localities"("city", "name");

-- CreateIndex
CREATE UNIQUE INDEX "properties_fileNo_key" ON "properties"("fileNo");

-- CreateIndex
CREATE INDEX "properties_city_availabilityStatus_transactionType_idx" ON "properties"("city", "availabilityStatus", "transactionType");

-- CreateIndex
CREATE INDEX "properties_localityId_transactionType_propertyType_bhk_idx" ON "properties"("localityId", "transactionType", "propertyType", "bhk");

-- CreateIndex
CREATE INDEX "properties_city_transactionType_availabilityStatus_property_idx" ON "properties"("city", "transactionType", "availabilityStatus", "propertyType", "bhk");

-- CreateIndex
CREATE INDEX "property_attachments_propertyId_idx" ON "property_attachments"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "leads_teleduceLeadId_key" ON "leads"("teleduceLeadId");

-- CreateIndex
CREATE INDEX "leads_city_currentStage_idx" ON "leads"("city", "currentStage");

-- CreateIndex
CREATE INDEX "leads_isArchivedInTeleduce_idx" ON "leads"("isArchivedInTeleduce");

-- CreateIndex
CREATE INDEX "matches_leadId_status_idx" ON "matches"("leadId", "status");

-- CreateIndex
CREATE INDEX "matches_propertyId_status_idx" ON "matches"("propertyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "matches_leadId_propertyId_key" ON "matches"("leadId", "propertyId");

-- CreateIndex
CREATE INDEX "sync_log_syncType_startedAt_idx" ON "sync_log"("syncType", "startedAt");

-- CreateIndex
CREATE INDEX "audit_log_createdAt_idx" ON "audit_log"("createdAt");

-- CreateIndex
CREATE INDEX "audit_log_entityType_entityId_idx" ON "audit_log"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "_LeadPreferredLocalities_B_index" ON "_LeadPreferredLocalities"("B");

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_localityId_fkey" FOREIGN KEY ("localityId") REFERENCES "localities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_attachments" ADD CONSTRAINT "property_attachments_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matches" ADD CONSTRAINT "matches_actionedById_fkey" FOREIGN KEY ("actionedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LeadPreferredLocalities" ADD CONSTRAINT "_LeadPreferredLocalities_A_fkey" FOREIGN KEY ("A") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LeadPreferredLocalities" ADD CONSTRAINT "_LeadPreferredLocalities_B_fkey" FOREIGN KEY ("B") REFERENCES "localities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
