import { NextRequest, NextResponse } from "next/server";

import { appointlyCancelHandler } from "@calcom/lib/appointly-cancel-handler";
import { appointlyRefundService } from "@calcom/lib/appointly-refund-service";
import logger from "@calcom/lib/logger";

/**
 * GET /api/appointly/refund-status/[id]
 * Get refund status for a booking
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const log = logger.getSubLogger({ prefix: ["API", "appointly", "refund-status"] });

  try {
    const bookingId = parseInt(params.id);

    if (isNaN(bookingId)) {
      return NextResponse.json({ error: "Invalid booking ID" }, { status: 400 });
    }

    log.info("Getting refund status", { bookingId });

    // Get detailed refund status
    const refundStatus = await appointlyCancelHandler.getRefundStatus(bookingId);

    return NextResponse.json({
      success: true,
      data: refundStatus,
    });
  } catch (error: any) {
    log.error("Get refund status API error", {
      bookingId: params.id,
      error: error?.message || error,
    });

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
