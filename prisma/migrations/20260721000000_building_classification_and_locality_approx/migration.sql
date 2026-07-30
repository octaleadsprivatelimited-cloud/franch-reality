-- Feature: "Building classification" inventory attribute + filter, and admin-managed
-- locations. Both changes are additive and non-breaking (nullable column / defaulted
-- boolean), so the existing app keeps working if this has not been applied yet.

-- CreateEnum
CREATE TYPE "BuildingClassification" AS ENUM ('GATED_COMMUNITY', 'STAND_ALONE', 'COMMERCIAL');

-- AlterTable: new optional per-property classification (existing rows stay NULL).
ALTER TABLE "properties" ADD COLUMN     "buildingClassification" "BuildingClassification";

-- AlterTable: flag localities whose coordinates fall back to the city centroid
-- (admin added them without exact lat/long). Defaults false so seeded rows are exact.
ALTER TABLE "localities" ADD COLUMN     "approxCoords" BOOLEAN NOT NULL DEFAULT false;
