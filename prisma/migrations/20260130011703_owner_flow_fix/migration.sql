/*
  Warnings:

  - You are about to drop the column `createdAt` on the `Condo` table. All the data in the column will be lost.
  - You are about to drop the column `zipCode` on the `Condo` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Condo" DROP COLUMN "createdAt",
DROP COLUMN "zipCode";
