import { cookies, headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { AppointlyCancelHandler } from "@calcom/lib/appointly-cancel-handler";
import { HttpError } from "@calcom/lib/http-error";
import logger from "@calcom/lib/logger";
import prisma from "@calcom/prisma";
import { BookingStatus } from "@calcom/prisma/client";

import { buildLegacyRequest } from "@lib/buildLegacyCtx";

const ownerCancelSchema = z.object({
  reason: z.string().min(1, "Cancellation reason is required"),
});

/**
 * POST /api/bookings/[id]/owner-cancel
 * Cancel a booking by the event owner with 100% refund processing
 * Uses the proper AppointlyCancelHandler to ensure calendar events are removed
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const log = logger.getSubLogger({ prefix: ["API", "bookings", "owner-cancel"] });

  try {
    const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const bookingId = parseInt(params.id);
    if (isNaN(bookingId)) {
      return NextResponse.json({ error: "Invalid booking ID" }, { status: 400 });
    }

    // Parse request body
    const body = await request.json();
    const { reason } = ownerCancelSchema.parse(body);

    log.info("Processing owner cancellation", {
      bookingId,
      userId: session.user.id,
      reason,
    });

    // Verify the booking exists and user has permission (basic check)
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        eventType: {
          include: {
            owner: true,
            team: {
              include: {
                members: true,
              },
            },
          },
        },
      },
    });

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    if (booking.status === BookingStatus.CANCELLED) {
      return NextResponse.json({ error: "Booking is already cancelled" }, { status: 400 });
    }

    // Check if user is the event owner
    const isEventOwner = booking.eventType?.owner?.id === session.user.id;
    const isTeamOwnerOrAdmin = booking.eventType?.team?.members?.some(
      (member) => member.userId === session.user.id && ["OWNER", "ADMIN"].includes(member.role)
    );

    if (!isEventOwner && !isTeamOwnerOrAdmin) {
      return NextResponse.json({ error: "You are not authorized to cancel this booking" }, { status: 403 });
    }

    // Use the proper AppointlyCancelHandler that integrates with Cal.com's standard cancellation flow
    const cancelHandler = new AppointlyCancelHandler();
    const result = await cancelHandler.handleCancellation({
      bookingId,
      reason,
      cancelledBy: "EVENT_OWNER",
      userId: session.user.id,
      userEmail: session.user.email || "",
    });

    if (!result.success) {
      log.error("Cancellation failed", {
        bookingId,
        errors: result.errors,
        message: result.message,
      });
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    const response = {
      success: true,
      message: result.message,
      booking: {
        id: bookingId,
        status: "CANCELLED",
      },
      refund: result.refundInfo
        ? {
            success: result.refundInfo.refundStatus === "PROCESSED",
            amount: result.refundInfo.refundAmount,
            message: `${result.refundInfo.refundPercentage}% refund processed successfully`,
          }
        : null,
    };

    log.info("Owner cancellation completed successfully", {
      bookingId,
      refundInfo: result.refundInfo,
    });

    return NextResponse.json(response);
  } catch (error: any) {
    log.error("Owner cancellation failed", {
      bookingId: params.id,
      error: error.message,
      stack: error.stack,
    });

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request data", details: error.errors }, { status: 400 });
    }

    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
