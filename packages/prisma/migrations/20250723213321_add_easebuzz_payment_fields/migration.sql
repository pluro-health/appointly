/*
  Warnings:

  - You are about to drop the column `easebuzzTxnid` on the `EasebuzzPayment` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[bookingId]` on the table `EasebuzzPayment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[easebuzzTxnId]` on the table `EasebuzzPayment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[merchantTxnId]` on the table `EasebuzzPayment` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "BookingPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- AlterEnum
ALTER TYPE "EasebuzzPaymentStatus" ADD VALUE 'PARTIALLY_REFUNDED';

-- DropIndex
DROP INDEX "EasebuzzPayment_easebuzzTxnid_idx";

-- DropIndex
DROP INDEX "EasebuzzPayment_easebuzzTxnid_key";

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "paymentStatus" "BookingPaymentStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "EasebuzzPayment" DROP COLUMN "easebuzzTxnid",
ADD COLUMN     "bankRefNum" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'INR',
ADD COLUMN     "easebuzzResponse" JSONB,
ADD COLUMN     "easebuzzTxnId" TEXT,
ADD COLUMN     "merchantTxnId" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "userId" INTEGER;

-- CreateIndex
CREATE INDEX "Booking_paymentStatus_idx" ON "Booking"("paymentStatus");

-- CreateIndex
CREATE INDEX "Booking_startTime_endTime_paymentStatus_idx" ON "Booking"("startTime", "endTime", "paymentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "EasebuzzPayment_bookingId_key" ON "EasebuzzPayment"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "EasebuzzPayment_easebuzzTxnId_key" ON "EasebuzzPayment"("easebuzzTxnId");

-- CreateIndex
CREATE UNIQUE INDEX "EasebuzzPayment_merchantTxnId_key" ON "EasebuzzPayment"("merchantTxnId");

-- CreateIndex
CREATE INDEX "EasebuzzPayment_userId_idx" ON "EasebuzzPayment"("userId");

-- CreateIndex
CREATE INDEX "EasebuzzPayment_easebuzzTxnId_idx" ON "EasebuzzPayment"("easebuzzTxnId");

-- CreateIndex
CREATE INDEX "EasebuzzPayment_merchantTxnId_idx" ON "EasebuzzPayment"("merchantTxnId");

-- CreateIndex
CREATE INDEX "EasebuzzPayment_paymentMethod_idx" ON "EasebuzzPayment"("paymentMethod");

-- CreateIndex
CREATE INDEX "EasebuzzPayment_createdAt_idx" ON "EasebuzzPayment"("createdAt");

-- CreateIndex
CREATE INDEX "EasebuzzPayment_paidAt_idx" ON "EasebuzzPayment"("paidAt");

-- CreateIndex
CREATE INDEX "EasebuzzPayment_status_createdAt_idx" ON "EasebuzzPayment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "EasebuzzPayment_bookingId_status_idx" ON "EasebuzzPayment"("bookingId", "status");

-- AddForeignKey
ALTER TABLE "EasebuzzPayment" ADD CONSTRAINT "EasebuzzPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;