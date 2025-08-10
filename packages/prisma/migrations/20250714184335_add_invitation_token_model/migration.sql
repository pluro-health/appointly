-- AlterTable
ALTER TABLE "_PlatformOAuthClientToUser" ADD CONSTRAINT "_PlatformOAuthClientToUser_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_PlatformOAuthClientToUser_AB_unique";

-- AlterTable
ALTER TABLE "_user_eventtype" ADD CONSTRAINT "_user_eventtype_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_user_eventtype_AB_unique";

-- CreateTable
CREATE TABLE "InvitationToken" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "role" "UserPermissionRole" NOT NULL DEFAULT 'USER',
    "invitedById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "InvitationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvitationToken_email_key" ON "InvitationToken"("email");

-- CreateIndex
CREATE UNIQUE INDEX "InvitationToken_token_key" ON "InvitationToken"("token");

-- CreateIndex
CREATE INDEX "InvitationToken_token_idx" ON "InvitationToken"("token");

-- CreateIndex
CREATE INDEX "InvitationToken_email_idx" ON "InvitationToken"("email");

-- CreateIndex
CREATE INDEX "InvitationToken_invitedById_idx" ON "InvitationToken"("invitedById");

-- CreateIndex
CREATE INDEX "InvitationToken_expiresAt_idx" ON "InvitationToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "InvitationToken" ADD CONSTRAINT "InvitationToken_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;