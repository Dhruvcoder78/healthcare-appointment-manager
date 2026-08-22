-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "followUpDate" TIMESTAMP(3),
ADD COLUMN     "followUpInDays" INTEGER;
