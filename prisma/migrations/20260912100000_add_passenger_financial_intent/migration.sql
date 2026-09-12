-- Cold audit B4: give the passenger financial intent a database-enforced
-- idempotency guarantee instead of a best-effort findFirst-before-create
-- against the general-purpose AuditLogEntry log.
--
-- Purely additive: two new enum types, one new table. No existing table,
-- column, index or constraint is altered or dropped, so this migration is
-- backward compatible -- code running before it simply does not use the new
-- table, and the previous AuditLogEntry trace keeps being written either way.
--
-- Rollback (safe, loses only rows this table holds):
--   DROP TABLE "PassengerFinancialIntent";
--   DROP TYPE "PassengerFinancialReason";
--   DROP TYPE "PassengerPaymentType";

-- CreateEnum
CREATE TYPE "PassengerPaymentType" AS ENUM ('PASSENGER_EXTRA_BAGGAGE_FEE');

-- CreateEnum
CREATE TYPE "PassengerFinancialReason" AS ENUM ('SIGNIFICANT_EXCESS_BAGGAGE');

-- CreateTable
CREATE TABLE "PassengerFinancialIntent" (
    "id" TEXT NOT NULL,
    "paymentType" "PassengerPaymentType" NOT NULL,
    "reason" "PassengerFinancialReason" NOT NULL,
    "amountSom" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KGS',
    "conversationId" TEXT NOT NULL,
    "customerRef" TEXT NOT NULL,
    "tripId" TEXT,
    "bookingId" TEXT,
    "originatingContext" TEXT NOT NULL,
    "financialProcessor" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PassengerFinancialIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- This is the constraint the audit finding is about: it makes a duplicate
-- physically impossible rather than merely unlikely.
CREATE UNIQUE INDEX "PassengerFinancialIntent_idempotencyKey_key" ON "PassengerFinancialIntent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PassengerFinancialIntent_customerRef_idx" ON "PassengerFinancialIntent"("customerRef");

-- CreateIndex
CREATE INDEX "PassengerFinancialIntent_createdAt_idx" ON "PassengerFinancialIntent"("createdAt");
