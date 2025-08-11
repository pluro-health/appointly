-- AlterTable
ALTER TABLE "EventType" ADD COLUMN "consultationPrice" DECIMAL(10,2);
ALTER TABLE "EventType" ADD COLUMN "paymentCurrency" TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE "EventType" ADD COLUMN "requiresPayment" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex for payment queries optimization
CREATE INDEX "EventType_requiresPayment_idx" ON "EventType"("requiresPayment");
CREATE INDEX "EventType_consultationPrice_idx" ON "EventType"("consultationPrice"); 