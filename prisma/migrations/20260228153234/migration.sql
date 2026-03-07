-- AlterTable
ALTER TABLE "CondoBankAccount" ADD COLUMN     "bankCode" TEXT;

-- CreateTable
CREATE TABLE "CondoPaymentInstruction" (
    "condoId" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CondoPaymentInstruction_pkey" PRIMARY KEY ("condoId")
);

-- AddForeignKey
ALTER TABLE "CondoPaymentInstruction" ADD CONSTRAINT "CondoPaymentInstruction_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
