/*
  Warnings:

  - You are about to drop the column `googleCalendarEventId` on the `appointments` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "appointments" DROP COLUMN "googleCalendarEventId",
ADD COLUMN     "doctorCalendarEventId" TEXT,
ADD COLUMN     "patientCalendarEventId" TEXT,
ADD COLUMN     "reminderSentAt" TIMESTAMP(3);
