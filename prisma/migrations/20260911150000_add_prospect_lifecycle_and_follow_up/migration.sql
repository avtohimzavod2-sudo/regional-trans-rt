-- CreateEnum
CREATE TYPE "ProspectLifecycleStage" AS ENUM ('DISCOVERED', 'QUALIFICATION_PENDING', 'QUALIFIED', 'REJECTED', 'CONTACT_PENDING', 'CONTACTED', 'FOLLOW_UP_PENDING', 'RESPONDED', 'HANDOFF_READY', 'HANDED_OFF', 'CLOSED');

-- CreateEnum
CREATE TYPE "ProspectVerificationStatus" AS ENUM ('UNVERIFIED', 'SELF_REPORTED', 'VERIFIED');

-- AlterTable
ALTER TABLE "DeliveryExecutorProspect"
  ADD COLUMN "lifecycleStage" "ProspectLifecycleStage" NOT NULL DEFAULT 'DISCOVERED',
  ADD COLUMN "executorType" TEXT,
  ADD COLUMN "personOrCompanyName" TEXT,
  ADD COLUMN "serviceAreaText" TEXT,
  ADD COLUMN "maxLoadText" TEXT,
  ADD COLUMN "dimensionsText" TEXT,
  ADD COLUMN "localOrIntercityText" TEXT,
  ADD COLUMN "availabilityText" TEXT,
  ADD COLUMN "contactChannelsText" TEXT,
  ADD COLUMN "confidence" DOUBLE PRECISION,
  ADD COLUMN "verificationStatus" "ProspectVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "evidenceNotes" TEXT,
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "possibleDuplicateOfId" TEXT,
  ADD COLUMN "followUpCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastFollowUpAt" TIMESTAMP(3),
  ADD COLUMN "respondedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CargoCarrierProspect"
  ADD COLUMN "lifecycleStage" "ProspectLifecycleStage" NOT NULL DEFAULT 'DISCOVERED',
  ADD COLUMN "carrierIdentityName" TEXT,
  ADD COLUMN "fleetTypeText" TEXT,
  ADD COLUMN "cargoBodyTypeText" TEXT,
  ADD COLUMN "geographicCoverageText" TEXT,
  ADD COLUMN "localIntercityInternationalText" TEXT,
  ADD COLUMN "recurringRoutesNote" TEXT,
  ADD COLUMN "schedulingText" TEXT,
  ADD COLUMN "confidence" DOUBLE PRECISION,
  ADD COLUMN "verificationStatus" "ProspectVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  ADD COLUMN "evidenceNotes" TEXT,
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "possibleDuplicateOfId" TEXT,
  ADD COLUMN "followUpCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastFollowUpAt" TIMESTAMP(3),
  ADD COLUMN "respondedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "DeliveryExecutorProspect_lifecycleStage_createdAt_idx" ON "DeliveryExecutorProspect"("lifecycleStage", "createdAt");

-- CreateIndex
CREATE INDEX "CargoCarrierProspect_lifecycleStage_createdAt_idx" ON "CargoCarrierProspect"("lifecycleStage", "createdAt");

-- CreateTable
CREATE TABLE "ProspectFollowUpAttempt" (
    "id" TEXT NOT NULL,
    "prospectType" "AcquisitionProspectType" NOT NULL,
    "prospectRef" TEXT NOT NULL,
    "contractorAgent" "AgentName" NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "outreachStatus" "OutreachStatus" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectFollowUpAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProspectFollowUpAttempt_idempotencyKey_key" ON "ProspectFollowUpAttempt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ProspectFollowUpAttempt_prospectType_prospectRef_attemptNu_idx" ON "ProspectFollowUpAttempt"("prospectType", "prospectRef", "attemptNumber");
