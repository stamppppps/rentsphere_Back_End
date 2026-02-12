/*
  Warnings:

  - You are about to drop the column `buildingId` on the `Room` table. All the data in the column will be lost.
  - You are about to drop the column `label` on the `Room` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[tenantId,condoId,period]` on the table `Invoice` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[condoId,number]` on the table `Room` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `number` to the `Room` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Room" DROP CONSTRAINT "Room_buildingId_fkey";

-- DropIndex
DROP INDEX "Invoice_tenantId_period_key";

-- DropIndex
DROP INDEX "Room_buildingId_idx";

-- DropIndex
DROP INDEX "Room_condoId_label_key";

-- AlterTable
ALTER TABLE "Room" DROP COLUMN "buildingId",
DROP COLUMN "label",
ADD COLUMN     "number" TEXT NOT NULL,
ADD COLUMN     "price" INTEGER,
ADD COLUMN     "type" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_tenantId_condoId_period_key" ON "Invoice"("tenantId", "condoId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "Room_condoId_number_key" ON "Room"("condoId", "number");
