import { randomBytes } from "crypto";

import { HttpError } from "@calcom/lib/http-error";
import logger from "@calcom/lib/logger";
import { prisma } from "@calcom/prisma";
import type { UserPermissionRole } from "@calcom/prisma/enums";

const log = logger.getSubLogger({ prefix: ["validateInvitationToken"] });

export interface InvitationTokenData {
  email: string;
  role: UserPermissionRole;
  invitedById: number;
}

export interface ValidateInvitationTokenResult {
  isValid: boolean;
  data?: InvitationTokenData;
  error?: string;
}

/**
 * Validates an invitation token and returns the associated data
 * @param token - The invitation token to validate
 * @returns Promise<ValidateInvitationTokenResult>
 */
export async function validateInvitationToken(token: string): Promise<ValidateInvitationTokenResult> {
  try {
    if (!token) {
      return {
        isValid: false,
        error: "Invitation token is required",
      };
    }

    // Find the invitation token
    const invitationToken = await prisma.invitationToken.findUnique({
      where: { token },
      include: {
        invitedBy: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!invitationToken) {
      log.warn("Invalid invitation token provided", { token });
      return {
        isValid: false,
        error: "Invalid invitation token",
      };
    }

    // Check if token has expired
    if (invitationToken.expiresAt < new Date()) {
      log.warn("Expired invitation token", {
        token,
        expiresAt: invitationToken.expiresAt,
        currentTime: new Date(),
      });
      return {
        isValid: false,
        error: "Invitation token has expired",
      };
    }

    // Check if token has already been used
    if (invitationToken.usedAt) {
      log.warn("Already used invitation token", {
        token,
        usedAt: invitationToken.usedAt,
      });
      return {
        isValid: false,
        error: "Invitation token has already been used",
      };
    }

    // Check if a user with this email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: invitationToken.email },
    });

    if (existingUser) {
      log.warn("User already exists with invitation email", {
        email: invitationToken.email,
        token,
      });
      return {
        isValid: false,
        error: "A user with this email already exists",
      };
    }

    // Token is valid, return the data
    return {
      isValid: true,
      data: {
        email: invitationToken.email,
        role: invitationToken.role,
        invitedById: invitationToken.invitedById,
      },
    };
  } catch (error) {
    log.error("Error validating invitation token", { error, token });
    return {
      isValid: false,
      error: "Failed to validate invitation token",
    };
  }
}

/**
 * Marks an invitation token as used
 * @param token - The invitation token to mark as used
 * @returns Promise<boolean> - Success status
 */
export async function markInvitationTokenAsUsed(token: string): Promise<boolean> {
  try {
    log.info("Marking invitation token as used", { token });

    const result = await prisma.invitationToken.update({
      where: { token },
      data: { usedAt: new Date() },
    });

    log.info("Successfully marked invitation token as used", {
      token,
      usedAt: result.usedAt,
      email: result.email,
    });

    return true;
  } catch (error) {
    log.error("Error marking invitation token as used", { error, token });
    return false;
  }
}

/**
 * Creates a new invitation token
 * @param email - Email address to invite
 * @param role - Role to assign to the user
 * @param invitedById - ID of the user sending the invitation
 * @param expiresInHours - Hours until token expires (default: 24)
 * @returns Promise<string> - The generated token
 */
export async function createInvitationToken(
  email: string,
  role: UserPermissionRole,
  invitedById: number,
  expiresInHours = 24
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  await prisma.invitationToken.create({
    data: {
      email: email.toLowerCase(),
      token,
      role,
      invitedById,
      expiresAt,
    },
  });

  return token;
}

/**
 * Middleware function to validate invitation tokens in request context
 * Can be used in API routes and tRPC procedures
 */
export function withInvitationTokenValidation() {
  return async (req: any, res: any, next: any) => {
    try {
      const token = req.query.token || req.body.token;

      if (!token) {
        throw new HttpError({
          statusCode: 400,
          message: "Invitation token is required",
        });
      }

      const validationResult = await validateInvitationToken(token);

      if (!validationResult.isValid) {
        throw new HttpError({
          statusCode: 400,
          message: validationResult.error || "Invalid invitation token",
        });
      }

      // Attach the invitation data to the request
      req.invitationData = validationResult.data;
      req.invitationToken = token;

      next();
    } catch (error) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({
          message: error.message,
        });
      }

      log.error("Error in invitation token validation middleware", { error });
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  };
}
