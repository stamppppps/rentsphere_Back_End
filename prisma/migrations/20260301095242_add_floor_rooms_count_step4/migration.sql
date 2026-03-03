/*
  Warnings:

  - Made the column `updatedAt` on table `CondoFloor` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "CondoFloor" ADD COLUMN     "roomsCount" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "updatedAt" SET NOT NULL;
