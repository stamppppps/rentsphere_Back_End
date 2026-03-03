-- AlterTable
ALTER TABLE "CondoBankAccount" ADD COLUMN     "bankCode" TEXT,
ADD COLUMN     "createdBy" UUID,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CondoPaymentInstruction" (
    "condoId" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CondoPaymentInstruction_pkey" PRIMARY KEY ("condoId")
);

-- CreateIndex
CREATE INDEX "CondoPaymentInstruction_updatedBy_idx" ON "CondoPaymentInstruction"("updatedBy");

-- CreateIndex
CREATE INDEX "CondoBankAccount_createdBy_idx" ON "CondoBankAccount"("createdBy");

-- AddForeignKey
ALTER TABLE "CondoBankAccount" ADD CONSTRAINT "CondoBankAccount_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondoPaymentInstruction" ADD CONSTRAINT "CondoPaymentInstruction_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondoPaymentInstruction" ADD CONSTRAINT "CondoPaymentInstruction_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
