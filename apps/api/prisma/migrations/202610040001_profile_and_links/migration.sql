-- DropForeignKey
ALTER TABLE "File" DROP CONSTRAINT "File_carId_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarFileId" UUID;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "relatedEventId" UUID;

-- AlterTable
ALTER TABLE "File" ALTER COLUMN "carId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_avatarFileId_fkey" FOREIGN KEY ("avatarFileId") REFERENCES "File"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_relatedEventId_fkey" FOREIGN KEY ("relatedEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE SET NULL ON UPDATE CASCADE;
