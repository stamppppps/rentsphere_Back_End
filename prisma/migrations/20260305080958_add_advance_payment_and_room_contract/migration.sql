-- CreateTable
CREATE TABLE "AdvancePayment" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdvancePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomContract" (
    "id" UUID NOT NULL,
    "condoId" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "tenantName" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "rentPrice" DECIMAL(12,2) NOT NULL,
    "deposit" DECIMAL(12,2),
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "RoomContract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdvancePayment_condoId_idx" ON "AdvancePayment"("condoId");

-- CreateIndex
CREATE INDEX "AdvancePayment_roomId_idx" ON "AdvancePayment"("roomId");

-- CreateIndex
CREATE INDEX "AdvancePayment_createdBy_idx" ON "AdvancePayment"("createdBy");

-- CreateIndex
CREATE INDEX "RoomContract_condoId_idx" ON "RoomContract"("condoId");

-- CreateIndex
CREATE INDEX "RoomContract_roomId_idx" ON "RoomContract"("roomId");

-- CreateIndex
CREATE INDEX "RoomContract_createdBy_idx" ON "RoomContract"("createdBy");

-- CreateIndex
CREATE INDEX "RoomContract_startDate_idx" ON "RoomContract"("startDate");

-- AddForeignKey
ALTER TABLE "AdvancePayment" ADD CONSTRAINT "AdvancePayment_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvancePayment" ADD CONSTRAINT "AdvancePayment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvancePayment" ADD CONSTRAINT "AdvancePayment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomContract" ADD CONSTRAINT "RoomContract_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomContract" ADD CONSTRAINT "RoomContract_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomContract" ADD CONSTRAINT "RoomContract_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
