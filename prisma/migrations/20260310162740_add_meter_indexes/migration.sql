-- AlterTable
ALTER TABLE "CondoBankAccount" ADD COLUMN     "createdBy" UUID,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CondoPaymentInstruction" ADD COLUMN     "updatedBy" UUID;

-- AlterTable
ALTER TABLE "CondoUtilitySetting" ADD COLUMN     "minimumCharge" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "MeterReading" ADD COLUMN     "electricCharge" DECIMAL(12,2),
ADD COLUMN     "waterCharge" DECIMAL(12,2);

-- CreateIndex
CREATE INDEX "CondoBankAccount_createdBy_idx" ON "CondoBankAccount"("createdBy");

-- CreateIndex
CREATE INDEX "CondoPaymentInstruction_updatedBy_idx" ON "CondoPaymentInstruction"("updatedBy");

-- CreateIndex
CREATE INDEX "MeterReading_cycleId_idx" ON "MeterReading"("cycleId");

-- CreateIndex
CREATE INDEX "MeterReading_roomId_recordedAt_idx" ON "MeterReading"("roomId", "recordedAt");

-- AddForeignKey
ALTER TABLE "CondoBankAccount" ADD CONSTRAINT "CondoBankAccount_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondoPaymentInstruction" ADD CONSTRAINT "CondoPaymentInstruction_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
