-- AlterEnum
ALTER TYPE "AgentName" ADD VALUE 'DELIVERY_EXECUTOR_CONTRACTOR';
ALTER TYPE "AgentName" ADD VALUE 'CARGO_CARRIER_CONTRACTOR';

-- AlterEnum
ALTER TYPE "AcquisitionProspectType" ADD VALUE 'DELIVERY_EXECUTOR';
ALTER TYPE "AcquisitionProspectType" ADD VALUE 'CARGO_CARRIER';

-- CreateEnum
CREATE TYPE "HandoffStatus" AS ENUM ('READY', 'ACCEPTED', 'REJECTED', 'NEEDS_MORE_INFO', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "DeliveryExecutorProspectStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'HANDED_OFF', 'DECLINED', 'SPAM');

-- CreateEnum
CREATE TYPE "CargoCarrierProspectStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'HANDED_OFF', 'DECLINED', 'SPAM');

-- AlterTable
ALTER TABLE "AcquisitionOutreachEvent" ADD COLUMN "contactFingerprint" TEXT;

-- CreateTable
CREATE TABLE "DeliveryExecutorProspect" (
    "id" TEXT NOT NULL,
    "sourceType" "AcquisitionSourceType" NOT NULL,
    "sourceGroupId" TEXT,
    "sourceRef" TEXT,
    "sourceText" TEXT NOT NULL,
    "rawPhone" TEXT,
    "rawTelegramUsername" TEXT,
    "rawVehicleText" TEXT,
    "rawZonesText" TEXT,
    "normalizedPhone" TEXT,
    "status" "DeliveryExecutorProspectStatus" NOT NULL DEFAULT 'NEW',
    "handedOffAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryExecutorProspect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CargoCarrierProspect" (
    "id" TEXT NOT NULL,
    "sourceType" "AcquisitionSourceType" NOT NULL,
    "sourceGroupId" TEXT,
    "sourceRef" TEXT,
    "sourceText" TEXT NOT NULL,
    "rawPhone" TEXT,
    "rawTelegramUsername" TEXT,
    "rawVehicleText" TEXT,
    "rawCapacityText" TEXT,
    "rawRouteText" TEXT,
    "rawTemperatureCapability" BOOLEAN,
    "rawBackhaulText" TEXT,
    "normalizedPhone" TEXT,
    "status" "CargoCarrierProspectStatus" NOT NULL DEFAULT 'NEW',
    "handedOffAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CargoCarrierProspect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectHandoff" (
    "id" TEXT NOT NULL,
    "prospectType" "AcquisitionProspectType" NOT NULL,
    "prospectRef" TEXT NOT NULL,
    "sourceAgent" "AgentName" NOT NULL,
    "targetAgentOrDepartment" TEXT NOT NULL,
    "status" "HandoffStatus" NOT NULL DEFAULT 'READY',
    "expressedInterest" TEXT,
    "summary" TEXT,
    "contactData" TEXT,
    "requestedService" TEXT,
    "availableCapabilities" TEXT[],
    "conversationReference" TEXT,
    "sourceReferences" TEXT[],
    "contactFingerprint" TEXT,
    "decisionNote" TEXT,
    "decidedBy" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),

    CONSTRAINT "ProspectHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AcquisitionOutreachEvent_contactFingerprint_idx" ON "AcquisitionOutreachEvent"("contactFingerprint");

-- CreateIndex
CREATE INDEX "DeliveryExecutorProspect_status_createdAt_idx" ON "DeliveryExecutorProspect"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryExecutorProspect_normalizedPhone_idx" ON "DeliveryExecutorProspect"("normalizedPhone");

-- CreateIndex
CREATE INDEX "CargoCarrierProspect_status_createdAt_idx" ON "CargoCarrierProspect"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CargoCarrierProspect_normalizedPhone_idx" ON "CargoCarrierProspect"("normalizedPhone");

-- CreateIndex
CREATE UNIQUE INDEX "ProspectHandoff_idempotencyKey_key" ON "ProspectHandoff"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ProspectHandoff_prospectType_prospectRef_status_idx" ON "ProspectHandoff"("prospectType", "prospectRef", "status");

-- CreateIndex
CREATE INDEX "ProspectHandoff_status_createdAt_idx" ON "ProspectHandoff"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProspectHandoff_targetAgentOrDepartment_status_idx" ON "ProspectHandoff"("targetAgentOrDepartment", "status");

-- CreateIndex
CREATE INDEX "ProspectHandoff_contactFingerprint_idx" ON "ProspectHandoff"("contactFingerprint");
