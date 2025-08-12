-- AlterTable
ALTER TABLE "AppointlyBookingRefunds" ADD COLUMN     "easebuzzRefundResponse" JSONB,
ADD COLUMN     "merchantRefundId" TEXT;

-- AlterTable
ALTER TABLE "EasebuzzPayment" ADD COLUMN     "easepayid" TEXT;

-- CreateIndex
CREATE INDEX "AppointlyBookingRefunds_easebuzzRefundId_idx" ON "AppointlyBookingRefunds"("easebuzzRefundId");

-- CreateIndex
CREATE INDEX "AppointlyBookingRefunds_merchantRefundId_idx" ON "AppointlyBookingRefunds"("merchantRefundId");

-- CreateIndex
CREATE INDEX "EasebuzzPayment_easepayid_idx" ON "EasebuzzPayment"("easepayid");