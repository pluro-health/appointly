import { cookies, headers } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { sendInvitationEmail } from "@calcom/features/auth/lib/sendInvitationEmail";
import { createInvitationToken } from "@calcom/features/auth/lib/validateInvitationToken";
import logger from "@calcom/lib/logger";
import { prisma } from "@calcom/prisma";
import { UserPermissionRole } from "@calcom/prisma/enums";

import { buildLegacyRequest } from "@lib/buildLegacyCtx";

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["USER", "ADMIN"]).default("USER"),
  expiresInHours: z.number().min(1).max(168).default(24), // 1 hour to 1 week
});

export async function POST(request: NextRequest) {
  try {
    // Check if user is authenticated and is an admin
    const legacyReq = buildLegacyRequest(await headers(), await cookies());
    const session = await getServerSession({ req: legacyReq });
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (!user || user.role !== UserPermissionRole.ADMIN) {
      return NextResponse.json({ message: "Admin access required" }, { status: 403 });
    }

    // Parse request body
    const body = await request.json();
    const { email, role, expiresInHours } = inviteSchema.parse(body);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return NextResponse.json({ message: "A user with this email already exists" }, { status: 409 });
    }

    // Check if invitation already exists and is not expired
    const existingInvitation = await prisma.invitationToken.findFirst({
      where: {
        email: email.toLowerCase(),
        expiresAt: { gt: new Date() },
        usedAt: null,
      },
    });

    if (existingInvitation) {
      return NextResponse.json(
        { message: "An active invitation already exists for this email" },
        { status: 409 }
      );
    }

    // Create invitation token
    const token = await createInvitationToken(
      email,
      role as UserPermissionRole,
      session.user.id,
      expiresInHours
    );

    // Send invitation email
    await sendInvitationEmail({
      email: email.toLowerCase(),
      token,
      invitedBy: {
        id: session.user.id,
        name: session.user.name || null,
        email: session.user.email || "",
      },
      expiresInHours,
    });

    logger.info("Invitation sent", {
      email: email.toLowerCase(),
      role,
      invitedById: session.user.id,
      expiresInHours,
    });

    return NextResponse.json(
      {
        message: "Invitation sent successfully",
        email: email.toLowerCase(),
        role,
        expiresInHours,
      },
      { status: 200 }
    );
  } catch (error) {
    logger.error("Error sending invitation", { error });

    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "Invalid request data", errors: error.errors }, { status: 400 });
    }

    return NextResponse.json({ message: "Failed to send invitation" }, { status: 500 });
  }
}

export async function GET(_request: NextRequest) {
  try {
    // Check if user is authenticated and is an admin
    const legacyReq = buildLegacyRequest(await headers(), await cookies());
    const session = await getServerSession({ req: legacyReq });
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });

    if (!user || user.role !== UserPermissionRole.ADMIN) {
      return NextResponse.json({ message: "Admin access required" }, { status: 403 });
    }

    // Get pending invitations
    const invitations = await prisma.invitationToken.findMany({
      where: {
        usedAt: null, // Only show unused invitations
      },
      include: {
        invitedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({ invitations }, { status: 200 });
  } catch (error) {
    logger.error("Error fetching invitations", { error });
    return NextResponse.json({ message: "Failed to fetch invitations" }, { status: 500 });
  }
}
