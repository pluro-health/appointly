import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { EasebuzzService } from "@calcom/lib/easebuzz-service";
import { HttpError } from "@calcom/lib/http-error";
import logger from "@calcom/lib/logger";
// Remove legacy handlers - using App Router directly
import { prisma } from "@calcom/prisma";

const failureCallbackSchema = z.object({
  txnid: z.string(),
  amount: z.string().optional(),
  firstname: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  productinfo: z.string().optional(),
  hash: z.string(),
  status: z.string(),
  error: z.string().optional(),
  error_Message: z.string().optional(),
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
  unmappedstatus: z.string().optional(),
});

async function handler(req: NextRequest) {
  const startTime = Date.now();
  logger.info("❌ Easebuzz failure callback received", {
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

    logger.info("📋 Failure callback data received", {
      txnid: callbackData.txnid,
      merchant_txn: callbackData.merchant_txn,
      amount: callbackData.amount,
      status: callbackData.status,
      error: callbackData.error,
      error_Message: callbackData.error_Message,
      email: callbackData.email,
      phone: callbackData.phone,
      hasHash: !!callbackData.hash,
      paymentSource: callbackData.payment_source,
      pgType: callbackData.PG_TYPE,
      unmappedstatus: callbackData.unmappedstatus,
      callbackDataKeys: Object.keys(callbackData),
    });

    const parseResult = failureCallbackSchema.safeParse(callbackData);
    if (!parseResult.success) {
      logger.error("❌ Invalid failure callback data", {
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
      error: validatedData.error,
      error_Message: validatedData.error_Message,
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

    // 2. Verify hash authenticity (even for failures)
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

    // 3. Check if payment is already processed as success (shouldn't happen but safety check)
    if (payment.status === "SUCCESS") {
      logger.warn("⚠️ Payment was already successful, but received failure callback", {
        txnid: validatedData.txnid,
        bookingId: payment.bookingId,
        paymentId: payment.id,
      });
      // Redirect directly to booking confirmation page since payment was actually successful
      const baseUrl = req.headers.get("host")
        ? `${req.headers.get("x-forwarded-proto") || "http"}://${req.headers.get("host")}`
        : "http://localhost:3000";
      return NextResponse.redirect(`${baseUrl}/booking/${payment.booking.uid}?payment=success`, 303);
    }

    // 4. Determine the failure type based on status
    const status = validatedData.status?.toLowerCase();
    let paymentStatus: "FAILED" | "CANCELLED" = "FAILED";
    let failureReason = validatedData.error || validatedData.error_Message || "Payment failed";

    if (status === "cancelled" || status === "cancel") {
      paymentStatus = "CANCELLED";
      failureReason = "Payment was cancelled by user";
    } else if (status === "failed" || status === "failure") {
      paymentStatus = "FAILED";
      failureReason = validatedData.error || validatedData.error_Message || "Payment failed";
    }

    logger.info("💔 Processing payment failure", {
      txnid: validatedData.txnid,
      status: validatedData.status,
      mappedStatus: paymentStatus,
      failureReason: failureReason,
      originalError: validatedData.error,
      originalErrorMessage: validatedData.error_Message,
    });

    // 5. Update payment record with failure status
    logger.info("📝 Updating payment record to failure status");
    const updatedPayment = await prisma.easebuzzPayment.update({
      where: { id: payment.id },
      data: {
        status: paymentStatus,
        paymentMethod: validatedData.payment_source || validatedData.PG_TYPE || "unknown",
        bankRefNum: validatedData.bank_ref_num || validatedData.bank_ref_no,
        easebuzzResponse: validatedData,
      },
    });

    logger.info("✅ Payment record updated", {
      paymentId: updatedPayment.id,
      status: updatedPayment.status,
      paymentMethod: updatedPayment.paymentMethod,
    });

    // 6. Delete the booking since payment failed (clean slate approach)
    logger.info("🗑️ Deleting booking due to payment failure");

    // Get booking details before deletion for redirect info
    const bookingDetails = await prisma.booking.findUnique({
      where: { id: payment.bookingId },
      select: {
        uid: true,
        eventTypeId: true,
        startTime: true,
        endTime: true,
        eventType: {
          select: {
            slug: true,
            userId: true,
            teamId: true,
            team: {
              select: {
                slug: true,
              },
            },
            users: {
              select: {
                username: true,
              },
            },
          },
        },
      },
    });

    if (!bookingDetails) {
      logger.error("❌ Booking not found for deletion", { bookingId: payment.bookingId });
      throw new Error("Booking not found");
    }

    // Delete the booking and all related data
    await prisma.booking.delete({
      where: { id: payment.bookingId },
    });

    logger.info("✅ Booking deleted successfully", {
      bookingId: payment.bookingId,
      bookingUid: bookingDetails.uid,
      eventTypeSlug: bookingDetails.eventType?.slug,
    });

    // 7. No emails to send since booking is deleted
    logger.info("📧 No emails sent - booking deleted");

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Build the event type URL for "Book Again" functionality
    if (!bookingDetails.eventType) {
      logger.error("❌ Event type not found for booking", { bookingId: payment.bookingId });
      throw new Error("Event type not found");
    }

    const username = bookingDetails.eventType.team?.slug || bookingDetails.eventType.users[0]?.username;
    const eventTypeSlug = bookingDetails.eventType.slug;
    const eventTypeUrl = username ? `/${username}/${eventTypeSlug}` : `/${eventTypeSlug}`;

    logger.info("💔 Failure callback processed successfully", {
      txnid: validatedData.txnid,
      bookingUid: bookingDetails.uid,
      paymentId: payment.id,
      bookingId: payment.bookingId,
      amount: validatedData.amount,
      paymentStatus: paymentStatus,
      failureReason: failureReason,
      duration: `${duration}ms`,
      eventTypeUrl: eventTypeUrl,
      username: username,
      eventTypeSlug: eventTypeSlug,
    });

    // 8. Redirect to payment failure page with event type info for "Book Again"
    const baseUrl = req.headers.get("host")
      ? `${req.headers.get("x-forwarded-proto") || "http"}://${req.headers.get("host")}`
      : "http://localhost:3000";
    return NextResponse.redirect(
      `${baseUrl}/payment/failed?reason=${encodeURIComponent(
        failureReason
      )}&eventTypeUrl=${encodeURIComponent(eventTypeUrl)}&startTime=${encodeURIComponent(
        bookingDetails.startTime.toISOString()
      )}&endTime=${encodeURIComponent(bookingDetails.endTime.toISOString())}`,
      303
    );
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;

    logger.error("💥 Failure callback processing failed", {
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
