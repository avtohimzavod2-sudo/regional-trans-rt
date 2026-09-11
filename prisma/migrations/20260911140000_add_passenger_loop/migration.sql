-- CreateEnum
CREATE TYPE "PassengerLoopStatus" AS ENUM ('NEW', 'NORMALIZED', 'SUPPLY_REQUESTED', 'MATCHING', 'OFFER_READY', 'NO_SUPPLY', 'OFFER_SENT', 'PASSENGER_ACCEPTED', 'PASSENGER_DECLINED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PassengerLoopOfferStatus" AS ENUM ('CANDIDATE', 'VALIDATED', 'RESERVED_PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "NoSupplyReason" AS ENUM ('NO_SUPPLY', 'TEMPORARILY_UNAVAILABLE', 'NEEDS_CLARIFICATION');

-- CreateTable
CREATE TABLE "PassengerLoopRun" (
    "id" TEXT NOT NULL,
    "tripRequestId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "status" "PassengerLoopStatus" NOT NULL DEFAULT 'NEW',
    "noSupplyReason" "NoSupplyReason",
    "noSupplyDetail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PassengerLoopRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PassengerLoopOffer" (
    "id" TEXT NOT NULL,
    "loopRunId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "driverOfferId" TEXT NOT NULL,
    "status" "PassengerLoopOfferStatus" NOT NULL DEFAULT 'CANDIDATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PassengerLoopOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PassengerLoopRun_tripRequestId_key" ON "PassengerLoopRun"("tripRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "PassengerLoopRun_correlationId_key" ON "PassengerLoopRun"("correlationId");

-- CreateIndex
CREATE INDEX "PassengerLoopRun_status_idx" ON "PassengerLoopRun"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PassengerLoopOffer_matchId_key" ON "PassengerLoopOffer"("matchId");

-- CreateIndex
CREATE INDEX "PassengerLoopOffer_loopRunId_idx" ON "PassengerLoopOffer"("loopRunId");

-- AddForeignKey
ALTER TABLE "PassengerLoopRun" ADD CONSTRAINT "PassengerLoopRun_tripRequestId_fkey" FOREIGN KEY ("tripRequestId") REFERENCES "TripRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PassengerLoopOffer" ADD CONSTRAINT "PassengerLoopOffer_loopRunId_fkey" FOREIGN KEY ("loopRunId") REFERENCES "PassengerLoopRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
