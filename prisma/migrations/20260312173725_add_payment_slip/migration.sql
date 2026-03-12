-- CreateEnum
CREATE TYPE "PaymentSlipStatus" AS ENUM ('PENDING', 'MATCHED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "PaymentSlip" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "lineUserId" TEXT,
    "condoId" UUID,
    "roomId" UUID,
    "invoiceId" UUID,
    "paymentTxnId" UUID,
    "amount" DECIMAL(12,2),
    "senderName" TEXT,
    "receiverName" TEXT,
    "transactionRef" TEXT,
    "transferTime" TIMESTAMP(3),
    "slipImageUrl" TEXT NOT NULL,
    "status" "PaymentSlipStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" UUID,
    "note" TEXT,

    CONSTRAINT "PaymentSlip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentSlip_userId_idx" ON "PaymentSlip"("userId");

-- CreateIndex
CREATE INDEX "PaymentSlip_lineUserId_idx" ON "PaymentSlip"("lineUserId");

-- CreateIndex
CREATE INDEX "PaymentSlip_condoId_idx" ON "PaymentSlip"("condoId");

-- CreateIndex
CREATE INDEX "PaymentSlip_roomId_idx" ON "PaymentSlip"("roomId");

-- CreateIndex
CREATE INDEX "PaymentSlip_invoiceId_idx" ON "PaymentSlip"("invoiceId");

-- CreateIndex
CREATE INDEX "PaymentSlip_paymentTxnId_idx" ON "PaymentSlip"("paymentTxnId");

-- CreateIndex
CREATE INDEX "PaymentSlip_status_idx" ON "PaymentSlip"("status");

-- CreateIndex
CREATE INDEX "PaymentSlip_createdAt_idx" ON "PaymentSlip"("createdAt");

-- AddForeignKey
ALTER TABLE "PaymentSlip" ADD CONSTRAINT "PaymentSlip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSlip" ADD CONSTRAINT "PaymentSlip_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSlip" ADD CONSTRAINT "PaymentSlip_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSlip" ADD CONSTRAINT "PaymentSlip_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSlip" ADD CONSTRAINT "PaymentSlip_paymentTxnId_fkey" FOREIGN KEY ("paymentTxnId") REFERENCES "PaymentTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSlip" ADD CONSTRAINT "PaymentSlip_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
