import { NextResponse } from "next/server";

import { checkPremiumUsername } from "@calcom/ee/common/lib/checkPremiumUsername";
import { hashPassword } from "@calcom/features/auth/lib/hashPassword";
import {
  validateInvitationToken,
  markInvitationTokenAsUsed,
} from "@calcom/features/auth/lib/validateInvitationToken";
import { sendEmailVerification } from "@calcom/features/auth/lib/verifyEmail";
import { createOrUpdateMemberships } from "@calcom/features/auth/signup/utils/createOrUpdateMemberships";
import { FeaturesRepository } from "@calcom/features/flags/features.repository";
import { IS_PREMIUM_USERNAME_ENABLED } from "@calcom/lib/constants";
import logger from "@calcom/lib/logger";
import { isUsernameReservedDueToMigration } from "@calcom/lib/server/username";
import slugify from "@calcom/lib/slugify";
import { validateAndGetCorrectedUsernameAndEmail } from "@calcom/lib/validateUsername";
import prisma from "@calcom/prisma";
import type { UserPermissionRole } from "@calcom/prisma/enums";
import { IdentityProvider } from "@calcom/prisma/enums";
import { signupSchema } from "@calcom/prisma/zod-utils";

import { joinAnyChildTeamOnOrgInvite } from "../utils/organization";
import { prefillAvatar } from "../utils/prefillAvatar";
import {
  findTokenByToken,
  throwIfTokenExpired,
  validateAndGetCorrectedUsernameForTeam,
} from "../utils/token";

export default async function handler(body: Record<string, string>) {
  const { email, password, language, token } = signupSchema.parse(body);

  const username = slugify(body.username);
  const userEmail = email.toLowerCase();

  if (!username) {
    return NextResponse.json({ message: "Invalid username" }, { status: 422 });
  }

  let foundToken: { id: number; teamId: number | null; expires: Date } | null = null;
  let invitationData: {
    email: string;
    role: UserPermissionRole;
    invitedById: number;
    centerId?: number;
  } | null = null;
  let correctedUsername = username;

  // Check if this is an invitation token (not a team invite token)
  if (token) {
    // First try to validate as invitation token
    const invitationValidation = await validateInvitationToken(token);

    if (invitationValidation.isValid && invitationValidation.data) {
      // This is an invitation token
      invitationData = invitationValidation.data;

      // Validate that the email in the invitation matches the signup email
      if (invitationData.email.toLowerCase() !== userEmail) {
        return NextResponse.json(
          {
            message: "Email address does not match the invitation",
          },
          { status: 400 }
        );
      }

      // Use the username from the signup form, but validate it
      const userValidation = await validateAndGetCorrectedUsernameAndEmail({
        username,
        email: userEmail,
        isSignup: true,
      });

      if (!userValidation.isValid) {
        logger.error("User validation failed", { userValidation });
        return NextResponse.json({ message: "Username or email is already taken" }, { status: 409 });
      }

      if (!userValidation.username) {
        return NextResponse.json({ message: "Invalid username" }, { status: 422 });
      }

      correctedUsername = userValidation.username;
    } else {
      // Try to validate as team invite token (existing logic)
      foundToken = await findTokenByToken({ token });
      throwIfTokenExpired(foundToken?.expires);
      correctedUsername = await validateAndGetCorrectedUsernameForTeam({
        username,
        email: userEmail,
        teamId: foundToken?.teamId,
        isSignup: true,
      });
    }
  } else {
    // No token provided - check if open registration is allowed
    // For admin-controlled registration, this should be disabled
    const featuresRepository = new FeaturesRepository(prisma);
    const signupDisabled = await featuresRepository.checkIfFeatureIsEnabledGlobally("disable-signup");

    if (process.env.NEXT_PUBLIC_DISABLE_SIGNUP === "true" || signupDisabled) {
      return NextResponse.json(
        {
          message: "Registration by invitation only. Please contact an administrator.",
        },
        { status: 403 }
      );
    }

    // Open registration is allowed, proceed with normal validation
    const userValidation = await validateAndGetCorrectedUsernameAndEmail({
      username,
      email: userEmail,
      isSignup: true,
    });

    if (!userValidation.isValid) {
      logger.error("User validation failed", { userValidation });
      return NextResponse.json({ message: "Username or email is already taken" }, { status: 409 });
    }

    if (!userValidation.username) {
      return NextResponse.json({ message: "Invalid username" }, { status: 422 });
    }

    correctedUsername = userValidation.username;
  }

  const hashedPassword = await hashPassword(password);

  if (foundToken && foundToken?.teamId) {
    // Handle team invite (existing logic)
    const team = await prisma.team.findUnique({
      where: {
        id: foundToken.teamId,
      },
      include: {
        parent: {
          select: {
            id: true,
            slug: true,
            organizationSettings: true,
          },
        },
        organizationSettings: true,
      },
    });

    if (team) {
      const isInviteForATeamInOrganization = !!team.parent;
      const isCheckingUsernameInGlobalNamespace = !team.isOrganization && !isInviteForATeamInOrganization;

      if (isCheckingUsernameInGlobalNamespace) {
        const isUsernameAvailable = !(await isUsernameReservedDueToMigration(correctedUsername));
        if (!isUsernameAvailable) {
          return NextResponse.json({ message: "A user exists with that username" }, { status: 409 });
        }
      }

      const user = await prisma.user.upsert({
        where: { email: userEmail },
        update: {
          username: correctedUsername,
          password: {
            upsert: {
              create: { hash: hashedPassword },
              update: { hash: hashedPassword },
            },
          },
          emailVerified: new Date(Date.now()),
          identityProvider: IdentityProvider.CAL,
        },
        create: {
          username: correctedUsername,
          email: userEmail,
          password: { create: { hash: hashedPassword } },
          identityProvider: IdentityProvider.CAL,
        },
      });

      const { membership } = await createOrUpdateMemberships({
        user,
        team,
      });

      // Accept any child team invites for orgs.
      if (team.parent) {
        await joinAnyChildTeamOnOrgInvite({
          userId: user.id,
          org: team.parent,
        });
      }
    }

    // Cleanup token after use
    await prisma.verificationToken.delete({
      where: {
        id: foundToken.id,
      },
    });
  } else if (invitationData) {
    // Handle invitation token registration
    const isUsernameAvailable = !(await isUsernameReservedDueToMigration(correctedUsername));
    if (!isUsernameAvailable) {
      return NextResponse.json({ message: "A user exists with that username" }, { status: 409 });
    }

    if (IS_PREMIUM_USERNAME_ENABLED) {
      const checkUsername = await checkPremiumUsername(correctedUsername);
      if (checkUsername.premium) {
        return NextResponse.json(
          { message: "Sign up from https://cal.com/signup to claim your premium username" },
          { status: 422 }
        );
      }
    }

    // Create user with the role from the invitation
    const user = await prisma.user.create({
      data: {
        username: correctedUsername,
        email: userEmail,
        password: { create: { hash: hashedPassword } },
        role: invitationData.role,
        centerId: invitationData.centerId,
        emailVerified: new Date(Date.now()),
        identityProvider: IdentityProvider.CAL,
        creationSource: "WEBAPP",
      },
    });

    // Mark invitation token as used
    if (token) {
      const tokenMarked = await markInvitationTokenAsUsed(token);
      if (!tokenMarked) {
        logger.error("Failed to mark invitation token as used", { token });
        // Continue with user creation even if token marking fails
      } else {
        logger.info("Successfully marked invitation token as used", { token });
      }
    }

    if (process.env.AVATARAPI_USERNAME && process.env.AVATARAPI_PASSWORD) {
      await prefillAvatar({ email: userEmail });
    }

    // Send email verification
    await sendEmailVerification({
      email: userEmail,
      username: correctedUsername,
      language,
    });

    logger.info("User created via invitation", {
      userId: user.id,
      email: userEmail,
      role: invitationData.role,
      invitedById: invitationData.invitedById,
    });
  } else {
    // Handle open registration (if enabled)
    const isUsernameAvailable = !(await isUsernameReservedDueToMigration(correctedUsername));
    if (!isUsernameAvailable) {
      return NextResponse.json({ message: "A user exists with that username" }, { status: 409 });
    }

    if (IS_PREMIUM_USERNAME_ENABLED) {
      const checkUsername = await checkPremiumUsername(correctedUsername);
      if (checkUsername.premium) {
        return NextResponse.json(
          { message: "Sign up from https://cal.com/signup to claim your premium username" },
          { status: 422 }
        );
      }
    }

    await prisma.user.upsert({
      where: { email: userEmail },
      update: {
        username: correctedUsername,
        password: {
          upsert: {
            create: { hash: hashedPassword },
            update: { hash: hashedPassword },
          },
        },
        emailVerified: new Date(Date.now()),
        identityProvider: IdentityProvider.CAL,
      },
      create: {
        username: correctedUsername,
        email: userEmail,
        password: { create: { hash: hashedPassword } },
        identityProvider: IdentityProvider.CAL,
      },
    });

    if (process.env.AVATARAPI_USERNAME && process.env.AVATARAPI_PASSWORD) {
      await prefillAvatar({ email: userEmail });
    }

    await sendEmailVerification({
      email: userEmail,
      username: correctedUsername,
      language,
    });
  }

  return NextResponse.json({ message: "Created user" }, { status: 201 });
}
