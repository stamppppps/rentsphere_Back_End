-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "serviceId" TEXT;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "CondoService"("id") ON DELETE SET NULL ON UPDATE CASCADE;
