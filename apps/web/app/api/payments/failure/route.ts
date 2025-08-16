import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { EasebuzzService } from "@calcom/lib/easebuzz-service";
import { getErrorFromUnknown } from "@calcom/lib/errors";
import { HttpError } from "@calcom/lib/http-error";
import logger from "@calcom/lib/logger";
import { defaultHandler } from "@calcom/lib/server/defaultHandler";
import { prisma } from "@calcom/prisma";

// Easebuzz failure callback parameters
const failureCallbackSchema = z.object({
  txnid: z.string().optional(),
  firstname: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  productinfo: z.string().optional(),
  amount: z.string().optional(),
  hash: z.string().optional(),
  status: z.string().optional(),
  mode: z.string().optional(),
  error_code: z.string().optional(),
  error_Message: z.string().optional(),
  bankcode: z.string().optional(),
  unmappedstatus: z.string().optional(),
  mihpayid: z.string().optional(),
});

export type FailureCallbackRequest = z.infer<typeof failureCallbackSchema>;

async function handler(req: NextRequest) {
  try {
    if (req.method !== "POST") {
      throw new HttpError({ statusCode: 405, message: "Method Not Allowed" });
    }

    // Parse query parameters
    const url = new URL(req.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());

    const parseResult = failureCallbackSchema.safeParse(queryParams);
    if (!parseResult.success) {
      logger.error("Invalid failure callback parameters", {
        params: queryParams,
        errors: parseResult.error.errors,
      });
      throw new HttpError({ statusCode: 400, message: "Invalid callback parameters" });
    }

    const callbackData = parseResult.data;

    // Validate required fields
    if (!callbackData.txnid || !callbackData.hash) {
      logger.error("Missing required callback parameters", { callbackData });
      throw new HttpError({ statusCode: 400, message: "Missing required parameters" });
    }

    // 1. Find payment record by Easebuzz transaction ID
    const payment = await prisma.easebuzzPayment.findUnique({
      where: { easebuzzTxnId: callbackData.txnid },
      include: {
        booking: {
          include: {
            user: true,
            eventType: true,
          },
        },
      },
    });

    if (!payment) {
      logger.error("Payment not found for transaction", { txnid: callbackData.txnid });
      throw new HttpError({ statusCode: 404, message: "Payment not found" });
    }

    // 2. Verify hash authenticity
    const easebuzzService = new EasebuzzService();
    const hashVerification = await easebuzzService.verifyPayment(callbackData);

    if (!hashVerification.isValid) {
      logger.error("Hash verification failed", {
        txnid: callbackData.txnid,
        bookingId: payment.bookingId,
        hash: callbackData.hash,
      });
      throw new HttpError({ statusCode: 400, message: "Invalid hash" });
    }

    // 3. Check if payment is already processed
    if (payment.status === "SUCCESS") {
      logger.info("Payment already processed successfully, ignoring failure callback", {
        txnid: callbackData.txnid,
        bookingId: payment.bookingId,
      });
      // Redirect to success page since payment was already successful
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_WEBAPP_URL}/booking/${payment.booking.uid}?payment=success`,
        303
      );
    }

    // 4. Update payment record with failure status
    const updatedPayment = await prisma.easebuzzPayment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        easebuzzResponse: {
          ...callbackData,
          failureReason: callbackData.error_Message || callbackData.error_code || "Payment failed",
          failureCode: callbackData.error_code,
          unmappedStatus: callbackData.unmappedstatus,
        },
      },
    });

    // 5. Update booking status to allow retry
    await prisma.booking.update({
      where: { id: payment.bookingId },
      data: {
        paymentStatus: "FAILED",
        // Keep booking status as PENDING to allow retry
        status: "PENDING",
      },
    });

    // 6. Log failure details for debugging
    logger.error("Payment failed", {
      txnid: callbackData.txnid,
      bookingId: payment.bookingId,
      amount: callbackData.amount,
      errorCode: callbackData.error_code,
      errorMessage: callbackData.error_Message,
      unmappedStatus: callbackData.unmappedstatus,
      bankCode: callbackData.bankcode,
    });

    // 7. Redirect to failure page with retry option
    const failureReason = callbackData.error_Message || callbackData.error_code || "Payment failed";
    const encodedReason = encodeURIComponent(failureReason);

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_WEBAPP_URL}/booking/${payment.booking.uid}?payment=failed&reason=${encodedReason}`,
      303
    );
  } catch (error) {
    const err = getErrorFromUnknown(error);

    logger.error("Payment failure callback failed", {
      error: err.message,
      stack: err.stack,
      queryParams: Object.fromEntries(new URL(req.url).searchParams.entries()),
    });

    if (error instanceof HttpError) {
      throw error;
    }

    // Redirect to error page for unexpected errors
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_WEBAPP_URL}/payment/error?reason=callback_failed`,
      303
    );
  }
}

export const POST = defaultResponderForAppDir(handler);
