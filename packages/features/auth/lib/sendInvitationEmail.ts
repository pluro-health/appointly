import { WEB_URL, APP_NAME, SUPPORT_MAIL_ADDRESS } from "@calcom/lib/constants";
import logger from "@calcom/lib/logger";
import { prisma } from "@calcom/prisma";

export interface SendInvitationEmailParams {
  email: string;
  token: string;
  invitedBy: {
    id: number;
    name: string | null;
    email: string;
  };
  expiresInHours: number;
}

export async function sendInvitationEmail({
  email,
  token,
  invitedBy,
  expiresInHours,
}: SendInvitationEmailParams) {
  try {
    const inviteLink = `${WEB_URL}/auth/signup?token=${token}`;
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    const emailSubject = `Welcome to ${APP_NAME}! You're invited to join`;

    const emailBody = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 8px; background-color: #fafafa;">
        <header style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2C3E50; font-size: 24px;">Welcome to ${APP_NAME} 🎉</h1>
        </header>

        <p style="font-size: 16px; line-height: 1.6;">Hi there,</p>

        <p style="font-size: 16px; line-height: 1.6;">
          <strong>${
            invitedBy.name || invitedBy.email
          }</strong> has invited you to join <strong>${APP_NAME}</strong>.
        </p>

        <p style="font-size: 16px; line-height: 1.6;">
          Click the button below to accept your invitation and create your account. This invitation will expire on <strong>${expiresAt.toLocaleString()}</strong>.
        </p>

        <div style="text-align: center; margin: 40px 0;">
          <a href="${inviteLink}"
             style="background-color: #007bff; color: #fff; text-decoration: none; padding: 14px 28px; font-size: 16px; border-radius: 5px; display: inline-block;">
            Accept Invitation
          </a>
        </div>

        <footer style="margin-top: 40px; border-top: 1px solid #ddd; padding-top: 20px; text-align: center; font-size: 12px; color: #999;">
          Sent by ${APP_NAME}<br>
          Need help? Contact us at <a href="mailto:${SUPPORT_MAIL_ADDRESS}" style="color: #007bff; text-decoration: none;">${SUPPORT_MAIL_ADDRESS}</a>
        </footer>
      </div>
    `;

    // Use Cal.com's existing email infrastructure
    const { createTransport } = await import("nodemailer");
    const { serverConfig } = await import("@calcom/lib/serverConfig");

    const transporter = createTransport(serverConfig.transport);
    await transporter.sendMail({
      to: email,
      from: serverConfig.from,
      subject: emailSubject,
      html: emailBody,
    });

    logger.info("Invitation email sent successfully", {
      email,
      invitedBy: invitedBy.id,
      expiresInHours,
    });

    return true;
  } catch (error) {
    logger.error("Failed to send invitation email", {
      error,
      email,
      invitedBy: invitedBy.id,
    });
    throw error;
  }
}

/**
 * Resend invitation email for an existing token
 */
export async function resendInvitationEmail(token: string) {
  try {
    const invitation = await prisma.invitationToken.findUnique({
      where: { token },
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

    if (invitation.usedAt) {
      throw new Error("Invitation has already been used");
    }

    if (invitation.expiresAt < new Date()) {
      throw new Error("Invitation has expired");
    }

    // Calculate remaining hours
    const now = new Date();
    const expiresInHours = Math.ceil((invitation.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60));

    await sendInvitationEmail({
      email: invitation.email,
      token: invitation.token,
      invitedBy: invitation.invitedBy,
      expiresInHours,
    });

    return true;
  } catch (error) {
    logger.error("Failed to resend invitation email", { error, token });
    throw error;
  }
}
