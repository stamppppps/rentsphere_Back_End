/*
  Warnings:

  - You are about to drop the column `serviceId` on the `Room` table. All the data in the column will be lost.
  - The primary key for the `RoomExtraChargeAssignment` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `amountOverride` on the `RoomExtraChargeAssignment` table. All the data in the column will be lost.
  - You are about to drop the column `isEnabled` on the `RoomExtraChargeAssignment` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `RoomExtraChargeAssignment` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[roomId,serviceId]` on the table `RoomExtraChargeAssignment` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `serviceId` to the `RoomExtraChargeAssignment` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Room" DROP CONSTRAINT "Room_serviceId_fkey";

-- DropForeignKey
ALTER TABLE "RoomExtraChargeAssignment" DROP CONSTRAINT "RoomExtraChargeAssignment_templateId_fkey";

-- DropIndex
DROP INDEX "RoomExtraChargeAssignment_roomId_templateId_key";

-- AlterTable
ALTER TABLE "Room" DROP COLUMN "serviceId";

-- AlterTable
ALTER TABLE "RoomExtraChargeAssignment" DROP CONSTRAINT "RoomExtraChargeAssignment_pkey",
DROP COLUMN "amountOverride",
DROP COLUMN "isEnabled",
DROP COLUMN "updatedAt",
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "serviceId" TEXT NOT NULL,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "templateId" DROP NOT NULL,
ADD CONSTRAINT "RoomExtraChargeAssignment_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "RoomExtraChargeAssignment_serviceId_idx" ON "RoomExtraChargeAssignment"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomExtraChargeAssignment_roomId_serviceId_key" ON "RoomExtraChargeAssignment"("roomId", "serviceId");

-- AddForeignKey
ALTER TABLE "RoomExtraChargeAssignment" ADD CONSTRAINT "RoomExtraChargeAssignment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "CondoService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomExtraChargeAssignment" ADD CONSTRAINT "RoomExtraChargeAssignment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ExtraChargeTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
