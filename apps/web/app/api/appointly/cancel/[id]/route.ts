import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { appointlyCancelHandler } from "@calcom/lib/appointly-cancel-handler";
import logger from "@calcom/lib/logger";

const cancelSchema = z.object({
  reason: z.string().min(1, "Cancellation reason is required"),
  cancelledBy: z.enum(["BOOKER", "EVENT_OWNER"]),
});

/**
 * POST /api/appointly/cancel/[id]
 * Cancel a booking with appointly business rules and refund processing
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const log = logger.getSubLogger({ prefix: ["API", "appointly", "cancel"] });

  try {
    const bookingId = parseInt(params.id);

    if (isNaN(bookingId)) {
      return NextResponse.json({ error: "Invalid booking ID" }, { status: 400 });
    }

    // Parse request body
    const body = await request.json();
    const validatedData = cancelSchema.parse(body);

    // Extract user information from headers or session
    // TODO: Implement proper authentication/session handling
    const userId = request.headers.get("x-user-id") ? parseInt(request.headers.get("x-user-id")!) : undefined;
    const userEmail = request.headers.get("x-user-email") || undefined;

    log.info("Processing cancellation request", {
      bookingId,
      userId,
      cancelledBy: validatedData.cancelledBy,
      reason: validatedData.reason,
    });

    // Process the cancellation request
    const result = await appointlyCancelHandler.handleCancellation({
      bookingId,
      reason: validatedData.reason,
      cancelledBy: validatedData.cancelledBy,
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
      refundInfo: result.refundInfo,
    });
  } catch (error: any) {
    log.error("Cancellation API error", {
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
 * GET /api/appointly/cancel/[id]
 * Get cancellation information for a booking
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const log = logger.getSubLogger({ prefix: ["API", "appointly", "cancel", "info"] });

  try {
    const bookingId = parseInt(params.id);

    if (isNaN(bookingId)) {
      return NextResponse.json({ error: "Invalid booking ID" }, { status: 400 });
    }

    // Determine user role from query params or headers
    const userRole = (request.nextUrl.searchParams.get("userRole") as "host" | "attendee") || "attendee";

    log.info("Getting cancellation info", { bookingId, userRole });

    const cancellationInfo = await appointlyCancelHandler.getCancellationInfo(bookingId, userRole);

    return NextResponse.json({
      success: true,
      data: cancellationInfo,
    });
  } catch (error: any) {
    log.error("Get cancellation info API error", {
      bookingId: params.id,
      error: error?.message || error,
    });

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
