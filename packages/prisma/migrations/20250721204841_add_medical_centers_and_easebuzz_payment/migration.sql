-- CreateEnum
CREATE TYPE "EasebuzzPaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateTable
CREATE TABLE "Center" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "easebuzzSubMerchantId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Center_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EasebuzzPayment" (
    "id" SERIAL NOT NULL,
    "bookingId" INTEGER NOT NULL,
    "centerId" INTEGER,
    "subMerchantId" TEXT,
    "easebuzzTxnid" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "EasebuzzPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "responseData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EasebuzzPayment_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "users" ADD COLUMN "centerId" INTEGER;

-- CreateUniqueIndex
CREATE UNIQUE INDEX "Center_easebuzzSubMerchantId_key" ON "Center"("easebuzzSubMerchantId");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "EasebuzzPayment_easebuzzTxnid_key" ON "EasebuzzPayment"("easebuzzTxnid");

-- CreateIndex
CREATE INDEX "Center_easebuzzSubMerchantId_idx" ON "Center"("easebuzzSubMerchantId");

-- CreateIndex
CREATE INDEX "Center_isActive_idx" ON "Center"("isActive");

-- CreateIndex
CREATE INDEX "EasebuzzPayment_bookingId_idx" ON "EasebuzzPayment"("bookingId");

-- CreateIndex
CREATE INDEX "EasebuzzPayment_centerId_idx" ON "EasebuzzPayment"("centerId");

-- CreateIndex
CREATE INDEX "EasebuzzPayment_easebuzzTxnid_idx" ON "EasebuzzPayment"("easebuzzTxnid");

-- CreateIndex
CREATE INDEX "EasebuzzPayment_status_idx" ON "EasebuzzPayment"("status");

-- CreateIndex
CREATE INDEX "users_centerId_idx" ON "users"("centerId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EasebuzzPayment" ADD CONSTRAINT "EasebuzzPayment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EasebuzzPayment" ADD CONSTRAINT "EasebuzzPayment_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE SET NULL ON UPDATE CASCADE; 
