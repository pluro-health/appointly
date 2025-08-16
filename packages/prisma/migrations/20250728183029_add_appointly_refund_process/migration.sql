-- CreateEnum
CREATE TYPE "AppointlyRefundStatus" AS ENUM ('PENDING', 'PROCESSED', 'REJECTED', 'NOT_APPLICABLE');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "appointlyCancellationReason" TEXT,
ADD COLUMN     "appointlyOriginalBookingDate" TIMESTAMP(3),
ADD COLUMN     "appointlyRefundAmount" DECIMAL(10,2),
ADD COLUMN     "appointlyRefundStatus" "AppointlyRefundStatus" DEFAULT 'NOT_APPLICABLE',
ADD COLUMN     "appointlyRescheduleCount" INTEGER DEFAULT 0;

-- CreateTable
CREATE TABLE "AppointlyBookingRefunds" (
    "id" SERIAL NOT NULL,
    "bookingId" INTEGER NOT NULL,
    "easebuzzPaymentId" INTEGER,
    "refundAmount" DECIMAL(10,2) NOT NULL,
    "refundPercentage" INTEGER NOT NULL,
    "refundStatus" "AppointlyRefundStatus" NOT NULL DEFAULT 'PENDING',
    "easebuzzRefundId" TEXT,
    "refundInitiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refundCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointlyBookingRefunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppointlyBookingRefunds_bookingId_idx" ON "AppointlyBookingRefunds"("bookingId");

-- CreateIndex
CREATE INDEX "AppointlyBookingRefunds_easebuzzPaymentId_idx" ON "AppointlyBookingRefunds"("easebuzzPaymentId");

-- CreateIndex
CREATE INDEX "AppointlyBookingRefunds_refundStatus_idx" ON "AppointlyBookingRefunds"("refundStatus");

-- AddForeignKey
ALTER TABLE "AppointlyBookingRefunds" ADD CONSTRAINT "AppointlyBookingRefunds_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointlyBookingRefunds" ADD CONSTRAINT "AppointlyBookingRefunds_easebuzzPaymentId_fkey" FOREIGN KEY ("easebuzzPaymentId") REFERENCES "EasebuzzPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;