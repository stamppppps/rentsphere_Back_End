/*
  Warnings:

  - You are about to drop the column `createdBy` on the `StaffInvite` table. All the data in the column will be lost.
  - The `status` column on the `StaffInvite` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `createdByUserId` to the `StaffInvite` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `StaffInvite` table without a default value. This is not possible if the table is not empty.
  - Made the column `staffPosition` on table `StaffInvite` required. This step will fail if there are existing NULL values in that column.
  - Made the column `expiresAt` on table `StaffInvite` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- DropForeignKey
ALTER TABLE "StaffInvite" DROP CONSTRAINT "StaffInvite_condoId_fkey";

-- DropForeignKey
ALTER TABLE "StaffInvite" DROP CONSTRAINT "StaffInvite_createdBy_fkey";

-- AlterTable
ALTER TABLE "StaffInvite" DROP COLUMN "createdBy",
ADD COLUMN     "createdByUserId" UUID NOT NULL,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "staffUserId" UUID,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "usedAt" TIMESTAMP(3),
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "staffPosition" SET NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "expiresAt" SET NOT NULL;

-- CreateIndex
CREATE INDEX "StaffInvite_email_idx" ON "StaffInvite"("email");

-- CreateIndex
CREATE INDEX "StaffInvite_phone_idx" ON "StaffInvite"("phone");

-- CreateIndex
CREATE INDEX "StaffInvite_token_idx" ON "StaffInvite"("token");

-- CreateIndex
CREATE INDEX "StaffInvite_staffUserId_idx" ON "StaffInvite"("staffUserId");

-- AddForeignKey
ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_condoId_fkey" FOREIGN KEY ("condoId") REFERENCES "Condo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffInvite" ADD CONSTRAINT "StaffInvite_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
