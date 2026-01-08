/*
  Warnings:
  - A unique constraint covering the columns `[hmsCenterId]` on the table `Center` will be added. If there are existing duplicate values, this will fail.
*/
-- AlterTable
ALTER TABLE "Center" ADD COLUMN     "hmsCenterId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Center_hmsCenterId_key" ON "Center"("hmsCenterId");

-- CreateIndex
CREATE INDEX "Center_hmsCenterId_idx" ON "Center"("hmsCenterId");
