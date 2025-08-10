import { CAL_URL, APP_NAME } from "@calcom/lib/constants";
import logger from "@calcom/lib/logger";
import { getTranslation } from "@calcom/lib/server/i18n";
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
    // Since this function is called from API routes, we don't have access to the request context
    // So we'll use a default locale
    const t = await getTranslation("en", "common");

    const inviteLink = `${CAL_URL}/auth/signup?token=${token}`;
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    const emailSubject = t("invitation_email_subject", {
      appName: APP_NAME,
    });

    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">You've been invited to join ${APP_NAME}</h2>
        
        <p>Hello,</p>
        
        <p>You have been invited by <strong>${
          invitedBy.name || invitedBy.email
        }</strong> to join ${APP_NAME}.</p>
        
        <p>To accept this invitation and create your account, please click the link below:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${inviteLink}" 
             style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            Accept Invitation
          </a>
        </div>
        
        <p><strong>Important:</strong></p>
        <ul>
          <li>This invitation will expire on ${expiresAt.toLocaleString()}</li>
          <li>You can only use this invitation once</li>
          <li>Make sure to use the same email address that was invited</li>
        </ul>
        
        <p>If you have any questions, please contact your administrator.</p>
        
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        
        <p style="color: #666; font-size: 12px;">
          This invitation was sent from ${APP_NAME}.<br>
          If you didn't expect this invitation, you can safely ignore this email.
        </p>
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
