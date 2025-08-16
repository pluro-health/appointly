import type { Params } from "app/_types";
import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";
import { headers, cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { HttpError } from "@calcom/lib/http-error";
import logger from "@calcom/lib/logger";
import { defaultHandler } from "@calcom/lib/server/defaultHandler";
import { prisma } from "@calcom/prisma";

import { buildLegacyRequest } from "@lib/buildLegacyCtx";

const paymentStatusResponseSchema = z.object({
  success: z.boolean(),
  bookingId: z.number(),
  paymentStatus: z.enum(["PENDING", "SUCCESS", "FAILED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED"]),
  bookingPaymentStatus: z.enum(["PENDING", "PAID", "FAILED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED"]),
  amount: z.number().optional(),
  currency: z.string().optional(),
  transactionId: z.string().optional(),
  paymentMethod: z.string().optional(),
  paidAt: z.string().optional(),
  message: z.string(),
});

export type PaymentStatusResponse = z.infer<typeof paymentStatusResponseSchema>;

async function handler(req: NextRequest, { params }: { params: Promise<Params> }) {
  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
  if (!session?.user?.id) {
    throw new HttpError({ statusCode: 401, message: "Unauthorized" });
  }

  const resolvedParams = await params;
  const { bookingId } = resolvedParams as { bookingId: string };
  const bookingIdNum = parseInt(bookingId, 10);

  if (isNaN(bookingIdNum) || bookingIdNum <= 0) {
    throw new HttpError({ statusCode: 400, message: "Invalid booking ID" });
  }

  try {
    // 1. Retrieve booking with payment information
    const booking = await prisma.booking.findUnique({
      where: { id: bookingIdNum },
      include: {
        easebuzzPayment: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    if (!booking) {
      throw new HttpError({ statusCode: 404, message: "Booking not found" });
    }

    // 2. Validate booking ownership
    if (booking.userId !== session.user.id) {
      throw new HttpError({ statusCode: 403, message: "Access denied to this booking" });
    }

    // 3. Check if payment exists
    if (!booking.easebuzzPayment) {
      const response: PaymentStatusResponse = {
        success: false,
        bookingId: bookingIdNum,
        paymentStatus: "PENDING",
        bookingPaymentStatus: booking.paymentStatus,
        message: "No payment record found for this booking",
      };

      return NextResponse.json(response);
    }

    // 4. Return payment status information
    const response: PaymentStatusResponse = {
      success: true,
      bookingId: bookingIdNum,
      paymentStatus: booking.easebuzzPayment.status,
      bookingPaymentStatus: booking.paymentStatus,
      amount: booking.easebuzzPayment.amount ? Number(booking.easebuzzPayment.amount) : undefined,
      currency: booking.easebuzzPayment.currency,
      transactionId: booking.easebuzzPayment.easebuzzTxnId || undefined,
      paymentMethod: booking.easebuzzPayment.paymentMethod || undefined,
      paidAt: booking.easebuzzPayment.paidAt?.toISOString(),
      message: `Payment status: ${booking.easebuzzPayment.status}`,
    };

    logger.info("Payment status retrieved", {
      bookingId: bookingIdNum,
      userId: session.user.id,
      paymentStatus: booking.easebuzzPayment.status,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error("Payment status check failed", {
      bookingId: bookingIdNum,
      userId: session.user.id,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError({
      statusCode: 500,
      message: "Internal server error during payment status check",
    });
  }
}

export const GET = defaultResponderForAppDir(handler);
