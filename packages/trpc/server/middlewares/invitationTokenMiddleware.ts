import { validateInvitationToken } from "@calcom/features/auth/lib/validateInvitationToken";

import { TRPCError } from "@trpc/server";

import { middleware } from "../trpc";

/**
 * tRPC middleware to validate invitation tokens
 * This middleware can be used in procedures that require invitation token validation
 */
export const withInvitationToken = middleware(async ({ ctx, next, input }: any) => {
  const token: string = (input as any)?.token || (ctx as any)?.token;

  if (!token) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invitation token is required",
    });
  }

  const validationResult = await validateInvitationToken(token);

  if (!validationResult.isValid) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: validationResult.error || "Invalid invitation token",
    });
  }

  return next({
    ctx: {
      ...ctx,
      invitationData: validationResult.data,
      invitationToken: token,
    },
  });
});

/**
 * tRPC middleware that requires both authentication and invitation token validation
 * This combines the existing isAuthed middleware with invitation token validation
 */
export const withInvitationTokenAndAuth = middleware(async ({ ctx, next, input }: any) => {
  // First check if user is authenticated
  if (!ctx.user || !ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  // Then validate invitation token
  const token: string = (input as any)?.token || (ctx as any)?.token;

  if (!token) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invitation token is required",
    });
  }

  const validationResult = await validateInvitationToken(token);

  if (!validationResult.isValid) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: validationResult.error || "Invalid invitation token",
    });
  }

  return next({
    ctx: {
      ...ctx,
      invitationData: validationResult.data,
      invitationToken: token,
    },
  });
});
