import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { EasebuzzService } from "@calcom/lib/easebuzz-service";
import { HttpError } from "@calcom/lib/http-error";
import logger from "@calcom/lib/logger";
// Remove legacy handlers - using App Router directly
import { prisma } from "@calcom/prisma";

// ✅ FIX 1: Email handling will be done with handleConfirmation

const successCallbackSchema = z.object({
  txnid: z.string(),
  amount: z.string(),
  firstname: z.string(),
  email: z.string(),
  phone: z.string(),
  productinfo: z.string(),
  hash: z.string(),
  status: z.string(),
  udf1: z.string().optional(),
  udf2: z.string().optional(),
  udf3: z.string().optional(),
  udf4: z.string().optional(),
  udf5: z.string().optional(),
  udf6: z.string().optional(),
  udf7: z.string().optional(),
  udf8: z.string().optional(),
  udf9: z.string().optional(),
  udf10: z.string().optional(),
  // Additional fields from Easebuzz response
  key: z.string().optional(),
  merchant_txn: z.string().optional(),
  payment_source: z.string().optional(),
  PG_TYPE: z.string().optional(),
  bank_ref_num: z.string().optional(),
  bank_ref_no: z.string().optional(),
  bankcode: z.string().optional(),
  card_type: z.string().optional(),
  easepayid: z.string().optional(),
  net_amount_debit: z.string().optional(),
  addedon: z.string().optional(),
});

async function handler(req: NextRequest) {
  const startTime = Date.now();
  logger.info(" Easebuzz success callback received", {
    method: req.method,
    url: req.url,
    userAgent: req.headers.get("user-agent"),
    timestamp: new Date().toISOString(),
  });

  try {
    // Parse callback data from both body and query params (Easebuzz can send either)
    let callbackData: any = {};

    try {
      if (req.method === "POST") {
        const contentType = req.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          callbackData = await req.json();
        } else if (contentType?.includes("application/x-www-form-urlencoded")) {
          const formData = await req.formData();
          callbackData = Object.fromEntries(formData);
        } else {
          // Try to parse as text and then as form data
          const body = await req.text();
          callbackData = Object.fromEntries(new URLSearchParams(body));
        }
      }
    } catch (bodyParseError) {
      logger.warn("⚠️ Could not parse request body, trying query parameters", {
        error: bodyParseError instanceof Error ? bodyParseError.message : bodyParseError,
      });
    }

    // Fallback to query parameters if body parsing failed or was empty
    if (Object.keys(callbackData).length === 0) {
      const searchParams = req.nextUrl.searchParams;
      callbackData = Object.fromEntries(searchParams);
    }

    logger.info("📋 Success callback data received", {
      txnid: callbackData.txnid,
      merchant_txn: callbackData.merchant_txn,
      amount: callbackData.amount,
      status: callbackData.status,
      email: callbackData.email,
      phone: callbackData.phone,
      hasHash: !!callbackData.hash,
      paymentSource: callbackData.payment_source,
      pgType: callbackData.PG_TYPE,
      bankRefNum: callbackData.bank_ref_num,
      callbackDataKeys: Object.keys(callbackData),
    });

    const parseResult = successCallbackSchema.safeParse(callbackData);
    if (!parseResult.success) {
      logger.error("❌ Invalid success callback data", {
        errors: parseResult.error.errors,
        receivedData: callbackData,
      });
      return NextResponse.redirect(
        new URL(`/?payment=failed&reason=${encodeURIComponent("invalid_callback_data")}`, req.url),
        303
      );
    }

    const validatedData = parseResult.data;
    logger.info("✅ Callback data validated successfully", {
      txnid: validatedData.txnid,
      amount: validatedData.amount,
      status: validatedData.status,
      udf1: validatedData.udf1, // This should contain booking UID
    });

    // 1. Find payment record by Easebuzz transaction ID (✅ ROBUST: Includes booking UID)
    logger.info("🔍 Looking up payment record", {
      easebuzzTxnId: validatedData.txnid,
    });

    const payment = await prisma.easebuzzPayment.findUnique({
      where: { easebuzzTxnId: validatedData.txnid },
      include: {
        booking: {
          include: {
            user: true,
            eventType: true,
            attendees: true,
          },
        },
      },
    });

    if (!payment) {
      logger.error("❌ Payment not found for transaction", {
        txnid: validatedData.txnid,
        searchedBy: "easebuzzTxnId",
      });
      return NextResponse.redirect(
        new URL(`/?payment=failed&reason=${encodeURIComponent("payment_not_found")}`, req.url),
        303
      );
    }

    logger.info("✅ Payment record found", {
      paymentId: payment.id,
      bookingId: payment.bookingId,
      currentPaymentStatus: payment.status,
      bookingUid: payment.booking.uid,
      bookingStatus: payment.booking.status,
      bookingPaymentStatus: payment.booking.paymentStatus,
    });

    // 2. Verify hash authenticity using the official Easebuzz service
    logger.info("🔐 Verifying payment hash...");
    const easebuzzService = new EasebuzzService();
    const hashVerification = await easebuzzService.verifyPayment(validatedData);

    if (!hashVerification.isValid) {
      logger.error("❌ Hash verification failed", {
        txnid: validatedData.txnid,
        bookingId: payment.bookingId,
        hash: validatedData.hash?.substring(0, 20) + "...",
        verificationMessage: hashVerification.message,
      });
      return NextResponse.redirect(
        new URL(`/?payment=failed&reason=${encodeURIComponent("hash_verification_failed")}`, req.url),
        303
      );
    }

    logger.info("✅ Hash verification successful");

    // 3. Check if payment is already processed
    if (payment.status === "SUCCESS") {
      logger.info("⚠️ Payment already processed as successful", {
        txnid: validatedData.txnid,
        bookingId: payment.bookingId,
        paymentId: payment.id,
      });
      // Redirect directly to booking confirmation page even if already processed
      return NextResponse.redirect(new URL(`/booking/${payment.booking.uid}?payment=success`, req.url), 303);
    }

    // 4. Validate payment amount
    const expectedAmount = payment.amount.toString();
    const receivedAmount = validatedData.amount;

    // Normalize amounts to numbers for comparison (handles "200" vs "200.0")
    const expectedAmountNum = parseFloat(expectedAmount);
    const receivedAmountNum = receivedAmount ? parseFloat(receivedAmount) : null;

    logger.info("💰 Validating payment amount", {
      expected: expectedAmount,
      received: receivedAmount,
      expectedNum: expectedAmountNum,
      receivedNum: receivedAmountNum,
      txnid: validatedData.txnid,
    });

    if (!receivedAmount || receivedAmountNum === null || expectedAmountNum !== receivedAmountNum) {
      logger.error("❌ Payment amount mismatch", {
        txnid: validatedData.txnid,
        expected: expectedAmount,
        received: receivedAmount,
        expectedNum: expectedAmountNum,
        receivedNum: receivedAmountNum,
        bookingId: payment.bookingId,
      });
      return NextResponse.redirect(
        new URL(`/?payment=failed&reason=${encodeURIComponent("amount_mismatch")}`, req.url),
        303
      );
    }

    logger.info("✅ Payment amount validated successfully");

    // 5. Update payment record with success status
    logger.info("📝 Updating payment record to SUCCESS status");
    const updatedPayment = await prisma.easebuzzPayment.update({
      where: { id: payment.id },
      data: {
        status: "SUCCESS",
        paidAt: new Date(),
        paymentMethod: validatedData.payment_source || validatedData.PG_TYPE || "unknown",
        bankRefNum: validatedData.bank_ref_num || validatedData.bank_ref_no,
        easepayid: validatedData.easepayid || null,
        easebuzzResponse: validatedData,
      },
    });

    logger.info("✅ Payment record updated", {
      paymentId: updatedPayment.id,
      status: updatedPayment.status,
      paidAt: updatedPayment.paidAt,
      paymentMethod: updatedPayment.paymentMethod,
    });

    // 6. Booking status and emails will be handled together
    logger.info("📝 Proceeding to update booking status and send emails");

    // ✅ FIX: Use the proper handleConfirmation function for emails and video conferencing
    try {
      logger.info("📧 Triggering confirmation emails and video conferencing setup after successful payment", {
        bookingId: payment.bookingId,
        paymentId: payment.id,
        txnid: validatedData.txnid,
      });

      // Update booking status to confirmed first
      await prisma.booking.update({
        where: { id: payment.bookingId },
        data: {
          status: "ACCEPTED",
          paymentStatus: "PAID",
          paid: true,
        },
      });

      // ✅ Use the proper handleConfirmation function which handles emails and video conferencing
      const { handleConfirmation } = await import("@calcom/features/bookings/lib/handleConfirmation");
      const { getAllCredentialsIncludeServiceAccountKey } = await import(
        "@calcom/features/bookings/lib/getAllCredentialsForUsersOnEvent/getAllCredentials"
      );
      const { getBooking } = await import("@calcom/lib/payment/getBooking");

      // Get the complete booking data with all necessary information
      const { booking, user: userWithCredentials, evt, eventType } = await getBooking(payment.bookingId);

      // Get all credentials for the user
      const allCredentials = await getAllCredentialsIncludeServiceAccountKey(userWithCredentials, {
        ...booking.eventType,
        metadata: booking.eventType?.metadata as any,
      });

      // Call handleConfirmation which properly sets up video conferencing and sends emails
      await handleConfirmation({
        user: { ...userWithCredentials, credentials: allCredentials },
        evt,
        prisma,
        bookingId: booking.id,
        booking,
        paid: true,
        easebuzzPayment: payment, // Pass the Easebuzz payment data
      });

      logger.info("✅ Confirmation emails and video conferencing setup completed successfully", {
        bookingId: payment.bookingId,
        paymentId: payment.id,
      });
    } catch (confirmationError) {
      // Don't fail the entire flow if confirmation fails, but log the error
      logger.error("❌ Failed to handle confirmation after payment", {
        error: confirmationError instanceof Error ? confirmationError.message : confirmationError,
        bookingId: payment.bookingId,
        paymentId: payment.id,
        txnid: validatedData.txnid,
      });
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    logger.info(" Success callback processed successfully", {
      txnid: validatedData.txnid,
      bookingUid: payment.booking.uid,
      paymentId: payment.id,
      bookingId: payment.bookingId,
      amount: validatedData.amount,
      paymentMethod: updatedPayment.paymentMethod,
      duration: `${duration}ms`,
      redirectUrl: `/booking/${payment.booking.uid}?payment=success`,
    });

    // 8. Redirect directly to booking confirmation page
    const baseUrl = req.headers.get("host")
      ? `${req.headers.get("x-forwarded-proto") || "http"}://${req.headers.get("host")}`
      : "http://localhost:3000";
    return NextResponse.redirect(`${baseUrl}/booking/${payment.booking.uid}?payment=success`, 303);
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;

    logger.error("💥 Success callback processing failed", {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      duration: `${duration}ms`,
    });

    if (error instanceof HttpError) {
      throw error;
    }

    return NextResponse.redirect(
      new URL(`/?payment=failed&reason=${encodeURIComponent("callback_processing_failed")}`, req.url),
      303
    );
  }
}

// ✅ FIX: Direct App Router exports (no legacy wrappers needed)
export const POST = handler;
export const GET = handler;
