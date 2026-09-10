-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('RU', 'KY', 'EN');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('WHATSAPP', 'TELEGRAM_BOT', 'TELEGRAM_GROUP');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'MATCHING', 'MATCHED', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('OPEN', 'PARTIALLY_FILLED', 'FULL', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('PROPOSED_TO_DRIVER', 'AWAITING_DRIVER', 'AWAITING_PASSENGER', 'CONFIRMED', 'DECLINED_BY_DRIVER', 'DECLINED_BY_PASSENGER', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "MessageParseResult" AS ENUM ('PASSENGER_REQUEST', 'DRIVER_OFFER', 'CONFIRMATION_REPLY', 'UNRECOGNIZED', 'COMMAND', 'IGNORED_NOT_ALLOWED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('AGENT', 'DISPATCHER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AgentName" AS ENUM ('COMMAND', 'PASSENGER', 'DRIVER', 'MATCH', 'ROUTE', 'TRUST', 'PAY', 'SUPPORT', 'PARCEL', 'SCOUT', 'QUALITY', 'ANALYTICS', 'NETWORK', 'MIRA', 'JOLCHU', 'SAPAR', 'SAPARGUL', 'ADILET', 'TYYIN', 'ARTUR', 'RT_OFFICE', 'CRM_AUTO', 'DRIVER_CONTRACTOR', 'PASSENGER_CONTRACTOR', 'DELIVERY_CONTRACTOR');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('DRIVER_DIRECT_RT_BALANCE', 'THROUGH_RT');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('COMMISSION_CHARGE', 'TOPUP', 'PAYMENT_COLLECTED', 'PAYOUT', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "LedgerEntryStatus" AS ENUM ('POSTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "ParcelStatus" AS ENUM ('PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "ScoutSourceType" AS ENUM ('TELEGRAM_GROUP', 'WHATSAPP_GROUP', 'LALAFO', 'MANUAL_IMPORT', 'INTERNAL');

-- CreateEnum
CREATE TYPE "ScoutReviewStatus" AS ENUM ('PENDING_REVIEW', 'AUTO_LINKED', 'MANUALLY_LINKED', 'REJECTED', 'NEW_DRIVER_CREATED');

-- CreateEnum
CREATE TYPE "DriverCategory" AS ENUM ('UNKNOWN', 'OCCASIONAL', 'REGULAR', 'ANCHOR', 'DISPATCHER_FLEET');

-- CreateEnum
CREATE TYPE "SupportCaseType" AS ENUM ('DRIVER_NO_SHOW', 'PASSENGER_NO_SHOW', 'CANCELLATION', 'LATE', 'DISPUTE', 'REFUND_REQUEST', 'ROUTE_CHANGE', 'OTHER');

-- CreateEnum
CREATE TYPE "SupportCaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('DRIVER_FLEET', 'DISPATCHER', 'RT_POINT', 'CAFE', 'GAS_STATION', 'SUPERMARKET', 'COURIER', 'LAST_MILE', 'OTHER');

-- CreateEnum
CREATE TYPE "MiraRole" AS ENUM ('PASSENGER', 'DRIVER', 'DISPATCHER', 'INTERMEDIARY', 'PARCEL_SENDER', 'PARTNER', 'TOURIST', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "MiraConversationStatus" AS ENUM ('ACTIVE', 'AWAITING_USER', 'COMPLETED', 'ABANDONED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "MiraSenderType" AS ENUM ('USER', 'MIRA', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MiraCertificationStatus" AS ENUM ('TRAINEE', 'CERTIFICATION_PENDING', 'CERTIFIED', 'PRODUCTION_APPROVED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MiraFailureCategory" AS ENUM ('LANGUAGE', 'DIALECT', 'CODE_SWITCH', 'ROLE', 'ROUTE', 'DATE', 'TIME', 'PHONE', 'PASSENGER_COUNT', 'DRIVER_SEATS', 'PARCEL', 'VOICE', 'CONTEXT', 'HALLUCINATION', 'UNNECESSARY_CLARIFICATION', 'TONE', 'SAFETY', 'PAYMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "MiraFailureStatus" AS ENUM ('OPEN', 'IN_TRAINING_LOOP', 'RESOLVED');

-- CreateEnum
CREATE TYPE "JolchuInputType" AS ENUM ('LIVE_LOCATION', 'COORDINATES', 'GOOGLE_MAPS_LINK', 'TWO_GIS_LINK', 'TEXT_ADDRESS', 'LANDMARK', 'SETTLEMENT_ONLY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "JolchuRequestStatus" AS ENUM ('RESOLVED', 'NEEDS_CONFIRMATION', 'PARTIAL', 'FAILED');

-- CreateEnum
CREATE TYPE "TrafficStatus" AS ENUM ('UNKNOWN', 'FREE', 'LIGHT', 'MODERATE', 'HEAVY', 'SEVERE');

-- CreateEnum
CREATE TYPE "JolchuRefreshStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('DRAFT', 'NEEDS_INFO', 'READY_FOR_MATCHING', 'SEARCHING', 'QUOTED', 'AWAITING_CONFIRMATION', 'CONFIRMED', 'AWAITING_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'AT_TRANSFER_POINT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'CANCELLED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "ShipmentRiskLevel" AS ENUM ('LOW', 'ELEVATED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ShipmentLegKind" AS ENUM ('PICKUP', 'INTERCITY', 'LAST_MILE', 'TRANSFER', 'SELF_DROPOFF', 'SELF_PICKUP');

-- CreateEnum
CREATE TYPE "ShipmentLegStatus" AS ENUM ('PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShipmentQuoteSource" AS ENUM ('ESTIMATE', 'CONFIRMED', 'MANUAL');

-- CreateEnum
CREATE TYPE "ShipmentQuoteStatus" AS ENUM ('OFFERED', 'RECOMMENDED', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DeliveryExecutorSource" AS ENUM ('GROUP', 'DIRECT_RT_PARTNER', 'RT_COURIER', 'EXTERNAL_DELIVERY_SERVICE', 'TAXI_PARTNER', 'OTHER');

-- CreateEnum
CREATE TYPE "DeliveryExecutorStatus" AS ENUM ('ACTIVE', 'LIMITED', 'SUSPENDED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "DeliveryExecutorVerification" AS ENUM ('VERIFIED', 'PROVISIONAL', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "ShipmentIncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ShipmentIncidentStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "ShipmentPaymentStatus" AS ENUM ('PAYMENT_REQUIRED', 'PAYMENT_INSTRUCTIONS_READY', 'AWAITING_PAYMENT', 'PAYMENT_EVIDENCE_RECEIVED', 'PAYMENT_REVIEW', 'AWAITING_TREASURER_CONFIRMATION', 'PAYMENT_CONFIRMED', 'PAYMENT_MISMATCH', 'PAYMENT_REJECTED', 'REFUND_REQUIRED', 'REFUND_PENDING', 'REFUND_CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentEvidenceType" AS ENUM ('RECEIPT_IMAGE', 'RECEIPT_PDF', 'SCREENSHOT', 'TRANSACTION_REFERENCE', 'TEXT_STATEMENT');

-- CreateEnum
CREATE TYPE "PaymentPreliminaryCheckStatus" AS ENUM ('PENDING', 'LIKELY_MATCH', 'MISMATCH', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "PaymentTreasuryReviewStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentDestinationEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "AdiletCaseType" AS ENUM ('CUSTOMER_COMPLAINT', 'CUSTOMER_ABUSE', 'EXECUTOR_MISCONDUCT', 'SERVICE_FAILURE', 'PAYMENT_DISPUTE', 'SAFETY_COMPLAINT', 'DAMAGE_OR_LOSS', 'NO_SHOW', 'PRICE_DISPUTE', 'CANCELLATION_DISPUTE', 'AGENT_ESCALATION', 'OTHER');

-- CreateEnum
CREATE TYPE "AdiletSeverity" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AdiletCaseStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'AWAITING_EVIDENCE', 'DECIDED', 'APPEAL_REQUESTED', 'UNDER_APPEAL_REVIEW', 'CLOSED');

-- CreateEnum
CREATE TYPE "AdiletReviewMode" AS ENUM ('ADILET_REVIEW', 'DIRECTOR_REVIEW');

-- CreateEnum
CREATE TYPE "AdiletEvidenceType" AS ENUM ('MESSAGE', 'ORDER_EVENT', 'PAYMENT_EVENT', 'SHIPMENT_INCIDENT', 'DRIVER_STATUS', 'PROVIDER_RESPONSE', 'CUSTOMER_FEEDBACK', 'MANAGER_NOTE', 'SYSTEM_LOG', 'OTHER');

-- CreateEnum
CREATE TYPE "AdiletEvidenceTrust" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "AdiletFactStatus" AS ENUM ('CLAIM', 'VERIFIED_FACT', 'DISPUTED');

-- CreateEnum
CREATE TYPE "AdiletDecisionOutcome" AS ENUM ('NO_VIOLATION', 'RESOLVED_NO_SANCTION', 'WARNING', 'SANCTION_APPLIED', 'INSUFFICIENT_EVIDENCE', 'ESCALATED_TO_DIRECTOR');

-- CreateEnum
CREATE TYPE "AdiletSubjectType" AS ENUM ('CLIENT', 'DRIVER', 'EXECUTOR');

-- CreateEnum
CREATE TYPE "AdiletSanctionType" AS ENUM ('DEESCALATION', 'EXPLANATION', 'FORMAL_WARNING', 'TEMPORARY_RESTRICTION', 'TEMPORARY_SUSPENSION', 'BLOCKED', 'ADVISORY', 'RELIABILITY_PENALTY', 'LIMITED_ACCESS', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AdiletSanctionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVERSED');

-- CreateEnum
CREATE TYPE "AdiletAppealStatus" AS ENUM ('NO_APPEAL', 'APPEAL_AVAILABLE', 'APPEAL_REQUESTED', 'UNDER_REVIEW', 'UPHELD', 'MODIFIED', 'OVERTURNED');

-- CreateEnum
CREATE TYPE "TreasuryDepartment" AS ENUM ('CARGO', 'PASSENGER', 'OTHER');

-- CreateEnum
CREATE TYPE "TreasuryTransactionStatus" AS ENUM ('RECEIVED', 'MATCHED', 'NEEDS_MANUAL_RECONCILIATION');

-- CreateEnum
CREATE TYPE "AccountantCaseType" AS ENUM ('REFUND_REQUIRED', 'OVERPAYMENT_RESOLUTION', 'COMPENSATION_REVIEW', 'WRONG_PAYMENT', 'DUPLICATE_PAYMENT', 'UNMATCHED_PAYMENT', 'CUSTOMER_DISPUTE', 'MANUAL_RECONCILIATION', 'OTHER');

-- CreateEnum
CREATE TYPE "AccountantCaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('INFO', 'NORMAL', 'ATTENTION', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RtStatus" AS ENUM ('NORMAL', 'ATTENTION', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ScheduledJobStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'DELIVERED', 'FAILED', 'RETRYING', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "FounderInitiativeStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED', 'DEFERRED', 'NEEDS_REVISION', 'IN_PROGRESS', 'COMPLETED', 'MEASURED');

-- CreateEnum
CREATE TYPE "EmergencyResolutionStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "DriveCrmEventType" AS ENUM ('OPERATIONAL_ETA', 'BREAKDOWN_INCIDENT', 'BACKHAUL_OPPORTUNITY', 'OPERATIONAL_HISTORY', 'CORRECTION');

-- CreateEnum
CREATE TYPE "DriveCrmIncidentStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AcquisitionSourceType" AS ENUM ('TELEGRAM_GROUP', 'WHATSAPP_GROUP', 'LALAFO', 'PUBLIC_AD', 'MANUAL_IMPORT', 'INTERNAL');

-- CreateEnum
CREATE TYPE "AcquisitionProspectType" AS ENUM ('DRIVER', 'PASSENGER', 'BUSINESS');

-- CreateEnum
CREATE TYPE "OutreachStatus" AS ENUM ('SENT', 'DRY_RUN', 'SANDBOX', 'NO_PROVIDER_CONFIGURED', 'RATE_LIMITED', 'DUPLICATE', 'DO_NOT_CONTACT', 'FAILED');

-- CreateEnum
CREATE TYPE "PassengerProspectStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'DECLINED', 'SPAM');

-- CreateEnum
CREATE TYPE "BusinessCategory" AS ENUM ('GROCERY', 'HOUSEHOLD_GOODS', 'CLOTHING', 'ELECTRONICS', 'AUTO_GOODS', 'BUILDING_MATERIALS', 'FURNITURE', 'FLOWERS', 'PHARMACY', 'MARKET_SELLER', 'SOCIAL_COMMERCE', 'ONLINE_STORE', 'WHOLESALE', 'RETAIL', 'OTHER');

-- CreateEnum
CREATE TYPE "BusinessProspectStatus" AS ENUM ('PROSPECT', 'CONTACTED', 'QUALIFIED', 'PARTNERED', 'DECLINED', 'CHURNED');

-- CreateEnum
CREATE TYPE "DeliveryCrmEventType" AS ENUM ('OUTREACH_SENT', 'QUALIFIED', 'PARTNERSHIP_AGREED', 'HANDOFF_TO_OPERATIONS', 'LAST_MILE_STATUS', 'COMPLETION', 'INCIDENT', 'CORRECTION');

-- CreateTable
CREATE TABLE "Corridor" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "nameKy" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Corridor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stop" (
    "id" TEXT NOT NULL,
    "corridorId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "nameKy" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "aliases" TEXT[],

    CONSTRAINT "Stop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Passenger" (
    "id" TEXT NOT NULL,
    "whatsappId" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT,
    "preferredLang" "Language" NOT NULL DEFAULT 'RU',
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Passenger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "telegramUsername" TEXT,
    "phone" TEXT,
    "name" TEXT,
    "carModel" TEXT,
    "carPlate" TEXT,
    "preferredLang" "Language" NOT NULL DEFAULT 'RU',
    "status" "DriverStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "verifiedAt" TIMESTAMP(3),
    "verifiedByAdminId" TEXT,
    "isFemale" BOOLEAN,
    "ratingAvg" DOUBLE PRECISION,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "complaintsCount" INTEGER NOT NULL DEFAULT 0,
    "repeatScore" INTEGER NOT NULL DEFAULT 0,
    "category" "DriverCategory" NOT NULL DEFAULT 'UNKNOWN',
    "lastScoutSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripRequest" (
    "id" TEXT NOT NULL,
    "passengerId" TEXT NOT NULL,
    "originStopId" TEXT NOT NULL,
    "destinationStopId" TEXT NOT NULL,
    "travelDate" DATE NOT NULL,
    "timeWindowStart" TEXT,
    "timeWindowEnd" TEXT,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "luggage" TEXT,
    "pickupPoint" TEXT,
    "femaleOnlyDriver" BOOLEAN NOT NULL DEFAULT false,
    "travelingWithChildren" BOOLEAN NOT NULL DEFAULT false,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "sourceChannel" "Channel" NOT NULL DEFAULT 'WHATSAPP',
    "rawMessageId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverOffer" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "originStopId" TEXT NOT NULL,
    "destinationStopId" TEXT NOT NULL,
    "travelDate" DATE NOT NULL,
    "timeWindowStart" TEXT,
    "timeWindowEnd" TEXT,
    "seatsTotal" INTEGER NOT NULL,
    "seatsAvailable" INTEGER NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'OPEN',
    "sourceChannel" "Channel" NOT NULL DEFAULT 'TELEGRAM_BOT',
    "rawMessageId" TEXT,
    "isReturnLeg" BOOLEAN NOT NULL DEFAULT false,
    "generatedFromTripId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "tripRequestId" TEXT NOT NULL,
    "driverOfferId" TEXT NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'PROPOSED_TO_DRIVER',
    "score" DOUBLE PRECISION,
    "proposedToDriverAt" TIMESTAMP(3),
    "driverRespondedAt" TIMESTAMP(3),
    "proposedToPassengerAt" TIMESTAMP(3),
    "passengerRespondedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "contactRevealedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "passengerId" TEXT NOT NULL,
    "driverOfferId" TEXT NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'SCHEDULED',
    "seats" INTEGER NOT NULL DEFAULT 1,
    "paymentMode" "PaymentMode",
    "totalFareSom" INTEGER,
    "commissionSom" INTEGER,
    "commissionChargedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RtBalance" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "balanceSom" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RtBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "tripId" TEXT,
    "type" "LedgerEntryType" NOT NULL,
    "status" "LedgerEntryStatus" NOT NULL DEFAULT 'POSTED',
    "paymentMode" "PaymentMode",
    "amountSom" INTEGER NOT NULL,
    "description" TEXT,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parcel" (
    "id" TEXT NOT NULL,
    "senderName" TEXT,
    "senderContact" TEXT NOT NULL,
    "receiverName" TEXT,
    "receiverContact" TEXT NOT NULL,
    "originStopId" TEXT NOT NULL,
    "destinationStopId" TEXT NOT NULL,
    "sizeType" TEXT,
    "description" TEXT,
    "priceSom" INTEGER,
    "driverId" TEXT,
    "tripId" TEXT,
    "status" "ParcelStatus" NOT NULL DEFAULT 'PENDING',
    "pickupConfirmedAt" TIMESTAMP(3),
    "deliveryConfirmedAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Parcel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoutCandidate" (
    "id" TEXT NOT NULL,
    "sourceType" "ScoutSourceType" NOT NULL,
    "sourceGroupId" TEXT,
    "sourceText" TEXT NOT NULL,
    "rawPhone" TEXT,
    "rawTelegramUsername" TEXT,
    "rawName" TEXT,
    "rawCarModel" TEXT,
    "rawCarPlate" TEXT,
    "rawRouteText" TEXT,
    "rawOriginStopId" TEXT,
    "rawDestinationStopId" TEXT,
    "rawTravelDate" DATE,
    "rawPriceSom" INTEGER,
    "rawSeats" INTEGER,
    "extractionConfidence" DOUBLE PRECISION,
    "normalizedPhone" TEXT,
    "reviewStatus" "ScoutReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "matchCandidates" JSONB,
    "linkedDriverId" TEXT,
    "reviewedByAdminId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoutCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportCase" (
    "id" TEXT NOT NULL,
    "tripId" TEXT,
    "caseType" "SupportCaseType" NOT NULL,
    "status" "SupportCaseStatus" NOT NULL DEFAULT 'OPEN',
    "openedByType" "ActorType" NOT NULL,
    "openedById" TEXT,
    "description" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),

    CONSTRAINT "SupportCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "type" "PartnerType" NOT NULL,
    "name" TEXT NOT NULL,
    "contactPhone" TEXT,
    "contactHandle" TEXT,
    "stopId" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramGroup" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "title" TEXT,
    "addedByAdminId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawMessage" (
    "id" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "chatId" TEXT NOT NULL,
    "telegramGroupId" TEXT,
    "senderId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "detectedLanguage" "Language",
    "parseResult" "MessageParseResult",
    "extractionConfidence" DOUBLE PRECISION,
    "extractionRaw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLogEntry" (
    "id" TEXT NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "agentName" "AgentName",
    "traceId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatcherUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'dispatcher',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispatcherUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiraConversation" (
    "id" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "role" "MiraRole" NOT NULL DEFAULT 'UNKNOWN',
    "detectedLanguage" "Language",
    "status" "MiraConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "activeIntent" TEXT,
    "activeSpecialist" TEXT NOT NULL DEFAULT 'MIRA',
    "collectedFields" JSONB,
    "missingFields" TEXT[],
    "confirmedFields" JSONB,
    "lastAgentDecision" TEXT,
    "lastTraceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MiraConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiraMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sender" "MiraSenderType" NOT NULL,
    "rawText" TEXT,
    "audioRef" TEXT,
    "transcript" TEXT,
    "normalizedText" TEXT,
    "detectedLanguage" "Language",
    "languageConfidence" DOUBLE PRECISION,
    "role" "MiraRole",
    "intent" TEXT,
    "entities" JSONB,
    "uncertainties" TEXT[],
    "requiresClarification" BOOLEAN NOT NULL DEFAULT false,
    "traceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiraMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiraProviderCall" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "conversationId" TEXT,
    "traceId" TEXT,
    "latencyMs" INTEGER,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "estimatedCostUsd" DOUBLE PRECISION,
    "ok" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiraProviderCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiraTrainingExample" (
    "id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "category" TEXT,
    "input" TEXT NOT NULL,
    "inputType" TEXT NOT NULL DEFAULT 'TEXT',
    "language" "Language",
    "dialect" TEXT,
    "containsTypos" BOOLEAN NOT NULL DEFAULT false,
    "containsRussianMix" BOOLEAN NOT NULL DEFAULT false,
    "containsMissingKyrgyzLetters" BOOLEAN NOT NULL DEFAULT false,
    "expectedRole" "MiraRole",
    "expectedIntent" TEXT,
    "expectedNormalizedData" JSONB,
    "source" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "license" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "reviewedByHuman" BOOLEAN NOT NULL DEFAULT false,
    "allowedForTraining" BOOLEAN NOT NULL DEFAULT true,
    "allowedForEvaluation" BOOLEAN NOT NULL DEFAULT true,
    "privacyStatus" TEXT NOT NULL DEFAULT 'SYNTHETIC',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiraTrainingExample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiraBenchmarkCase" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "inputType" TEXT NOT NULL DEFAULT 'TEXT',
    "expectedRole" "MiraRole",
    "expectedIntent" TEXT,
    "expectedLanguage" "Language",
    "expectedNormalizedData" JSONB,
    "allowedAlternatives" JSONB,
    "difficulty" TEXT NOT NULL DEFAULT 'MEDIUM',
    "dialect" TEXT,
    "containsTypos" BOOLEAN NOT NULL DEFAULT false,
    "containsRussianMix" BOOLEAN NOT NULL DEFAULT false,
    "containsMissingKyrgyzLetters" BOOLEAN NOT NULL DEFAULT false,
    "containsVoice" BOOLEAN NOT NULL DEFAULT false,
    "sourceClass" TEXT NOT NULL DEFAULT 'SYNTHETIC',
    "privacyStatus" TEXT NOT NULL DEFAULT 'SYNTHETIC',
    "humanVerified" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiraBenchmarkCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiraBenchmarkRun" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "totalCases" INTEGER NOT NULL DEFAULT 0,
    "passedCases" INTEGER NOT NULL DEFAULT 0,
    "roleAccuracy" DOUBLE PRECISION,
    "routeAccuracy" DOUBLE PRECISION,
    "dateTimeAccuracy" DOUBLE PRECISION,
    "seatAccuracy" DOUBLE PRECISION,
    "phoneAccuracy" DOUBLE PRECISION,
    "hallucinationCount" INTEGER NOT NULL DEFAULT 0,
    "overallScore" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "MiraBenchmarkRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiraBenchmarkResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "actualRole" "MiraRole",
    "actualIntent" TEXT,
    "actualNormalizedData" JSONB,
    "actualReplyText" TEXT,
    "failureCategory" "MiraFailureCategory",
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiraBenchmarkResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiraHumanReview" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT,
    "messageId" TEXT,
    "benchmarkResultId" TEXT,
    "input" TEXT NOT NULL,
    "miraAnswer" TEXT NOT NULL,
    "normalizedData" JSONB,
    "detectedLanguage" "Language",
    "expectedMeaning" TEXT,
    "agentTrace" JSONB,
    "grammar" INTEGER,
    "naturalness" INTEGER,
    "meaning" INTEGER,
    "politeness" INTEGER,
    "dialectUnderstanding" INTEGER,
    "codeSwitchUnderstanding" INTEGER,
    "hallucination" BOOLEAN NOT NULL DEFAULT false,
    "overallScore" DOUBLE PRECISION,
    "comments" TEXT,
    "reviewedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiraHumanReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiraCertification" (
    "id" TEXT NOT NULL,
    "status" "MiraCertificationStatus" NOT NULL DEFAULT 'TRAINEE',
    "benchmarkRunId" TEXT,
    "roleAccuracy" DOUBLE PRECISION,
    "routeAccuracy" DOUBLE PRECISION,
    "dateTimeAccuracy" DOUBLE PRECISION,
    "seatAccuracy" DOUBLE PRECISION,
    "phoneAccuracy" DOUBLE PRECISION,
    "hallucinationRate" DOUBLE PRECISION,
    "decidedByAdminId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiraCertification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiraLanguageFailure" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT,
    "messageId" TEXT,
    "category" "MiraFailureCategory" NOT NULL,
    "inputSanitized" TEXT NOT NULL,
    "expectedAnswer" TEXT,
    "actualAnswer" TEXT,
    "detectedLanguage" "Language",
    "notes" TEXT,
    "status" "MiraFailureStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedBenchmarkCaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiraLanguageFailure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JolchuRequest" (
    "id" TEXT NOT NULL,
    "traceId" TEXT,
    "conversationId" TEXT,
    "reasonCode" TEXT NOT NULL,
    "inputType" "JolchuInputType" NOT NULL,
    "rawInputSanitized" TEXT NOT NULL,
    "status" "JolchuRequestStatus" NOT NULL,
    "confidence" DOUBLE PRECISION,
    "ambiguity" BOOLEAN NOT NULL DEFAULT false,
    "requiresConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "warnings" TEXT[],
    "errorMessage" TEXT,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JolchuRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JolchuResolvedLocation" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "formattedAddress" TEXT,
    "country" TEXT,
    "region" TEXT,
    "district" TEXT,
    "settlement" TEXT,
    "locality" TEXT,
    "street" TEXT,
    "house" TEXT,
    "landmark" TEXT,
    "provider" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "ambiguity" BOOLEAN NOT NULL DEFAULT false,
    "sourceType" "JolchuInputType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JolchuResolvedLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JolchuRouteCalculation" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "roadDistanceKm" DOUBLE PRECISION,
    "straightLineDistanceKm" DOUBLE PRECISION,
    "estimatedDurationMin" DOUBLE PRECISION,
    "trafficAwareDurationMin" DOUBLE PRECISION,
    "trafficStatus" "TrafficStatus" NOT NULL DEFAULT 'UNKNOWN',
    "trafficDelayMinutes" DOUBLE PRECISION,
    "tollFlag" BOOLEAN NOT NULL DEFAULT false,
    "ferryFlag" BOOLEAN NOT NULL DEFAULT false,
    "unpavedRoadFlag" BOOLEAN NOT NULL DEFAULT false,
    "roadClosureFlag" BOOLEAN NOT NULL DEFAULT false,
    "mainRouteDistanceKm" DOUBLE PRECISION,
    "lastMileDetected" BOOLEAN NOT NULL DEFAULT false,
    "lastMileDistanceKm" DOUBLE PRECISION,
    "totalDistanceKm" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "warnings" TEXT[],
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JolchuRouteCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JolchuRouteSegmentRecord" (
    "id" TEXT NOT NULL,
    "routeCalculationId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "fromLabel" TEXT,
    "toLabel" TEXT,
    "distanceKm" DOUBLE PRECISION,
    "durationMin" DOUBLE PRECISION,

    CONSTRAINT "JolchuRouteSegmentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JolchuProviderExecution" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "attemptOrder" INTEGER NOT NULL DEFAULT 1,
    "ok" BOOLEAN NOT NULL,
    "latencyMs" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JolchuProviderExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JolchuLocationAmbiguity" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "rawInput" TEXT NOT NULL,
    "candidates" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolvedLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JolchuLocationAmbiguity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JolchuBenchmarkCase" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "inputType" "JolchuInputType" NOT NULL,
    "rawInput" TEXT NOT NULL,
    "expectedJolchuRequired" BOOLEAN NOT NULL,
    "expectedReasonCode" TEXT,
    "expectedStatus" TEXT,
    "expectedSourceType" TEXT,
    "difficulty" TEXT NOT NULL DEFAULT 'MEDIUM',
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JolchuBenchmarkCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JolchuBenchmarkRun" (
    "id" TEXT NOT NULL,
    "modelProvider" TEXT NOT NULL,
    "routeProvider" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "totalCases" INTEGER NOT NULL DEFAULT 0,
    "passedCases" INTEGER NOT NULL DEFAULT 0,
    "routingDecisionAccuracy" DOUBLE PRECISION,
    "locationResolutionAccuracy" DOUBLE PRECISION,
    "routeCalculationAccuracy" DOUBLE PRECISION,
    "fallbackHandledCorrectly" DOUBLE PRECISION,
    "hallucinationCount" INTEGER NOT NULL DEFAULT 0,
    "overallScore" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "JolchuBenchmarkRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JolchuBenchmarkResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JolchuBenchmarkResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JolchuDataRefreshRun" (
    "id" TEXT NOT NULL,
    "status" "JolchuRefreshStatus" NOT NULL,
    "refreshVersion" TEXT NOT NULL,
    "providerSnapshot" JSONB,
    "triggeredBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "errors" TEXT[],
    "notes" TEXT,

    CONSTRAINT "JolchuDataRefreshRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "conversationId" TEXT,
    "channel" "Channel" NOT NULL,
    "language" "Language" NOT NULL,
    "senderContact" TEXT NOT NULL,
    "pickupText" TEXT NOT NULL,
    "pickupContact" TEXT,
    "destinationText" TEXT NOT NULL,
    "recipientContact" TEXT,
    "cargoDescription" TEXT,
    "pieces" INTEGER,
    "weightKg" DOUBLE PRECISION,
    "dimensions" TEXT,
    "declaredValueSom" INTEGER,
    "fragile" BOOLEAN NOT NULL DEFAULT false,
    "perishable" BOOLEAN NOT NULL DEFAULT false,
    "temperatureControlled" BOOLEAN NOT NULL DEFAULT false,
    "specialHandling" TEXT,
    "preferredPickupTime" TEXT,
    "deliveryDeadline" TIMESTAMP(3),
    "serviceLevel" TEXT NOT NULL DEFAULT 'STANDARD',
    "doorToDoor" BOOLEAN NOT NULL DEFAULT true,
    "riskLevel" "ShipmentRiskLevel" NOT NULL DEFAULT 'LOW',
    "riskFlags" TEXT[],
    "riskReason" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'DRAFT',
    "missingFields" TEXT[],
    "selectedQuoteId" TEXT,
    "assignedExecutorId" TEXT,
    "cancelReason" TEXT,
    "traceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentLeg" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" "ShipmentLegKind" NOT NULL,
    "originText" TEXT NOT NULL,
    "destinationText" TEXT NOT NULL,
    "executorId" TEXT,
    "status" "ShipmentLegStatus" NOT NULL DEFAULT 'PLANNED',
    "plannedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "handoffCode" TEXT,
    "handoffNote" TEXT,
    "handoffPhotoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipmentLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentQuote" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "providerCode" TEXT NOT NULL,
    "executorId" TEXT,
    "priceSom" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'KGS',
    "priceSource" "ShipmentQuoteSource" NOT NULL,
    "estimatedPickupAt" TIMESTAMP(3),
    "estimatedDeliveryAt" TIMESTAMP(3),
    "serviceType" TEXT NOT NULL,
    "doorToDoor" BOOLEAN NOT NULL DEFAULT true,
    "lastMileIncluded" BOOLEAN NOT NULL DEFAULT true,
    "confidence" DOUBLE PRECISION,
    "rankScore" DOUBLE PRECISION,
    "rankReasons" TEXT[],
    "restrictions" TEXT,
    "cancellationTerms" TEXT,
    "notes" TEXT,
    "status" "ShipmentQuoteStatus" NOT NULL DEFAULT 'OFFERED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryExecutor" (
    "id" TEXT NOT NULL,
    "source" "DeliveryExecutorSource" NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "company" TEXT,
    "vehicleType" TEXT,
    "zones" TEXT[],
    "partnerId" TEXT,
    "status" "DeliveryExecutorStatus" NOT NULL DEFAULT 'ACTIVE',
    "reliabilityScore" DOUBLE PRECISION,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "completedOrders" INTEGER NOT NULL DEFAULT 0,
    "cancelledOrders" INTEGER NOT NULL DEFAULT 0,
    "lateCount" INTEGER NOT NULL DEFAULT 0,
    "complaintsCount" INTEGER NOT NULL DEFAULT 0,
    "lostCount" INTEGER NOT NULL DEFAULT 0,
    "damagedCount" INTEGER NOT NULL DEFAULT 0,
    "verificationStatus" "DeliveryExecutorVerification" NOT NULL DEFAULT 'UNVERIFIED',
    "maxWeightKg" DOUBLE PRECISION,
    "maxPieces" INTEGER,
    "acceptsFragile" BOOLEAN NOT NULL DEFAULT true,
    "acceptsPerishable" BOOLEAN NOT NULL DEFAULT false,
    "acceptsTemperatureControlled" BOOLEAN NOT NULL DEFAULT false,
    "servicesDoorToDoor" BOOLEAN NOT NULL DEFAULT true,
    "servicesLastMile" BOOLEAN NOT NULL DEFAULT true,
    "servicesIntercity" BOOLEAN NOT NULL DEFAULT true,
    "servicesSameDay" BOOLEAN NOT NULL DEFAULT false,
    "servicesExpress" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "blacklistReason" TEXT,
    "blacklistedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryExecutor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentIncident" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "legId" TEXT,
    "type" TEXT NOT NULL,
    "severity" "ShipmentIncidentSeverity" NOT NULL,
    "status" "ShipmentIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "openedByType" "ActorType" NOT NULL,
    "openedById" TEXT,
    "description" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "escalatedAt" TIMESTAMP(3),

    CONSTRAINT "ShipmentIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentDestination" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "environment" "PaymentDestinationEnvironment" NOT NULL DEFAULT 'SANDBOX',
    "method" TEXT NOT NULL,
    "accountReference" TEXT,
    "qrPayload" TEXT,
    "instructionsText" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentDestination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentPayment" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "orderReference" TEXT NOT NULL,
    "amountExpectedSom" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KGS',
    "status" "ShipmentPaymentStatus" NOT NULL DEFAULT 'PAYMENT_REQUIRED',
    "destinationId" TEXT,
    "instructionsIssuedAt" TIMESTAMP(3),
    "evidenceType" "PaymentEvidenceType",
    "evidenceReference" TEXT,
    "evidenceReceivedAt" TIMESTAMP(3),
    "claimedAmountSom" INTEGER,
    "claimedCurrency" TEXT,
    "claimedPaymentTime" TIMESTAMP(3),
    "transactionReference" TEXT,
    "preliminaryCheckStatus" "PaymentPreliminaryCheckStatus" NOT NULL DEFAULT 'PENDING',
    "preliminaryCheckNotes" TEXT,
    "discrepancyFlags" TEXT[],
    "treasuryReviewStatus" "PaymentTreasuryReviewStatus" NOT NULL DEFAULT 'PENDING',
    "treasuryReviewedAt" TIMESTAMP(3),
    "treasuryReviewerId" TEXT,
    "confirmedAmountSom" INTEGER,
    "confirmedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "mismatchReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShipmentPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdiletCase" (
    "id" TEXT NOT NULL,
    "caseType" "AdiletCaseType" NOT NULL,
    "severity" "AdiletSeverity" NOT NULL DEFAULT 'NORMAL',
    "status" "AdiletCaseStatus" NOT NULL DEFAULT 'OPEN',
    "reviewMode" "AdiletReviewMode" NOT NULL DEFAULT 'ADILET_REVIEW',
    "sourceAgent" "AgentName",
    "openedByType" "ActorType" NOT NULL,
    "openedById" TEXT,
    "relatedUserId" TEXT,
    "relatedExecutorId" TEXT,
    "shipmentId" TEXT,
    "tripId" TEXT,
    "paymentId" TEXT,
    "managerContext" TEXT,
    "summary" TEXT NOT NULL,
    "allegation" TEXT NOT NULL,
    "evidenceSummary" TEXT,
    "appealStatus" "AdiletAppealStatus" NOT NULL DEFAULT 'NO_APPEAL',
    "sourceEventKey" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdiletCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdiletEvidence" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" "AdiletEvidenceType" NOT NULL,
    "factStatus" "AdiletFactStatus" NOT NULL DEFAULT 'CLAIM',
    "trust" "AdiletEvidenceTrust" NOT NULL DEFAULT 'MEDIUM',
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdiletEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdiletDecision" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "outcome" "AdiletDecisionOutcome" NOT NULL,
    "findings" TEXT NOT NULL,
    "verifiedFacts" TEXT[],
    "disputedFacts" TEXT[],
    "insufficientEvidence" BOOLEAN NOT NULL DEFAULT false,
    "policyBasis" TEXT NOT NULL,
    "proportionalityReason" TEXT,
    "duration" TEXT,
    "appealAllowed" BOOLEAN NOT NULL DEFAULT true,
    "reviewAfter" TIMESTAMP(3),
    "decidedByActorType" "ActorType" NOT NULL,
    "decidedByActorId" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersedesDecisionId" TEXT,

    CONSTRAINT "AdiletDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdiletSanction" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "subjectType" "AdiletSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "sanctionType" "AdiletSanctionType" NOT NULL,
    "status" "AdiletSanctionStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "reversedAt" TIMESTAMP(3),
    "reversedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdiletSanction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdiletAppeal" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "status" "AdiletAppealStatus" NOT NULL DEFAULT 'APPEAL_REQUESTED',
    "requestedByActorType" "ActorType" NOT NULL,
    "requestedById" TEXT,
    "requestReason" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByActorId" TEXT,
    "reviewNotes" TEXT,
    "reviewDecisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdiletAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreasuryTransaction" (
    "id" TEXT NOT NULL,
    "externalTransactionId" TEXT NOT NULL,
    "accountRef" TEXT NOT NULL,
    "department" "TreasuryDepartment" NOT NULL DEFAULT 'CARGO',
    "amountSom" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KGS',
    "paymentReference" TEXT,
    "counterpartyMasked" TEXT,
    "transactionTime" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "TreasuryTransactionStatus" NOT NULL DEFAULT 'RECEIVED',
    "matchedPaymentId" TEXT,
    "matchedAt" TIMESTAMP(3),
    "reconciliationNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreasuryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountantCase" (
    "id" TEXT NOT NULL,
    "caseType" "AccountantCaseType" NOT NULL,
    "status" "AccountantCaseStatus" NOT NULL DEFAULT 'OPEN',
    "department" "TreasuryDepartment" NOT NULL DEFAULT 'CARGO',
    "relatedPaymentId" TEXT,
    "relatedTransactionId" TEXT,
    "amountSom" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'KGS',
    "summary" TEXT NOT NULL,
    "openedByType" "ActorType" NOT NULL,
    "openedById" TEXT,
    "sourceEventKey" TEXT,
    "assignedAccountantId" TEXT,
    "resolutionType" TEXT,
    "resolutionSummary" TEXT,
    "resolutionRecordedAt" TIMESTAMP(3),
    "resolutionRecordedById" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountantCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledJobRun" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "status" "ScheduledJobStatus" NOT NULL DEFAULT 'RUNNING',
    "triggeredBy" TEXT NOT NULL,
    "resultRefId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "errors" TEXT[],

    CONSTRAINT "ScheduledJobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FounderBrief" (
    "id" TEXT NOT NULL,
    "reportDate" TEXT NOT NULL,
    "overallStatus" "RtStatus" NOT NULL,
    "sections" JSONB NOT NULL,
    "sourceSnapshotAt" TIMESTAMP(3) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobRunId" TEXT,

    CONSTRAINT "FounderBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyDirectorReport" (
    "id" TEXT NOT NULL,
    "weekStartDate" TEXT NOT NULL,
    "weekEndDate" TEXT NOT NULL,
    "kpis" JSONB NOT NULL,
    "problems" JSONB NOT NULL,
    "executiveSummary" TEXT NOT NULL,
    "sourceSnapshotAt" TIMESTAMP(3) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "jobRunId" TEXT,

    CONSTRAINT "WeeklyDirectorReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectorInitiative" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "proposal" TEXT NOT NULL,
    "whyNow" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "expectedEffect" TEXT NOT NULL,
    "complexity" TEXT NOT NULL,
    "resources" TEXT,
    "risks" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "successMetric" TEXT NOT NULL,
    "status" "FounderInitiativeStatus" NOT NULL DEFAULT 'PROPOSED',
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decisionAt" TIMESTAMP(3),
    "decisionByActorId" TEXT,
    "decisionNote" TEXT,
    "implementationResult" TEXT,
    "measuredEffect" TEXT,
    "measuredAt" TIMESTAMP(3),

    CONSTRAINT "DirectorInitiative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmergencyIncident" (
    "id" TEXT NOT NULL,
    "source" "AgentName",
    "severity" "Severity" NOT NULL,
    "correlationId" TEXT,
    "relatedEntities" JSONB,
    "whatHappened" TEXT NOT NULL,
    "currentStatus" TEXT NOT NULL,
    "peopleOrdersMoneyAffected" TEXT,
    "actionsTaken" TEXT,
    "immediateRisks" TEXT,
    "availableOptions" TEXT,
    "recommendation" TEXT,
    "decisionRequired" TEXT,
    "decisionDeadline" TIMESTAMP(3),
    "founderResponse" TEXT,
    "resolutionStatus" "EmergencyResolutionStatus" NOT NULL DEFAULT 'OPEN',
    "sourceEventKey" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "EmergencyIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "channel" TEXT,
    "founderBriefId" TEXT,
    "weeklyReportId" TEXT,
    "emergencyIncidentId" TEXT,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriveCrmEvent" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "tripId" TEXT,
    "offerId" TEXT,
    "eventType" "DriveCrmEventType" NOT NULL,
    "incidentStatus" "DriveCrmIncidentStatus",
    "etaMinutes" INTEGER,
    "source" TEXT NOT NULL,
    "details" JSONB,
    "correctsEventId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriveCrmEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcquisitionOutreachEvent" (
    "id" TEXT NOT NULL,
    "contractorAgent" "AgentName" NOT NULL,
    "prospectType" "AcquisitionProspectType" NOT NULL,
    "prospectRef" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "sourceType" "AcquisitionSourceType" NOT NULL,
    "sourceRef" TEXT,
    "status" "OutreachStatus" NOT NULL,
    "messageSummary" TEXT NOT NULL,
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcquisitionOutreachEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PassengerProspect" (
    "id" TEXT NOT NULL,
    "sourceType" "AcquisitionSourceType" NOT NULL,
    "sourceGroupId" TEXT,
    "sourceText" TEXT NOT NULL,
    "rawPhone" TEXT,
    "rawTelegramUsername" TEXT,
    "rawRouteText" TEXT,
    "rawOriginStopId" TEXT,
    "rawDestinationStopId" TEXT,
    "rawTravelDate" DATE,
    "normalizedPhone" TEXT,
    "status" "PassengerProspectStatus" NOT NULL DEFAULT 'NEW',
    "convertedTripRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PassengerProspect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessProspect" (
    "id" TEXT NOT NULL,
    "sourceType" "AcquisitionSourceType" NOT NULL,
    "sourceRef" TEXT,
    "sourceText" TEXT NOT NULL,
    "businessName" TEXT,
    "category" "BusinessCategory" NOT NULL,
    "contactPhone" TEXT,
    "contactHandle" TEXT,
    "deliveryPotentialNote" TEXT,
    "status" "BusinessProspectStatus" NOT NULL DEFAULT 'PROSPECT',
    "linkedPartnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessProspect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryCrmEvent" (
    "id" TEXT NOT NULL,
    "businessProspectId" TEXT NOT NULL,
    "eventType" "DeliveryCrmEventType" NOT NULL,
    "details" JSONB,
    "source" TEXT NOT NULL,
    "correctsEventId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryCrmEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Corridor_key_key" ON "Corridor"("key");

-- CreateIndex
CREATE INDEX "Stop_corridorId_order_idx" ON "Stop"("corridorId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Stop_corridorId_key_key" ON "Stop"("corridorId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Passenger_whatsappId_key" ON "Passenger"("whatsappId");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_telegramUserId_key" ON "Driver"("telegramUserId");

-- CreateIndex
CREATE INDEX "TripRequest_status_travelDate_idx" ON "TripRequest"("status", "travelDate");

-- CreateIndex
CREATE INDEX "TripRequest_originStopId_destinationStopId_travelDate_idx" ON "TripRequest"("originStopId", "destinationStopId", "travelDate");

-- CreateIndex
CREATE INDEX "DriverOffer_status_travelDate_idx" ON "DriverOffer"("status", "travelDate");

-- CreateIndex
CREATE INDEX "DriverOffer_originStopId_destinationStopId_travelDate_idx" ON "DriverOffer"("originStopId", "destinationStopId", "travelDate");

-- CreateIndex
CREATE INDEX "Match_status_idx" ON "Match"("status");

-- CreateIndex
CREATE INDEX "Match_status_expiresAt_idx" ON "Match"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Trip_matchId_key" ON "Trip"("matchId");

-- CreateIndex
CREATE INDEX "Trip_status_idx" ON "Trip"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RtBalance_driverId_key" ON "RtBalance"("driverId");

-- CreateIndex
CREATE INDEX "LedgerEntry_driverId_createdAt_idx" ON "LedgerEntry"("driverId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_tripId_idx" ON "LedgerEntry"("tripId");

-- CreateIndex
CREATE INDEX "Parcel_status_createdAt_idx" ON "Parcel"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ScoutCandidate_reviewStatus_createdAt_idx" ON "ScoutCandidate"("reviewStatus", "createdAt");

-- CreateIndex
CREATE INDEX "ScoutCandidate_normalizedPhone_idx" ON "ScoutCandidate"("normalizedPhone");

-- CreateIndex
CREATE INDEX "SupportCase_status_createdAt_idx" ON "SupportCase"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramGroup_chatId_key" ON "TelegramGroup"("chatId");

-- CreateIndex
CREATE INDEX "RawMessage_channel_chatId_createdAt_idx" ON "RawMessage"("channel", "chatId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLogEntry_entityType_entityId_idx" ON "AuditLogEntry"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLogEntry_createdAt_idx" ON "AuditLogEntry"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLogEntry_traceId_idx" ON "AuditLogEntry"("traceId");

-- CreateIndex
CREATE UNIQUE INDEX "DispatcherUser_username_key" ON "DispatcherUser"("username");

-- CreateIndex
CREATE INDEX "MiraConversation_channel_externalUserId_updatedAt_idx" ON "MiraConversation"("channel", "externalUserId", "updatedAt");

-- CreateIndex
CREATE INDEX "MiraConversation_status_idx" ON "MiraConversation"("status");

-- CreateIndex
CREATE INDEX "MiraMessage_conversationId_createdAt_idx" ON "MiraMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "MiraProviderCall_createdAt_idx" ON "MiraProviderCall"("createdAt");

-- CreateIndex
CREATE INDEX "MiraProviderCall_provider_purpose_idx" ON "MiraProviderCall"("provider", "purpose");

-- CreateIndex
CREATE INDEX "MiraTrainingExample_level_idx" ON "MiraTrainingExample"("level");

-- CreateIndex
CREATE INDEX "MiraTrainingExample_language_idx" ON "MiraTrainingExample"("language");

-- CreateIndex
CREATE INDEX "MiraTrainingExample_sourceType_idx" ON "MiraTrainingExample"("sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "MiraBenchmarkCase_code_key" ON "MiraBenchmarkCase"("code");

-- CreateIndex
CREATE INDEX "MiraBenchmarkCase_difficulty_idx" ON "MiraBenchmarkCase"("difficulty");

-- CreateIndex
CREATE INDEX "MiraBenchmarkResult_runId_idx" ON "MiraBenchmarkResult"("runId");

-- CreateIndex
CREATE INDEX "MiraBenchmarkResult_caseId_idx" ON "MiraBenchmarkResult"("caseId");

-- CreateIndex
CREATE INDEX "MiraHumanReview_createdAt_idx" ON "MiraHumanReview"("createdAt");

-- CreateIndex
CREATE INDEX "MiraCertification_createdAt_idx" ON "MiraCertification"("createdAt");

-- CreateIndex
CREATE INDEX "MiraLanguageFailure_status_idx" ON "MiraLanguageFailure"("status");

-- CreateIndex
CREATE INDEX "MiraLanguageFailure_category_idx" ON "MiraLanguageFailure"("category");

-- CreateIndex
CREATE INDEX "JolchuRequest_createdAt_idx" ON "JolchuRequest"("createdAt");

-- CreateIndex
CREATE INDEX "JolchuRequest_reasonCode_idx" ON "JolchuRequest"("reasonCode");

-- CreateIndex
CREATE INDEX "JolchuRequest_status_idx" ON "JolchuRequest"("status");

-- CreateIndex
CREATE INDEX "JolchuResolvedLocation_requestId_idx" ON "JolchuResolvedLocation"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "JolchuRouteCalculation_requestId_key" ON "JolchuRouteCalculation"("requestId");

-- CreateIndex
CREATE INDEX "JolchuRouteCalculation_requestId_idx" ON "JolchuRouteCalculation"("requestId");

-- CreateIndex
CREATE INDEX "JolchuRouteSegmentRecord_routeCalculationId_idx" ON "JolchuRouteSegmentRecord"("routeCalculationId");

-- CreateIndex
CREATE INDEX "JolchuProviderExecution_requestId_idx" ON "JolchuProviderExecution"("requestId");

-- CreateIndex
CREATE INDEX "JolchuProviderExecution_provider_purpose_idx" ON "JolchuProviderExecution"("provider", "purpose");

-- CreateIndex
CREATE INDEX "JolchuProviderExecution_createdAt_idx" ON "JolchuProviderExecution"("createdAt");

-- CreateIndex
CREATE INDEX "JolchuLocationAmbiguity_requestId_idx" ON "JolchuLocationAmbiguity"("requestId");

-- CreateIndex
CREATE INDEX "JolchuLocationAmbiguity_status_idx" ON "JolchuLocationAmbiguity"("status");

-- CreateIndex
CREATE UNIQUE INDEX "JolchuBenchmarkCase_code_key" ON "JolchuBenchmarkCase"("code");

-- CreateIndex
CREATE INDEX "JolchuBenchmarkCase_difficulty_idx" ON "JolchuBenchmarkCase"("difficulty");

-- CreateIndex
CREATE INDEX "JolchuBenchmarkResult_runId_idx" ON "JolchuBenchmarkResult"("runId");

-- CreateIndex
CREATE INDEX "JolchuBenchmarkResult_caseId_idx" ON "JolchuBenchmarkResult"("caseId");

-- CreateIndex
CREATE INDEX "JolchuDataRefreshRun_startedAt_idx" ON "JolchuDataRefreshRun"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_publicId_key" ON "Shipment"("publicId");

-- CreateIndex
CREATE INDEX "Shipment_status_createdAt_idx" ON "Shipment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Shipment_senderContact_idx" ON "Shipment"("senderContact");

-- CreateIndex
CREATE INDEX "Shipment_conversationId_idx" ON "Shipment"("conversationId");

-- CreateIndex
CREATE INDEX "ShipmentLeg_shipmentId_sequence_idx" ON "ShipmentLeg"("shipmentId", "sequence");

-- CreateIndex
CREATE INDEX "ShipmentLeg_executorId_idx" ON "ShipmentLeg"("executorId");

-- CreateIndex
CREATE INDEX "ShipmentQuote_shipmentId_status_idx" ON "ShipmentQuote"("shipmentId", "status");

-- CreateIndex
CREATE INDEX "DeliveryExecutor_status_idx" ON "DeliveryExecutor"("status");

-- CreateIndex
CREATE INDEX "DeliveryExecutor_source_idx" ON "DeliveryExecutor"("source");

-- CreateIndex
CREATE INDEX "ShipmentIncident_shipmentId_status_idx" ON "ShipmentIncident"("shipmentId", "status");

-- CreateIndex
CREATE INDEX "ShipmentIncident_severity_status_idx" ON "ShipmentIncident"("severity", "status");

-- CreateIndex
CREATE INDEX "PaymentDestination_environment_isActive_idx" ON "PaymentDestination"("environment", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentPayment_shipmentId_key" ON "ShipmentPayment"("shipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentPayment_orderReference_key" ON "ShipmentPayment"("orderReference");

-- CreateIndex
CREATE INDEX "ShipmentPayment_status_idx" ON "ShipmentPayment"("status");

-- CreateIndex
CREATE INDEX "ShipmentPayment_transactionReference_idx" ON "ShipmentPayment"("transactionReference");

-- CreateIndex
CREATE UNIQUE INDEX "AdiletCase_sourceEventKey_key" ON "AdiletCase"("sourceEventKey");

-- CreateIndex
CREATE INDEX "AdiletCase_status_severity_idx" ON "AdiletCase"("status", "severity");

-- CreateIndex
CREATE INDEX "AdiletCase_relatedExecutorId_status_idx" ON "AdiletCase"("relatedExecutorId", "status");

-- CreateIndex
CREATE INDEX "AdiletCase_relatedUserId_status_idx" ON "AdiletCase"("relatedUserId", "status");

-- CreateIndex
CREATE INDEX "AdiletCase_shipmentId_idx" ON "AdiletCase"("shipmentId");

-- CreateIndex
CREATE INDEX "AdiletCase_caseType_status_idx" ON "AdiletCase"("caseType", "status");

-- CreateIndex
CREATE INDEX "AdiletCase_openedAt_idx" ON "AdiletCase"("openedAt");

-- CreateIndex
CREATE INDEX "AdiletEvidence_caseId_idx" ON "AdiletEvidence"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "AdiletDecision_supersedesDecisionId_key" ON "AdiletDecision"("supersedesDecisionId");

-- CreateIndex
CREATE INDEX "AdiletDecision_caseId_idx" ON "AdiletDecision"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "AdiletSanction_decisionId_key" ON "AdiletSanction"("decisionId");

-- CreateIndex
CREATE INDEX "AdiletSanction_subjectType_subjectId_status_idx" ON "AdiletSanction"("subjectType", "subjectId", "status");

-- CreateIndex
CREATE INDEX "AdiletSanction_status_expiresAt_idx" ON "AdiletSanction"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "AdiletSanction_caseId_idx" ON "AdiletSanction"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "AdiletAppeal_reviewDecisionId_key" ON "AdiletAppeal"("reviewDecisionId");

-- CreateIndex
CREATE INDEX "AdiletAppeal_caseId_idx" ON "AdiletAppeal"("caseId");

-- CreateIndex
CREATE INDEX "AdiletAppeal_status_idx" ON "AdiletAppeal"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TreasuryTransaction_externalTransactionId_key" ON "TreasuryTransaction"("externalTransactionId");

-- CreateIndex
CREATE INDEX "TreasuryTransaction_externalTransactionId_idx" ON "TreasuryTransaction"("externalTransactionId");

-- CreateIndex
CREATE INDEX "TreasuryTransaction_paymentReference_idx" ON "TreasuryTransaction"("paymentReference");

-- CreateIndex
CREATE INDEX "TreasuryTransaction_status_idx" ON "TreasuryTransaction"("status");

-- CreateIndex
CREATE INDEX "TreasuryTransaction_transactionTime_idx" ON "TreasuryTransaction"("transactionTime");

-- CreateIndex
CREATE INDEX "TreasuryTransaction_department_idx" ON "TreasuryTransaction"("department");

-- CreateIndex
CREATE INDEX "TreasuryTransaction_accountRef_idx" ON "TreasuryTransaction"("accountRef");

-- CreateIndex
CREATE UNIQUE INDEX "AccountantCase_sourceEventKey_key" ON "AccountantCase"("sourceEventKey");

-- CreateIndex
CREATE INDEX "AccountantCase_status_caseType_idx" ON "AccountantCase"("status", "caseType");

-- CreateIndex
CREATE INDEX "AccountantCase_department_status_idx" ON "AccountantCase"("department", "status");

-- CreateIndex
CREATE INDEX "AccountantCase_relatedPaymentId_idx" ON "AccountantCase"("relatedPaymentId");

-- CreateIndex
CREATE INDEX "AccountantCase_relatedTransactionId_idx" ON "AccountantCase"("relatedTransactionId");

-- CreateIndex
CREATE INDEX "AccountantCase_openedAt_idx" ON "AccountantCase"("openedAt");

-- CreateIndex
CREATE INDEX "ScheduledJobRun_jobName_status_idx" ON "ScheduledJobRun"("jobName", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledJobRun_jobName_periodKey_key" ON "ScheduledJobRun"("jobName", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "FounderBrief_reportDate_key" ON "FounderBrief"("reportDate");

-- CreateIndex
CREATE INDEX "FounderBrief_generatedAt_idx" ON "FounderBrief"("generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyDirectorReport_weekStartDate_key" ON "WeeklyDirectorReport"("weekStartDate");

-- CreateIndex
CREATE INDEX "WeeklyDirectorReport_generatedAt_idx" ON "WeeklyDirectorReport"("generatedAt");

-- CreateIndex
CREATE INDEX "DirectorInitiative_reportId_idx" ON "DirectorInitiative"("reportId");

-- CreateIndex
CREATE INDEX "DirectorInitiative_status_idx" ON "DirectorInitiative"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyIncident_sourceEventKey_key" ON "EmergencyIncident"("sourceEventKey");

-- CreateIndex
CREATE INDEX "EmergencyIncident_resolutionStatus_severity_idx" ON "EmergencyIncident"("resolutionStatus", "severity");

-- CreateIndex
CREATE INDEX "EmergencyIncident_detectedAt_idx" ON "EmergencyIncident"("detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_idempotencyKey_key" ON "NotificationDelivery"("idempotencyKey");

-- CreateIndex
CREATE INDEX "NotificationDelivery_kind_status_idx" ON "NotificationDelivery"("kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DriveCrmEvent_idempotencyKey_key" ON "DriveCrmEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "DriveCrmEvent_driverId_eventType_createdAt_idx" ON "DriveCrmEvent"("driverId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "DriveCrmEvent_driverId_eventType_incidentStatus_idx" ON "DriveCrmEvent"("driverId", "eventType", "incidentStatus");

-- CreateIndex
CREATE INDEX "DriveCrmEvent_correctsEventId_idx" ON "DriveCrmEvent"("correctsEventId");

-- CreateIndex
CREATE UNIQUE INDEX "AcquisitionOutreachEvent_idempotencyKey_key" ON "AcquisitionOutreachEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AcquisitionOutreachEvent_prospectType_prospectRef_createdAt_idx" ON "AcquisitionOutreachEvent"("prospectType", "prospectRef", "createdAt");

-- CreateIndex
CREATE INDEX "AcquisitionOutreachEvent_contractorAgent_createdAt_idx" ON "AcquisitionOutreachEvent"("contractorAgent", "createdAt");

-- CreateIndex
CREATE INDEX "PassengerProspect_status_createdAt_idx" ON "PassengerProspect"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PassengerProspect_normalizedPhone_idx" ON "PassengerProspect"("normalizedPhone");

-- CreateIndex
CREATE INDEX "BusinessProspect_status_createdAt_idx" ON "BusinessProspect"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessProspect_category_status_idx" ON "BusinessProspect"("category", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryCrmEvent_idempotencyKey_key" ON "DeliveryCrmEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "DeliveryCrmEvent_businessProspectId_eventType_createdAt_idx" ON "DeliveryCrmEvent"("businessProspectId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryCrmEvent_correctsEventId_idx" ON "DeliveryCrmEvent"("correctsEventId");

-- AddForeignKey
ALTER TABLE "Stop" ADD CONSTRAINT "Stop_corridorId_fkey" FOREIGN KEY ("corridorId") REFERENCES "Corridor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripRequest" ADD CONSTRAINT "TripRequest_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "Passenger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripRequest" ADD CONSTRAINT "TripRequest_originStopId_fkey" FOREIGN KEY ("originStopId") REFERENCES "Stop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripRequest" ADD CONSTRAINT "TripRequest_destinationStopId_fkey" FOREIGN KEY ("destinationStopId") REFERENCES "Stop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripRequest" ADD CONSTRAINT "TripRequest_rawMessageId_fkey" FOREIGN KEY ("rawMessageId") REFERENCES "RawMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverOffer" ADD CONSTRAINT "DriverOffer_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverOffer" ADD CONSTRAINT "DriverOffer_originStopId_fkey" FOREIGN KEY ("originStopId") REFERENCES "Stop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverOffer" ADD CONSTRAINT "DriverOffer_destinationStopId_fkey" FOREIGN KEY ("destinationStopId") REFERENCES "Stop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverOffer" ADD CONSTRAINT "DriverOffer_rawMessageId_fkey" FOREIGN KEY ("rawMessageId") REFERENCES "RawMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverOffer" ADD CONSTRAINT "DriverOffer_generatedFromTripId_fkey" FOREIGN KEY ("generatedFromTripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_tripRequestId_fkey" FOREIGN KEY ("tripRequestId") REFERENCES "TripRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_driverOfferId_fkey" FOREIGN KEY ("driverOfferId") REFERENCES "DriverOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "Passenger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_driverOfferId_fkey" FOREIGN KEY ("driverOfferId") REFERENCES "DriverOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RtBalance" ADD CONSTRAINT "RtBalance_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parcel" ADD CONSTRAINT "Parcel_originStopId_fkey" FOREIGN KEY ("originStopId") REFERENCES "Stop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parcel" ADD CONSTRAINT "Parcel_destinationStopId_fkey" FOREIGN KEY ("destinationStopId") REFERENCES "Stop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parcel" ADD CONSTRAINT "Parcel_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parcel" ADD CONSTRAINT "Parcel_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoutCandidate" ADD CONSTRAINT "ScoutCandidate_linkedDriverId_fkey" FOREIGN KEY ("linkedDriverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "Stop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawMessage" ADD CONSTRAINT "RawMessage_telegramGroupId_fkey" FOREIGN KEY ("telegramGroupId") REFERENCES "TelegramGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiraMessage" ADD CONSTRAINT "MiraMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "MiraConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiraBenchmarkResult" ADD CONSTRAINT "MiraBenchmarkResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MiraBenchmarkRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiraBenchmarkResult" ADD CONSTRAINT "MiraBenchmarkResult_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "MiraBenchmarkCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JolchuResolvedLocation" ADD CONSTRAINT "JolchuResolvedLocation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "JolchuRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JolchuRouteCalculation" ADD CONSTRAINT "JolchuRouteCalculation_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "JolchuRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JolchuRouteSegmentRecord" ADD CONSTRAINT "JolchuRouteSegmentRecord_routeCalculationId_fkey" FOREIGN KEY ("routeCalculationId") REFERENCES "JolchuRouteCalculation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JolchuBenchmarkResult" ADD CONSTRAINT "JolchuBenchmarkResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "JolchuBenchmarkRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JolchuBenchmarkResult" ADD CONSTRAINT "JolchuBenchmarkResult_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "JolchuBenchmarkCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_assignedExecutorId_fkey" FOREIGN KEY ("assignedExecutorId") REFERENCES "DeliveryExecutor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLeg" ADD CONSTRAINT "ShipmentLeg_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentLeg" ADD CONSTRAINT "ShipmentLeg_executorId_fkey" FOREIGN KEY ("executorId") REFERENCES "DeliveryExecutor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentQuote" ADD CONSTRAINT "ShipmentQuote_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentQuote" ADD CONSTRAINT "ShipmentQuote_executorId_fkey" FOREIGN KEY ("executorId") REFERENCES "DeliveryExecutor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentIncident" ADD CONSTRAINT "ShipmentIncident_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentPayment" ADD CONSTRAINT "ShipmentPayment_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentPayment" ADD CONSTRAINT "ShipmentPayment_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "PaymentDestination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdiletEvidence" ADD CONSTRAINT "AdiletEvidence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "AdiletCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdiletDecision" ADD CONSTRAINT "AdiletDecision_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "AdiletCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdiletDecision" ADD CONSTRAINT "AdiletDecision_supersedesDecisionId_fkey" FOREIGN KEY ("supersedesDecisionId") REFERENCES "AdiletDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdiletSanction" ADD CONSTRAINT "AdiletSanction_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "AdiletCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdiletSanction" ADD CONSTRAINT "AdiletSanction_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "AdiletDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdiletAppeal" ADD CONSTRAINT "AdiletAppeal_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "AdiletCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdiletAppeal" ADD CONSTRAINT "AdiletAppeal_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "AdiletDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdiletAppeal" ADD CONSTRAINT "AdiletAppeal_reviewDecisionId_fkey" FOREIGN KEY ("reviewDecisionId") REFERENCES "AdiletDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountantCase" ADD CONSTRAINT "AccountantCase_relatedTransactionId_fkey" FOREIGN KEY ("relatedTransactionId") REFERENCES "TreasuryTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectorInitiative" ADD CONSTRAINT "DirectorInitiative_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "WeeklyDirectorReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_founderBriefId_fkey" FOREIGN KEY ("founderBriefId") REFERENCES "FounderBrief"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_weeklyReportId_fkey" FOREIGN KEY ("weeklyReportId") REFERENCES "WeeklyDirectorReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_emergencyIncidentId_fkey" FOREIGN KEY ("emergencyIncidentId") REFERENCES "EmergencyIncident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriveCrmEvent" ADD CONSTRAINT "DriveCrmEvent_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryCrmEvent" ADD CONSTRAINT "DeliveryCrmEvent_businessProspectId_fkey" FOREIGN KEY ("businessProspectId") REFERENCES "BusinessProspect"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

