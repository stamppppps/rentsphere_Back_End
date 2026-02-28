-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'OWNER', 'STAFF', 'TENANT');

-- CreateEnum
CREATE TYPE "VerifyChannel" AS ENUM ('EMAIL', 'PHONE');

-- CreateEnum
CREATE TYPE "CondoStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('LOGO', 'COVER', 'GALLERY', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "UtilityType" AS ENUM ('WATER', 'ELECTRIC');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "OccupancyStatus" AS ENUM ('VACANT', 'OCCUPIED', 'RESERVED');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('NORMAL', 'MAINTENANCE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "CodeStatus" AS ENUM ('ACTIVE', 'USED', 'EXPIRED', 'DISABLED');

-- CreateEnum
CREATE TYPE "ResidencyStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'CONVERTED_TO_CONTRACT');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('ACTIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PermissionModule" AS ENUM ('DASHBOARD', 'ROOMS', 'BILLING', 'PAYMENT', 'REPAIR', 'PARCEL', 'FACILITY', 'ANNOUNCE', 'CHAT', 'TENANT', 'STAFF');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ChatMessageType" AS ENUM ('TEXT', 'IMAGE', 'FILE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "RepairPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "RepairStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_PARTS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('IMAGE', 'VIDEO', 'OTHER');

-- CreateEnum
CREATE TYPE "ParcelStatus" AS ENUM ('RECEIVED', 'NOTIFIED', 'PICKED_UP', 'RETURNED');

-- CreateEnum
CREATE TYPE "NotifyChannel" AS ENUM ('LINE', 'SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "FacilityBookingStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "FacilityBookingUpdateType" AS ENUM ('COMMENT', 'STATUS_CHANGE', 'APPROVAL');

-- CreateEnum
CREATE TYPE "MeterCycleStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "MeterReadingStatus" AS ENUM ('PENDING', 'SUBMITTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceItemType" AS ENUM ('RENT', 'WATER', 'ELECTRIC', 'CHARGE', 'EXTRA', 'DISCOUNT', 'PENALTY', 'OTHER', 'FACILITY');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('TRANSFER', 'PROMPTPAY', 'CASH');

-- CreateEnum
CREATE TYPE "PaymentNoticeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentTxnStatus" AS ENUM ('PENDING', 'CONFIRMED', 'VOID');

-- CreateEnum
CREATE TYPE "TenantNotificationType" AS ENUM ('ANNOUNCE', 'INVOICE', 'PAYMENT', 'PARCEL', 'REPAIR', 'FACILITY', 'CHAT');

-- CreateEnum
CREATE TYPE "OnboardingChannel" AS ENUM ('LINE', 'WEB');

-- CreateEnum
CREATE TYPE "OnboardingEventType" AS ENUM ('ENTER_CODE', 'LINK_SUCCESS', 'LINK_FAILED');

-- CreateEnum
CREATE TYPE "RepairUpdateType" AS ENUM ('COMMENT', 'STATUS_CHANGE', 'ASSIGNMENT', 'SCHEDULE');

-- CreateEnum
CREATE TYPE "UtilityBillingType" AS ENUM ('METER', 'METER_MIN', 'FLAT');

-- CreateEnum
CREATE TYPE "CondoSetupStep" AS ENUM ('STEP_0', 'STEP_1', 'STEP_2', 'STEP_3', 'STEP_4', 'STEP_5', 'STEP_6', 'STEP_7', 'STEP_8', 'DONE');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'TENANT',
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "verifyChannel" "VerifyChannel" NOT NULL DEFAULT 'EMAIL',
    "emailVerifiedAt" TIMESTAMP(3),
    "phoneVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" UUID,
    "ip" TEXT,
    "userAgent" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerifyRequest" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "channel" "VerifyChannel" NOT NULL,
    "emailCodeHash" TEXT,
    "phoneOtpHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerifyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetRequest" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "channel" "VerifyChannel" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasswordResetRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Condo" (
    "id" UUID NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "description" TEXT,
    "totalFloors" INTEGER,
    "status" "CondoStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "addressEn" TEXT,
    "addressTh" TEXT NOT NULL,
    "nameEn" TEXT,
    "nameTh" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "taxId" TEXT,

    CONSTRAINT "Condo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CondoUtilitySetting" (
    "id" TEXT NOT NULL,
    "condoId" UUID NOT NULL,
    "utilityType" "UtilityType" NOT NULL,
    "billingType" "UtilityBillingType" NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CondoUtilitySetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CondoAsset" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "assetType" "AssetType" NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "sizeBytes" BIGINT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "uploadedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CondoAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CondoService" (
    "id" TEXT NOT NULL,
    "condoId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "isVariable" BOOLEAN NOT NULL DEFAULT false,
    "variableType" TEXT NOT NULL DEFAULT 'NONE',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CondoService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CondoBankAccount" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNo" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CondoBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CondoBillingSetting" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "acceptFine" BOOLEAN NOT NULL DEFAULT false,
    "finePerDay" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "CondoBillingSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CondoOnboarding" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "currentStep" "CondoSetupStep" NOT NULL DEFAULT 'STEP_0',
    "basicDone" BOOLEAN NOT NULL DEFAULT false,
    "chargesDone" BOOLEAN NOT NULL DEFAULT false,
    "utilityDone" BOOLEAN NOT NULL DEFAULT false,
    "bankDone" BOOLEAN NOT NULL DEFAULT false,
    "roomsDone" BOOLEAN NOT NULL DEFAULT false,
    "staffDone" BOOLEAN NOT NULL DEFAULT false,
    "confirmDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "CondoOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CondoFloor" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "floorNo" INTEGER NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "CondoFloor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UtilitySetting" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "waterEnabled" BOOLEAN NOT NULL DEFAULT true,
    "electricEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "UtilitySetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UtilityRate" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "utilityType" "UtilityType" NOT NULL,
    "ratePerUnit" DECIMAL(12,2) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UtilityRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChargeCatalog" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ChargeCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CondoCharge" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "catalogId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CondoCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomCharge" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "condoChargeId" UUID NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "amountOverride" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "RoomCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtraChargeTemplate" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "templateName" TEXT NOT NULL,
    "defaultAmount" DECIMAL(12,2) NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "ExtraChargeTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomExtraChargeAssignment" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "amountOverride" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "RoomExtraChargeAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "roomNo" TEXT NOT NULL,
    "floor" INTEGER NOT NULL,
    "rentPrice" DECIMAL(12,2) NOT NULL,
    "deposit" DECIMAL(12,2),
    "size" DECIMAL(12,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "occupancyStatus" "OccupancyStatus" NOT NULL DEFAULT 'VACANT',
    "roomStatus" "RoomStatus" NOT NULL DEFAULT 'NORMAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomStatusHistory" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "oldOccupancyStatus" "OccupancyStatus",
    "newOccupancyStatus" "OccupancyStatus",
    "oldRoomStatus" "RoomStatus",
    "newRoomStatus" "RoomStatus",
    "changedBy" UUID,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "RoomStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomMeter" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "waterMeterNo" TEXT,
    "electricMeterNo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "RoomMeter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "idType" TEXT NOT NULL,
    "idNumber" TEXT NOT NULL,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "TenantProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantEmergencyContact" (
    "id" UUID NOT NULL,
    "tenantProfileId" UUID NOT NULL,
    "contactName" TEXT NOT NULL,
    "relationship" TEXT,
    "phone" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantEmergencyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineAccount" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lineUserId" TEXT NOT NULL,
    "displayName" TEXT,
    "pictureUrl" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LineAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantRoomCode" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "contractId" UUID,
    "code" TEXT NOT NULL,
    "status" "CodeStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "usedByUserId" UUID,
    "usedAt" TIMESTAMP(3),
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantRoomCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantResidency" (
    "id" UUID NOT NULL,
    "tenantUserId" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "contractId" UUID,
    "status" "ResidencyStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantResidency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantOnboardingEvent" (
    "id" UUID NOT NULL,
    "tenantUserId" UUID,
    "lineAccountId" UUID,
    "roomCodeId" UUID,
    "channel" "OnboardingChannel" NOT NULL DEFAULT 'LINE',
    "eventType" "OnboardingEventType" NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantOnboardingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomReservation" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "reservationNo" TEXT NOT NULL,
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moveInDate" DATE NOT NULL,
    "monthlyRent" DECIMAL(12,2) NOT NULL,
    "bookingFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "createdBy" UUID,
    "note" TEXT,

    CONSTRAINT "RoomReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalContract" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "tenantUserId" UUID NOT NULL,
    "reservationId" UUID,
    "moveInDate" DATE NOT NULL,
    "moveOutDate" DATE,
    "monthlyRent" DECIMAL(12,2) NOT NULL,
    "securityDeposit" DECIMAL(12,2) NOT NULL,
    "depositPaidBy" TEXT NOT NULL,
    "bookingFeeApplied" DECIMAL(12,2) DEFAULT 0,
    "status" "ContractStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "RentalContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractMonthlyCharge" (
    "id" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "itemName" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractMonthlyCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffInvite" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "staffPosition" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffMembership" (
    "id" UUID NOT NULL,
    "staffUserId" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "staffPosition" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "StaffMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionCatalog" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "module" "PermissionModule" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PermissionCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffPermissionTemplate" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "templateName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffPermissionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffPermissionTemplateItem" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "StaffPermissionTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffPermissionAssignment" (
    "id" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "templateId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffPermissionAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffPermissionOverride" (
    "id" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffPermissionOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "coverImageUrl" TEXT,
    "status" "AnnouncementStatus" NOT NULL DEFAULT 'PUBLISHED',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementRead" (
    "id" UUID NOT NULL,
    "announcementId" UUID NOT NULL,
    "tenantUserId" UUID NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementRead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatRoom" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "roomId" UUID,
    "contractId" UUID,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatRoomMember" (
    "id" UUID NOT NULL,
    "chatRoomId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "staffMembershipId" UUID,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ChatRoomMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" UUID NOT NULL,
    "chatRoomId" UUID NOT NULL,
    "senderUserId" UUID NOT NULL,
    "messageType" "ChatMessageType" NOT NULL DEFAULT 'TEXT',
    "messageText" TEXT,
    "fileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessageRead" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessageRead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairRequest" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "roomId" UUID,
    "tenantUserId" UUID,
    "createdBy" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "RepairPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "RepairStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToMembershipId" UUID,
    "scheduledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "RepairRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairAttachment" (
    "id" UUID NOT NULL,
    "repairId" UUID NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" "AttachmentType" NOT NULL DEFAULT 'IMAGE',
    "uploadedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairUpdate" (
    "id" UUID NOT NULL,
    "repairId" UUID NOT NULL,
    "updateType" "RepairUpdateType" NOT NULL,
    "message" TEXT,
    "oldStatus" "RepairStatus",
    "newStatus" "RepairStatus",
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parcel" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "roomId" UUID,
    "tenantUserId" UUID,
    "trackingNo" TEXT,
    "carrier" TEXT,
    "senderName" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedByMembershipId" UUID,
    "status" "ParcelStatus" NOT NULL DEFAULT 'RECEIVED',
    "pickedUpAt" TIMESTAMP(3),
    "pickedUpBy" TEXT,
    "pickupNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Parcel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParcelAttachment" (
    "id" UUID NOT NULL,
    "parcelId" UUID NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "uploadedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParcelAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParcelNotification" (
    "id" UUID NOT NULL,
    "parcelId" UUID NOT NULL,
    "channel" "NotifyChannel" NOT NULL DEFAULT 'LINE',
    "sentTo" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "errorMessage" TEXT,

    CONSTRAINT "ParcelNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facility" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "facilityName" TEXT NOT NULL,
    "description" TEXT,
    "coverImageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityBookingSetting" (
    "id" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "openTime" TIME(6),
    "closeTime" TIME(6),
    "slotMinutes" INTEGER NOT NULL DEFAULT 60,
    "maxPeople" INTEGER,
    "maxBookingsPerDay" INTEGER,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "feePerSlot" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deposit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cancellationHours" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "FacilityBookingSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityBooking" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "facilityId" UUID NOT NULL,
    "roomId" UUID,
    "tenantUserId" UUID,
    "createdBy" UUID,
    "bookingDate" DATE NOT NULL,
    "startTime" TIME(6) NOT NULL,
    "endTime" TIME(6) NOT NULL,
    "peopleCount" INTEGER,
    "note" TEXT,
    "status" "FacilityBookingStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "FacilityBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityBookingUpdate" (
    "id" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "updateType" "FacilityBookingUpdateType" NOT NULL,
    "oldStatus" "FacilityBookingStatus",
    "newStatus" "FacilityBookingStatus",
    "message" TEXT,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacilityBookingUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeterCycle" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "cycleMonth" DATE NOT NULL,
    "status" "MeterCycleStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openedBy" UUID,
    "closedAt" TIMESTAMP(3),
    "closedBy" UUID,

    CONSTRAINT "MeterCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeterReading" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "cycleId" UUID NOT NULL,
    "prevWater" DECIMAL(12,2),
    "currWater" DECIMAL(12,2),
    "prevElectric" DECIMAL(12,2),
    "currElectric" DECIMAL(12,2),
    "waterUnits" DECIMAL(12,2),
    "electricUnits" DECIMAL(12,2),
    "status" "MeterReadingStatus" NOT NULL DEFAULT 'PENDING',
    "recordedAt" TIMESTAMP(3),
    "recordedBy" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeterReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeterAttachment" (
    "id" UUID NOT NULL,
    "meterReadingId" UUID NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeterAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "contractId" UUID,
    "invoiceNo" TEXT NOT NULL,
    "billingMonth" DATE NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedAt" TIMESTAMP(3),
    "dueDate" DATE,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "penaltyTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "itemType" "InvoiceItemType" NOT NULL,
    "itemName" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "condoChargeId" UUID,
    "extraChargeTemplateId" UUID,
    "meterReadingId" UUID,
    "facilityBookingId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceMeterLink" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "cycleId" UUID NOT NULL,

    CONSTRAINT "InvoiceMeterLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentNotice" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "tenantUserId" UUID,
    "paidAmount" DECIMAL(12,2) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "method" "PaymentMethod" NOT NULL,
    "bankReference" TEXT,
    "paidToAccountId" UUID,
    "status" "PaymentNoticeStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" UUID,
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttachment" (
    "id" UUID NOT NULL,
    "paymentNoticeId" UUID NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "paymentNoticeId" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paidToAccountId" UUID,
    "status" "PaymentTxnStatus" NOT NULL DEFAULT 'CONFIRMED',
    "confirmedBy" UUID,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentUpdate" (
    "id" UUID NOT NULL,
    "paymentNoticeId" UUID NOT NULL,
    "oldStatus" "PaymentNoticeStatus",
    "newStatus" "PaymentNoticeStatus",
    "message" TEXT,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantNotification" (
    "id" UUID NOT NULL,
    "tenantUserId" UUID NOT NULL,
    "condoId" UUID,
    "type" "TenantNotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "refType" TEXT,
    "refId" UUID,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardDailySnapshot" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "totalRooms" INTEGER,
    "vacantRooms" INTEGER,
    "occupiedRooms" INTEGER,
    "totalRevenue" DECIMAL(12,2),
    "totalRepairs" INTEGER,
    "totalParcels" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DashboardDailySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportMonthlySnapshot" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "month" DATE NOT NULL,
    "totalIssued" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalOutstanding" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paidCount" INTEGER NOT NULL DEFAULT 0,
    "unpaidCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportMonthlySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "VerifyRequest_userId_idx" ON "VerifyRequest"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetRequest_userId_idx" ON "PasswordResetRequest"("userId");

-- CreateIndex
CREATE INDEX "Condo_ownerUserId_idx" ON "Condo"("ownerUserId");

-- CreateIndex
CREATE INDEX "CondoUtilitySetting_condoId_idx" ON "CondoUtilitySetting"("condoId");

-- CreateIndex
CREATE UNIQUE INDEX "CondoUtilitySetting_condoId_utilityType_key" ON "CondoUtilitySetting"("condoId", "utilityType");

-- CreateIndex
CREATE INDEX "CondoAsset_condoId_idx" ON "CondoAsset"("condoId");

-- CreateIndex
CREATE INDEX "CondoService_condoId_idx" ON "CondoService"("condoId");

-- CreateIndex
CREATE UNIQUE INDEX "CondoService_condoId_name_key" ON "CondoService"("condoId", "name");

-- CreateIndex
CREATE INDEX "CondoBankAccount_condoId_idx" ON "CondoBankAccount"("condoId");

-- CreateIndex
CREATE UNIQUE INDEX "CondoBillingSetting_condoId_key" ON "CondoBillingSetting"("condoId");

-- CreateIndex
CREATE UNIQUE INDEX "CondoOnboarding_condoId_key" ON "CondoOnboarding"("condoId");

-- CreateIndex
CREATE INDEX "CondoFloor_condoId_idx" ON "CondoFloor"("condoId");

-- CreateIndex
CREATE UNIQUE INDEX "CondoFloor_condoId_floorNo_key" ON "CondoFloor"("condoId", "floorNo");

-- CreateIndex
CREATE UNIQUE INDEX "UtilitySetting_condoId_key" ON "UtilitySetting"("condoId");

-- CreateIndex
CREATE INDEX "UtilityRate_condoId_utilityType_idx" ON "UtilityRate"("condoId", "utilityType");

-- CreateIndex
CREATE UNIQUE INDEX "ChargeCatalog_code_key" ON "ChargeCatalog"("code");

-- CreateIndex
CREATE INDEX "CondoCharge_condoId_idx" ON "CondoCharge"("condoId");

-- CreateIndex
CREATE INDEX "CondoCharge_catalogId_idx" ON "CondoCharge"("catalogId");

-- CreateIndex
CREATE INDEX "RoomCharge_roomId_idx" ON "RoomCharge"("roomId");

-- CreateIndex
CREATE INDEX "RoomCharge_condoChargeId_idx" ON "RoomCharge"("condoChargeId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomCharge_roomId_condoChargeId_key" ON "RoomCharge"("roomId", "condoChargeId");

-- CreateIndex
CREATE INDEX "ExtraChargeTemplate_condoId_idx" ON "ExtraChargeTemplate"("condoId");

-- CreateIndex
CREATE INDEX "RoomExtraChargeAssignment_roomId_idx" ON "RoomExtraChargeAssignment"("roomId");

-- CreateIndex
CREATE INDEX "RoomExtraChargeAssignment_templateId_idx" ON "RoomExtraChargeAssignment"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomExtraChargeAssignment_roomId_templateId_key" ON "RoomExtraChargeAssignment"("roomId", "templateId");

-- CreateIndex
CREATE INDEX "Room_condoId_idx" ON "Room"("condoId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_condoId_roomNo_key" ON "Room"("condoId", "roomNo");

-- CreateIndex
CREATE INDEX "RoomStatusHistory_roomId_idx" ON "RoomStatusHistory"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomMeter_roomId_key" ON "RoomMeter"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantProfile_userId_key" ON "TenantProfile"("userId");

-- CreateIndex
CREATE INDEX "TenantEmergencyContact_tenantProfileId_idx" ON "TenantEmergencyContact"("tenantProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "LineAccount_userId_key" ON "LineAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LineAccount_lineUserId_key" ON "LineAccount"("lineUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantRoomCode_code_key" ON "TenantRoomCode"("code");

-- CreateIndex
CREATE INDEX "TenantRoomCode_condoId_idx" ON "TenantRoomCode"("condoId");

-- CreateIndex
CREATE INDEX "TenantRoomCode_roomId_idx" ON "TenantRoomCode"("roomId");

-- CreateIndex
CREATE INDEX "TenantRoomCode_contractId_idx" ON "TenantRoomCode"("contractId");

-- CreateIndex
CREATE INDEX "TenantResidency_tenantUserId_idx" ON "TenantResidency"("tenantUserId");

-- CreateIndex
CREATE INDEX "TenantResidency_condoId_idx" ON "TenantResidency"("condoId");

-- CreateIndex
CREATE INDEX "TenantResidency_roomId_idx" ON "TenantResidency"("roomId");

-- CreateIndex
CREATE INDEX "TenantResidency_contractId_idx" ON "TenantResidency"("contractId");

-- CreateIndex
CREATE INDEX "TenantOnboardingEvent_tenantUserId_idx" ON "TenantOnboardingEvent"("tenantUserId");

-- CreateIndex
CREATE INDEX "TenantOnboardingEvent_lineAccountId_idx" ON "TenantOnboardingEvent"("lineAccountId");

-- CreateIndex
CREATE INDEX "TenantOnboardingEvent_roomCodeId_idx" ON "TenantOnboardingEvent"("roomCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomReservation_reservationNo_key" ON "RoomReservation"("reservationNo");

-- CreateIndex
CREATE INDEX "RoomReservation_condoId_idx" ON "RoomReservation"("condoId");

-- CreateIndex
CREATE INDEX "RoomReservation_roomId_idx" ON "RoomReservation"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "RentalContract_reservationId_key" ON "RentalContract"("reservationId");

-- CreateIndex
CREATE INDEX "RentalContract_condoId_idx" ON "RentalContract"("condoId");

-- CreateIndex
CREATE INDEX "RentalContract_roomId_idx" ON "RentalContract"("roomId");

-- CreateIndex
CREATE INDEX "RentalContract_tenantUserId_idx" ON "RentalContract"("tenantUserId");

-- CreateIndex
CREATE INDEX "RentalContract_reservationId_idx" ON "RentalContract"("reservationId");

-- CreateIndex
CREATE INDEX "ContractMonthlyCharge_contractId_idx" ON "ContractMonthlyCharge"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffInvite_token_key" ON "StaffInvite"("token");

-- CreateIndex
CREATE INDEX "StaffInvite_condoId_idx" ON "StaffInvite"("condoId");

-- CreateIndex
CREATE INDEX "StaffMembership_condoId_idx" ON "StaffMembership"("condoId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffMembership_staffUserId_condoId_key" ON "StaffMembership"("staffUserId", "condoId");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionCatalog_code_key" ON "PermissionCatalog"("code");

-- CreateIndex
CREATE INDEX "StaffPermissionTemplate_condoId_idx" ON "StaffPermissionTemplate"("condoId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffPermissionTemplateItem_templateId_permissionId_key" ON "StaffPermissionTemplateItem"("templateId", "permissionId");

-- CreateIndex
CREATE INDEX "StaffPermissionAssignment_membershipId_idx" ON "StaffPermissionAssignment"("membershipId");

-- CreateIndex
CREATE INDEX "StaffPermissionAssignment_templateId_idx" ON "StaffPermissionAssignment"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffPermissionOverride_membershipId_permissionId_key" ON "StaffPermissionOverride"("membershipId", "permissionId");

-- CreateIndex
CREATE INDEX "Announcement_condoId_idx" ON "Announcement"("condoId");

-- CreateIndex
CREATE INDEX "AnnouncementRead_tenantUserId_idx" ON "AnnouncementRead"("tenantUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementRead_announcementId_tenantUserId_key" ON "AnnouncementRead"("announcementId", "tenantUserId");

-- CreateIndex
CREATE INDEX "ChatRoom_condoId_idx" ON "ChatRoom"("condoId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatRoomMember_chatRoomId_userId_key" ON "ChatRoomMember"("chatRoomId", "userId");

-- CreateIndex
CREATE INDEX "ChatMessage_chatRoomId_idx" ON "ChatMessage"("chatRoomId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessageRead_messageId_userId_key" ON "ChatMessageRead"("messageId", "userId");

-- CreateIndex
CREATE INDEX "RepairRequest_condoId_idx" ON "RepairRequest"("condoId");

-- CreateIndex
CREATE INDEX "RepairAttachment_repairId_idx" ON "RepairAttachment"("repairId");

-- CreateIndex
CREATE INDEX "RepairUpdate_repairId_idx" ON "RepairUpdate"("repairId");

-- CreateIndex
CREATE INDEX "Parcel_condoId_idx" ON "Parcel"("condoId");

-- CreateIndex
CREATE INDEX "ParcelAttachment_parcelId_idx" ON "ParcelAttachment"("parcelId");

-- CreateIndex
CREATE INDEX "ParcelNotification_parcelId_idx" ON "ParcelNotification"("parcelId");

-- CreateIndex
CREATE INDEX "Facility_condoId_idx" ON "Facility"("condoId");

-- CreateIndex
CREATE UNIQUE INDEX "FacilityBookingSetting_facilityId_key" ON "FacilityBookingSetting"("facilityId");

-- CreateIndex
CREATE INDEX "FacilityBooking_condoId_idx" ON "FacilityBooking"("condoId");

-- CreateIndex
CREATE INDEX "FacilityBooking_facilityId_idx" ON "FacilityBooking"("facilityId");

-- CreateIndex
CREATE INDEX "FacilityBookingUpdate_bookingId_idx" ON "FacilityBookingUpdate"("bookingId");

-- CreateIndex
CREATE INDEX "MeterCycle_condoId_idx" ON "MeterCycle"("condoId");

-- CreateIndex
CREATE UNIQUE INDEX "MeterCycle_condoId_cycleMonth_key" ON "MeterCycle"("condoId", "cycleMonth");

-- CreateIndex
CREATE INDEX "MeterReading_condoId_idx" ON "MeterReading"("condoId");

-- CreateIndex
CREATE UNIQUE INDEX "MeterReading_roomId_cycleId_key" ON "MeterReading"("roomId", "cycleId");

-- CreateIndex
CREATE INDEX "MeterAttachment_meterReadingId_idx" ON "MeterAttachment"("meterReadingId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNo_key" ON "Invoice"("invoiceNo");

-- CreateIndex
CREATE INDEX "Invoice_condoId_idx" ON "Invoice"("condoId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_roomId_billingMonth_key" ON "Invoice"("roomId", "billingMonth");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceMeterLink_invoiceId_cycleId_key" ON "InvoiceMeterLink"("invoiceId", "cycleId");

-- CreateIndex
CREATE INDEX "PaymentNotice_invoiceId_idx" ON "PaymentNotice"("invoiceId");

-- CreateIndex
CREATE INDEX "PaymentAttachment_paymentNoticeId_idx" ON "PaymentAttachment"("paymentNoticeId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_condoId_idx" ON "PaymentTransaction"("condoId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_invoiceId_idx" ON "PaymentTransaction"("invoiceId");

-- CreateIndex
CREATE INDEX "PaymentUpdate_paymentNoticeId_idx" ON "PaymentUpdate"("paymentNoticeId");

-- CreateIndex
CREATE INDEX "TenantNotification_tenantUserId_idx" ON "TenantNotification"("tenantUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardDailySnapshot_condoId_snapshotDate_key" ON "DashboardDailySnapshot"("condoId", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "ReportMonthlySnapshot_condoId_month_key" ON "ReportMonthlySnapshot"("condoId", "month");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerifyRequest" ADD CONSTRAINT "VerifyRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetRequest" ADD CONSTRAINT "PasswordResetRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Condo" ADD CONSTRAINT "Condo_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondoUtilitySetting" ADD CONSTRAINT "CondoUtilitySetting_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondoAsset" ADD CONSTRAINT "CondoAsset_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondoAsset" ADD CONSTRAINT "CondoAsset_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondoService" ADD CONSTRAINT "CondoService_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondoBankAccount" ADD CONSTRAINT "CondoBankAccount_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondoBillingSetting" ADD CONSTRAINT "CondoBillingSetting_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondoOnboarding" ADD CONSTRAINT "CondoOnboarding_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondoFloor" ADD CONSTRAINT "CondoFloor_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtilitySetting" ADD CONSTRAINT "UtilitySetting_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UtilityRate" ADD CONSTRAINT "UtilityRate_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondoCharge" ADD CONSTRAINT "CondoCharge_catalogId_fkey" FOREIGN KEY ("catalogId") REFERENCES "ChargeCatalog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondoCharge" ADD CONSTRAINT "CondoCharge_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomCharge" ADD CONSTRAINT "RoomCharge_condoChargeId_fkey" FOREIGN KEY ("condoChargeId") REFERENCES "CondoCharge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomCharge" ADD CONSTRAINT "RoomCharge_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraChargeTemplate" ADD CONSTRAINT "ExtraChargeTemplate_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomExtraChargeAssignment" ADD CONSTRAINT "RoomExtraChargeAssignment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomExtraChargeAssignment" ADD CONSTRAINT "RoomExtraChargeAssignment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ExtraChargeTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomStatusHistory" ADD CONSTRAINT "RoomStatusHistory_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomStatusHistory" ADD CONSTRAINT "RoomStatusHistory_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMeter" ADD CONSTRAINT "RoomMeter_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantProfile" ADD CONSTRAINT "TenantProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantEmergencyContact" ADD CONSTRAINT "TenantEmergencyContact_tenantProfileId_fkey" FOREIGN KEY ("tenantProfileId") REFERENCES "TenantProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineAccount" ADD CONSTRAINT "LineAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantRoomCode" ADD CONSTRAINT "TenantRoomCode_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantRoomCode" ADD CONSTRAINT "TenantRoomCode_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "RentalContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantRoomCode" ADD CONSTRAINT "TenantRoomCode_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantRoomCode" ADD CONSTRAINT "TenantRoomCode_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantRoomCode" ADD CONSTRAINT "TenantRoomCode_usedByUserId_fkey" FOREIGN KEY ("usedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantResidency" ADD CONSTRAINT "TenantResidency_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantResidency" ADD CONSTRAINT "TenantResidency_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "RentalContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantResidency" ADD CONSTRAINT "TenantResidency_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantResidency" ADD CONSTRAINT "TenantResidency_tenantUserId_fkey" FOREIGN KEY ("tenantUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantOnboardingEvent" ADD CONSTRAINT "TenantOnboardingEvent_lineAccountId_fkey" FOREIGN KEY ("lineAccountId") REFERENCES "LineAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantOnboardingEvent" ADD CONSTRAINT "TenantOnboardingEvent_roomCodeId_fkey" FOREIGN KEY ("roomCodeId") REFERENCES "TenantRoomCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantOnboardingEvent" ADD CONSTRAINT "TenantOnboardingEvent_tenantUserId_fkey" FOREIGN KEY ("tenantUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomReservation" ADD CONSTRAINT "RoomReservation_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomReservation" ADD CONSTRAINT "RoomReservation_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomReservation" ADD CONSTRAINT "RoomReservation_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalContract" ADD CONSTRAINT "RentalContract_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalContract" ADD CONSTRAINT "RentalContract_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "RoomReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalContract" ADD CONSTRAINT "RentalContract_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalContract" ADD CONSTRAINT "RentalContract_tenantUserId_fkey" FOREIGN KEY ("tenantUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractMonthlyCharge" ADD CONSTRAINT "ContractMonthlyCharge_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "RentalContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMembership" ADD CONSTRAINT "StaffMembership_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMembership" ADD CONSTRAINT "StaffMembership_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPermissionTemplate" ADD CONSTRAINT "StaffPermissionTemplate_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPermissionTemplateItem" ADD CONSTRAINT "StaffPermissionTemplateItem_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "PermissionCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPermissionTemplateItem" ADD CONSTRAINT "StaffPermissionTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "StaffPermissionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPermissionAssignment" ADD CONSTRAINT "StaffPermissionAssignment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "StaffMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPermissionAssignment" ADD CONSTRAINT "StaffPermissionAssignment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "StaffPermissionTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPermissionOverride" ADD CONSTRAINT "StaffPermissionOverride_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "StaffMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPermissionOverride" ADD CONSTRAINT "StaffPermissionOverride_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "PermissionCatalog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_tenantUserId_fkey" FOREIGN KEY ("tenantUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "RentalContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoomMember" ADD CONSTRAINT "ChatRoomMember_chatRoomId_fkey" FOREIGN KEY ("chatRoomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoomMember" ADD CONSTRAINT "ChatRoomMember_staffMembershipId_fkey" FOREIGN KEY ("staffMembershipId") REFERENCES "StaffMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoomMember" ADD CONSTRAINT "ChatRoomMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_chatRoomId_fkey" FOREIGN KEY ("chatRoomId") REFERENCES "ChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageRead" ADD CONSTRAINT "ChatMessageRead_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessageRead" ADD CONSTRAINT "ChatMessageRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairRequest" ADD CONSTRAINT "RepairRequest_assignedToMembershipId_fkey" FOREIGN KEY ("assignedToMembershipId") REFERENCES "StaffMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairRequest" ADD CONSTRAINT "RepairRequest_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairRequest" ADD CONSTRAINT "RepairRequest_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairRequest" ADD CONSTRAINT "RepairRequest_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairRequest" ADD CONSTRAINT "RepairRequest_tenantUserId_fkey" FOREIGN KEY ("tenantUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairAttachment" ADD CONSTRAINT "RepairAttachment_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "RepairRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairAttachment" ADD CONSTRAINT "RepairAttachment_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairUpdate" ADD CONSTRAINT "RepairUpdate_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairUpdate" ADD CONSTRAINT "RepairUpdate_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "RepairRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parcel" ADD CONSTRAINT "Parcel_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parcel" ADD CONSTRAINT "Parcel_receivedByMembershipId_fkey" FOREIGN KEY ("receivedByMembershipId") REFERENCES "StaffMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parcel" ADD CONSTRAINT "Parcel_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parcel" ADD CONSTRAINT "Parcel_tenantUserId_fkey" FOREIGN KEY ("tenantUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParcelAttachment" ADD CONSTRAINT "ParcelAttachment_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "Parcel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParcelAttachment" ADD CONSTRAINT "ParcelAttachment_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParcelNotification" ADD CONSTRAINT "ParcelNotification_parcelId_fkey" FOREIGN KEY ("parcelId") REFERENCES "Parcel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityBookingSetting" ADD CONSTRAINT "FacilityBookingSetting_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityBooking" ADD CONSTRAINT "FacilityBooking_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityBooking" ADD CONSTRAINT "FacilityBooking_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityBooking" ADD CONSTRAINT "FacilityBooking_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityBooking" ADD CONSTRAINT "FacilityBooking_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityBooking" ADD CONSTRAINT "FacilityBooking_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityBooking" ADD CONSTRAINT "FacilityBooking_tenantUserId_fkey" FOREIGN KEY ("tenantUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityBookingUpdate" ADD CONSTRAINT "FacilityBookingUpdate_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "FacilityBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityBookingUpdate" ADD CONSTRAINT "FacilityBookingUpdate_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeterCycle" ADD CONSTRAINT "MeterCycle_closedBy_fkey" FOREIGN KEY ("closedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeterCycle" ADD CONSTRAINT "MeterCycle_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeterCycle" ADD CONSTRAINT "MeterCycle_openedBy_fkey" FOREIGN KEY ("openedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeterReading" ADD CONSTRAINT "MeterReading_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeterReading" ADD CONSTRAINT "MeterReading_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "MeterCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeterReading" ADD CONSTRAINT "MeterReading_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeterReading" ADD CONSTRAINT "MeterReading_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeterAttachment" ADD CONSTRAINT "MeterAttachment_meterReadingId_fkey" FOREIGN KEY ("meterReadingId") REFERENCES "MeterReading"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "RentalContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_condoChargeId_fkey" FOREIGN KEY ("condoChargeId") REFERENCES "CondoCharge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_extraChargeTemplateId_fkey" FOREIGN KEY ("extraChargeTemplateId") REFERENCES "ExtraChargeTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_facilityBookingId_fkey" FOREIGN KEY ("facilityBookingId") REFERENCES "FacilityBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_meterReadingId_fkey" FOREIGN KEY ("meterReadingId") REFERENCES "MeterReading"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceMeterLink" ADD CONSTRAINT "InvoiceMeterLink_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "MeterCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceMeterLink" ADD CONSTRAINT "InvoiceMeterLink_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentNotice" ADD CONSTRAINT "PaymentNotice_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentNotice" ADD CONSTRAINT "PaymentNotice_paidToAccountId_fkey" FOREIGN KEY ("paidToAccountId") REFERENCES "CondoBankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentNotice" ADD CONSTRAINT "PaymentNotice_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentNotice" ADD CONSTRAINT "PaymentNotice_tenantUserId_fkey" FOREIGN KEY ("tenantUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttachment" ADD CONSTRAINT "PaymentAttachment_paymentNoticeId_fkey" FOREIGN KEY ("paymentNoticeId") REFERENCES "PaymentNotice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_confirmedBy_fkey" FOREIGN KEY ("confirmedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_paidToAccountId_fkey" FOREIGN KEY ("paidToAccountId") REFERENCES "CondoBankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_paymentNoticeId_fkey" FOREIGN KEY ("paymentNoticeId") REFERENCES "PaymentNotice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentUpdate" ADD CONSTRAINT "PaymentUpdate_paymentNoticeId_fkey" FOREIGN KEY ("paymentNoticeId") REFERENCES "PaymentNotice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentUpdate" ADD CONSTRAINT "PaymentUpdate_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantNotification" ADD CONSTRAINT "TenantNotification_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantNotification" ADD CONSTRAINT "TenantNotification_tenantUserId_fkey" FOREIGN KEY ("tenantUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardDailySnapshot" ADD CONSTRAINT "DashboardDailySnapshot_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportMonthlySnapshot" ADD CONSTRAINT "ReportMonthlySnapshot_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
