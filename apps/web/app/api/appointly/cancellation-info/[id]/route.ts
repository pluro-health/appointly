import { cookies, headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { appointlyCancelHandler } from "@calcom/lib/appointly-cancel-handler";
import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";

import { buildLegacyRequest } from "@lib/buildLegacyCtx";

/**
 * GET /api/appointly/cancellation-info/[id]
 * Get cancellation information for a booking including refund eligibility and countdown
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const log = logger.getSubLogger({ prefix: ["API", "appointly", "cancellation-info"] });

  try {
    const bookingId = parseInt(params.id);

    if (isNaN(bookingId)) {
      return NextResponse.json({ error: "Invalid booking ID" }, { status: 400 });
    }

    // Get session to determine user role
    const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });

    // Determine user role by checking if user owns the booking
    let userRole: "host" | "attendee" = "attendee";

    if (session?.user?.id) {
      try {
        const booking = await prisma.booking.findUnique({
          where: { id: bookingId },
          select: { userId: true },
        });

        // If the logged-in user owns the booking, they are the host
        if (booking?.userId === session.user.id) {
          userRole = "host";
          log.info("User is booking owner, setting role to host", {
            bookingId,
            userId: session.user.id,
            bookingUserId: booking?.userId,
          });
        } else {
          log.info("User is not booking owner, keeping role as attendee", {
            bookingId,
            userId: session.user.id,
            bookingUserId: booking?.userId,
          });
        }
      } catch (error) {
        log.warn("Failed to check booking ownership, defaulting to attendee role", {
          bookingId,
          userId: session.user.id,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    log.info("Fetching cancellation info", {
      bookingId,
      userRole,
      userId: session?.user?.id,
    });

    // Get cancellation information
    const cancellationInfo = await appointlyCancelHandler.getCancellationInfo(bookingId, userRole);

    return NextResponse.json(cancellationInfo);
  } catch (error: any) {
    log.error("Cancellation info API error", {
      bookingId: params.id,
      error: error?.message || error,
    });

    return NextResponse.json(
      {
        error: "Failed to fetch cancellation information",
        canCancel: false,
        refundEligible: false,
        refundPercentage: 0,
      },
      { status: 500 }
    );
  }
}
