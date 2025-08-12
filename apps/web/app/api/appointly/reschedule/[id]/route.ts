import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { appointlyRescheduleHandler } from "@calcom/lib/appointly-reschedule-handler";
import logger from "@calcom/lib/logger";

const rescheduleSchema = z.object({
  newStartTime: z.string().transform((val) => new Date(val)),
  newEndTime: z.string().transform((val) => new Date(val)),
  timeZone: z.string(),
  reason: z.string().optional(),
});

/**
 * POST /api/appointly/reschedule/[id]
 * Reschedule a booking with appointly business rules
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const log = logger.getSubLogger({ prefix: ["API", "appointly", "reschedule"] });

  try {
    const bookingId = parseInt(params.id);

    if (isNaN(bookingId)) {
      return NextResponse.json({ error: "Invalid booking ID" }, { status: 400 });
    }

    // Parse request body
    const body = await request.json();
    const validatedData = rescheduleSchema.parse(body);

    // Extract user information from headers or session
    // TODO: Implement proper authentication/session handling
    const userId = request.headers.get("x-user-id") ? parseInt(request.headers.get("x-user-id")!) : undefined;
    const userEmail = request.headers.get("x-user-email") || undefined;

    log.info("Processing reschedule request", {
      bookingId,
      userId,
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
    log.error("Reschedule API error", {
      bookingId: params.id,
      error: error?.message || error,
    });

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid request data",
          details: error.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET /api/appointly/reschedule/[id]
 * Get reschedule information for a booking
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const log = logger.getSubLogger({ prefix: ["API", "appointly", "reschedule", "info"] });

  try {
    const bookingId = parseInt(params.id);

    if (isNaN(bookingId)) {
      return NextResponse.json({ error: "Invalid booking ID" }, { status: 400 });
    }

    log.info("Getting reschedule info", { bookingId });

    const rescheduleInfo = await appointlyRescheduleHandler.getRescheduleInfo(bookingId);

    return NextResponse.json({
      success: true,
      data: rescheduleInfo,
    });
  } catch (error: any) {
    log.error("Get reschedule info API error", {
      bookingId: params.id,
      error: error?.message || error,
    });

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
