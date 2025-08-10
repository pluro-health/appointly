import { z } from "zod";

import { sendInvitationEmail } from "@calcom/features/auth/lib/sendInvitationEmail";
import { createInvitationToken } from "@calcom/features/auth/lib/validateInvitationToken";
import { sendEmailVerification } from "@calcom/features/auth/lib/verifyEmail";
import { deleteUser } from "@calcom/features/users/lib/userDeletionService";

import { authedAdminProcedure } from "../../../procedures/authedProcedure";
import { router } from "../../../trpc";
import { ZCreateSelfHostedLicenseSchema } from "./createSelfHostedLicenseKey.schema";
import { ZListMembersSchema } from "./listPaginated.schema";
import { ZAdminLockUserAccountSchema } from "./lockUserAccount.schema";
import { ZAdminRemoveTwoFactor } from "./removeTwoFactor.schema";
import { ZAdminPasswordResetSchema } from "./sendPasswordReset.schema";
import { ZSetSMSLockState } from "./setSMSLockState.schema";
import { toggleFeatureFlag } from "./toggleFeatureFlag.procedure";
import { ZAdminVerifyWorkflowsSchema } from "./verifyWorkflows.schema";
import { ZWhitelistUserWorkflows } from "./whitelistUserWorkflows.schema";
import {
  workspacePlatformCreateSchema,
  workspacePlatformUpdateSchema,
  workspacePlatformUpdateServiceAccountSchema,
  workspacePlatformToggleEnabledSchema,
} from "./workspacePlatform/schema";

const NAMESPACE = "admin";

const namespaced = (s: string) => `${NAMESPACE}.${s}`;

export const adminRouter = router({
  listPaginated: authedAdminProcedure.input(ZListMembersSchema).query(async (opts) => {
    const { default: handler } = await import("./listPaginated.handler");
    return handler(opts);
  }),
  sendPasswordReset: authedAdminProcedure.input(ZAdminPasswordResetSchema).mutation(async (opts) => {
    const { default: handler } = await import("./sendPasswordReset.handler");
    return handler(opts);
  }),
  lockUserAccount: authedAdminProcedure.input(ZAdminLockUserAccountSchema).mutation(async (opts) => {
    const { default: handler } = await import("./lockUserAccount.handler");
    return handler(opts);
  }),
  toggleFeatureFlag,
  removeTwoFactor: authedAdminProcedure.input(ZAdminRemoveTwoFactor).mutation(async (opts) => {
    const { default: handler } = await import("./removeTwoFactor.handler");
    return handler(opts);
  }),
  getSMSLockStateTeamsUsers: authedAdminProcedure.query(async (opts) => {
    const { default: handler } = await import("./getSMSLockStateTeamsUsers.handler");
    return handler(opts);
  }),
  setSMSLockState: authedAdminProcedure.input(ZSetSMSLockState).mutation(async (opts) => {
    const { default: handler } = await import("./setSMSLockState.handler");
    return handler(opts);
  }),
  createSelfHostedLicense: authedAdminProcedure
    .input(ZCreateSelfHostedLicenseSchema)
    .mutation(async (opts) => {
      const { default: handler } = await import("./createSelfHostedLicenseKey.handler");
      return handler(opts);
    }),
  verifyWorkflows: authedAdminProcedure.input(ZAdminVerifyWorkflowsSchema).mutation(async (opts) => {
    const { default: handler } = await import("./verifyWorkflows.handler");
    return handler(opts);
  }),
  whitelistUserWorkflows: authedAdminProcedure.input(ZWhitelistUserWorkflows).mutation(async (opts) => {
    const { default: handler } = await import("./whitelistUserWorkflows.handler");
    return handler(opts);
  }),
  workspacePlatform: router({
    list: authedAdminProcedure.query(async () => {
      const { default: handler } = await import("./workspacePlatform/list.handler");
      return handler();
    }),
    add: authedAdminProcedure.input(workspacePlatformCreateSchema).mutation(async (opts) => {
      const { default: handler } = await import("./workspacePlatform/add.handler");
      return handler(opts);
    }),
    update: authedAdminProcedure.input(workspacePlatformUpdateSchema).mutation(async (opts) => {
      const { default: handler } = await import("./workspacePlatform/update.handler");
      return handler(opts);
    }),
    updateServiceAccount: authedAdminProcedure
      .input(workspacePlatformUpdateServiceAccountSchema)
      .mutation(async (opts) => {
        const { default: handler } = await import("./workspacePlatform/updateServiceAccount.handler");
        return handler(opts);
      }),
    toggleEnabled: authedAdminProcedure.input(workspacePlatformToggleEnabledSchema).mutation(async (opts) => {
      const { default: handler } = await import("./workspacePlatform/toggleEnabled.handler");
      return handler(opts);
    }),
  }),
  // User Management and Invitations
  sendInvitation: authedAdminProcedure
    .input(
      z.object({
        email: z.string().email(),
        role: z.enum(["USER", "ADMIN"]),
        expiresInHours: z.number().min(1).max(168).default(24),
        replaceExisting: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { email, role, expiresInHours, replaceExisting } = input;

      // Check if user already exists
      const existingUser = await ctx.prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (existingUser) {
        throw new Error("A user with this email already exists");
      }

      // If replacing existing invitations, delete them first
      if (replaceExisting) {
        await ctx.prisma.invitationToken.deleteMany({
          where: {
            email: email.toLowerCase(),
          },
        });
      } else {
        // Check if invitation already exists and is not expired
        const existingInvitation = await ctx.prisma.invitationToken.findFirst({
          where: {
            email: email.toLowerCase(),
            expiresAt: { gt: new Date() },
            usedAt: null,
          },
        });

        if (existingInvitation) {
          throw new Error("An invitation for this email already exists");
        }
      }

      // Create invitation token
      const token = await createInvitationToken(email.toLowerCase(), role, ctx.user.id, expiresInHours);

      // Send invitation email
      await sendInvitationEmail({
        email: email.toLowerCase(),
        token: token,
        invitedBy: {
          id: ctx.user.id,
          name: ctx.user.name,
          email: ctx.user.email || "",
        },
        expiresInHours,
      });

      return { success: true };
    }),

  getInvitations: authedAdminProcedure.query(async ({ ctx }) => {
    try {
      const invitations = await ctx.prisma.invitationToken.findMany({
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

      console.log("Fetched invitations:", invitations.length);
      return invitations;
    } catch (error) {
      console.error("Error fetching invitations:", error);
      throw error;
    }
  }),

  // User deletion
  deleteUser: authedAdminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = input;

      // Get user to delete
      const userToDelete = await ctx.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          metadata: true,
        },
      });

      if (!userToDelete) {
        throw new Error("User not found");
      }

      // Prevent admin from deleting themselves
      if (userToDelete.id === ctx.user.id) {
        throw new Error("Cannot delete your own account");
      }

      // Delete the user using the service
      await deleteUser(userToDelete);

      return { success: true, message: "User deleted successfully" };
    }),

  // Delete invitation
  deleteInvitation: authedAdminProcedure
    .input(z.object({ invitationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { invitationId } = input;

      // Get invitation to delete
      const invitation = await ctx.prisma.invitationToken.findUnique({
        where: { id: invitationId },
        select: {
          id: true,
          email: true,
          usedAt: true,
        },
      });

      if (!invitation) {
        throw new Error("Invitation not found");
      }

      // Prevent deletion of used invitations
      if (invitation.usedAt) {
        throw new Error("Cannot delete used invitations");
      }

      // Delete the invitation
      await ctx.prisma.invitationToken.delete({
        where: { id: invitationId },
      });

      return { success: true, message: "Invitation deleted successfully" };
    }),

  // Resend email verification
  resendEmailVerification: authedAdminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { userId } = input;

      // Get user to resend verification for
      const user = await ctx.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          username: true,
          locale: true,
          emailVerified: true,
        },
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Check if user is already verified
      if (user.emailVerified) {
        throw new Error("User is already verified");
      }

      // Send email verification
      await sendEmailVerification({
        email: user.email,
        username: user.username || undefined,
        language: user.locale || "en",
      });

      return { success: true, message: "Verification email sent successfully" };
    }),

  // Resend invitation email
  resendInvitationEmail: authedAdminProcedure
    .input(z.object({ invitationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { invitationId } = input;

      // Get invitation to resend
      const invitation = await ctx.prisma.invitationToken.findUnique({
        where: { id: invitationId },
        include: {
          invitedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      if (!invitation) {
        throw new Error("Invitation not found");
      }

      // Check if invitation has been used
      if (invitation.usedAt) {
        throw new Error("Cannot resend used invitations");
      }

      // Check if invitation has expired
      if (invitation.expiresAt < new Date()) {
        throw new Error("Cannot resend expired invitations");
      }

      // Calculate remaining hours
      const now = new Date();
      const expiresInHours = Math.ceil((invitation.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60));

      // Resend invitation email
      await sendInvitationEmail({
        email: invitation.email,
        token: invitation.token,
        invitedBy: invitation.invitedBy,
        expiresInHours,
      });

      return { success: true, message: "Invitation email resent successfully" };
    }),
});
