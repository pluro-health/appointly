-- AlterTable
ALTER TABLE "InvitationToken" ADD COLUMN "centerId" INTEGER;

-- CreateIndex
CREATE INDEX "InvitationToken_centerId_idx" ON "InvitationToken"("centerId");

-- AddForeignKey
ALTER TABLE "InvitationToken" ADD CONSTRAINT "InvitationToken_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE SET NULL ON UPDATE CASCADE; 