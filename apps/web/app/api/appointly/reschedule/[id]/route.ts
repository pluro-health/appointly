import { cookies, headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { appointlyRescheduleHandler } from "@calcom/lib/appointly-reschedule-handler";
import logger from "@calcom/lib/logger";
import { prisma } from "@calcom/prisma";

import { buildLegacyRequest } from "@lib/buildLegacyCtx";

const rescheduleSchema = z.object({
  newStartTime: z.string().transform((val) => new Date(val)),
  newEndTime: z.string().transform((val) => new Date(val)),
  timeZone: z.string(),
  reason: z.string().optional(),
  attendeeEmail: z.string().optional(), // Add attendee email for unauthenticated reschedules
});

/**
 * POST /api/appointly/reschedule/[id]
 * Reschedule a booking with appointly business rules
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const log = logger.getSubLogger({ prefix: ["API", "appointly", "reschedule"] });

  try {
    const { id } = await params;
    const bookingId = parseInt(id);

    if (isNaN(bookingId)) {
      return NextResponse.json({ error: "Invalid booking ID" }, { status: 400 });
    }

    // Parse request body first
    const body = await request.json();
    const validatedData = rescheduleSchema.parse(body);

    // Get user session for authentication
    const legacyReq = buildLegacyRequest(await headers(), await cookies());
    const session = await getServerSession({ req: legacyReq });

    let userId: number | undefined;
    let userEmail: string | undefined;

    if (session?.user) {
      // Authenticated user (host or logged-in attendee)
      userId = session.user.id;
      userEmail = session.user.email || undefined;
      log.info("Authenticated user rescheduling", { userId, userEmail, bookingId });
    } else if (validatedData.attendeeEmail) {
      // Unauthenticated attendee using email
      userEmail = validatedData.attendeeEmail;

      // Verify the attendee email is actually an attendee of this booking
      const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: { attendees: true },
      });

      if (!booking) {
        return NextResponse.json({ error: "Booking not found" }, { status: 404 });
      }

      const isAttendee = booking.attendees.some(
        (attendee) => attendee.email.toLowerCase() === userEmail!.toLowerCase()
      );

      if (!isAttendee) {
        return NextResponse.json(
          { error: "Unauthorized - not an attendee of this booking" },
          { status: 403 }
        );
      }

      log.info("Unauthenticated attendee rescheduling", { userEmail, bookingId });
    } else {
      return NextResponse.json(
        { error: "Unauthorized - no session or attendee email provided" },
        { status: 401 }
      );
    }

    log.info("Processing reschedule request", {
      bookingId,
      userId,
      userEmail: userEmail || "unknown",
      newStartTime: validatedData.newStartTime,
      newEndTime: validatedData.newEndTime,
    });

    // Process the reschedule request
    const result = await appointlyRescheduleHandler.handleReschedule({
      bookingId,
      newStartTime: validatedData.newStartTime,
      newEndTime: validatedData.newEndTime,
      timeZone: validatedData.timeZone,
      reason: validatedData.reason,
      userId,
      userEmail,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.message,
          errors: result.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: result.message,
      bookingUid: result.bookingUid,
      newBookingId: result.newBookingId,
    });
  } catch (error: any) {
    const { id } = await params;
    log.error("Reschedule API error", {
      bookingId: id,
      error: error?.message || error,
    });

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET /api/appointly/reschedule/[id]
 * Get reschedule information for a booking
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const log = logger.getSubLogger({ prefix: ["API", "appointly", "reschedule", "info"] });

  try {
    const { id } = await params;
    const bookingId = parseInt(id);

    if (isNaN(bookingId)) {
      return NextResponse.json({ error: "Invalid booking ID" }, { status: 400 });
    }

    // Get user session for authentication
    const legacyReq = buildLegacyRequest(await headers(), await cookies());
    const session = await getServerSession({ req: legacyReq });

    // For GET requests, we can allow unauthenticated access to reschedule info
    // since it's just informational and doesn't modify anything
    const userId = session?.user?.id;

    log.info("Getting reschedule info", { bookingId, userId });

    const rescheduleInfo = await appointlyRescheduleHandler.getRescheduleInfo(bookingId);

    return NextResponse.json({
      success: true,
      data: rescheduleInfo,
    });
  } catch (error: any) {
    const { id } = await params;
    log.error("Get reschedule info API error", {
      bookingId: id,
      error: error?.message || error,
    });

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
