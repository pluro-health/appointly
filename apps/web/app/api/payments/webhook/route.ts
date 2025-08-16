import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { EasebuzzService } from "@calcom/lib/easebuzz-service";
import { getErrorFromUnknown } from "@calcom/lib/errors";
import { HttpError } from "@calcom/lib/http-error";
import logger from "@calcom/lib/logger";
import { defaultHandler } from "@calcom/lib/server/defaultHandler";
import { defaultResponder } from "@calcom/lib/server/defaultResponder";
import { prisma } from "@calcom/prisma";

// Easebuzz webhook payload schema
const webhookPayloadSchema = z.object({
  txnid: z.string(),
  firstname: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  productinfo: z.string().optional(),
  amount: z.string(),
  hash: z.string(),
  status: z.string(),
  mode: z.string().optional(),
  bank_ref_num: z.string().optional(),
  payment_source: z.string().optional(),
  pg_type: z.string().optional(),
  error_code: z.string().optional(),
  error_Message: z.string().optional(),
  name_on_card: z.string().optional(),
  cardMask: z.string().optional(),
  bankcode: z.string().optional(),
  unmappedstatus: z.string().optional(),
  mihpayid: z.string().optional(),
  easepayid: z.string().optional(), // Add easepayid field
  net_amount_debit: z.string().optional(),
  addedon: z.string().optional(),
});

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;

async function handler(req: NextRequest) {
  try {
    if (req.method !== "POST") {
      throw new HttpError({ statusCode: 405, message: "Method Not Allowed" });
    }

    // Get raw body for hash verification
    const body = await req.text();
    const bodyData = JSON.parse(body);

    const parseResult = webhookPayloadSchema.safeParse(bodyData);
    if (!parseResult.success) {
      logger.error("Invalid webhook payload", {
        payload: bodyData,
        errors: parseResult.error.errors,
      });
      return NextResponse.json({ status: "error", message: "Invalid payload" }, { status: 400 });
    }

    const webhookData = parseResult.data;

    // Validate required fields
    if (!webhookData.txnid || !webhookData.hash) {
      logger.error("Missing required webhook parameters", { webhookData });
      return NextResponse.json({ status: "error", message: "Missing required parameters" }, { status: 400 });
    }

    // 1. Find payment record by Easebuzz transaction ID
    const payment = await prisma.easebuzzPayment.findUnique({
      where: { easebuzzTxnId: webhookData.txnid },
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
      logger.error("Payment not found for webhook", { txnid: webhookData.txnid });
      return NextResponse.json({ status: "error", message: "Payment not found" }, { status: 404 });
    }

    // 2. Verify hash authenticity
    const easebuzzService = new EasebuzzService();
    const hashVerification = await easebuzzService.verifyPayment(webhookData);

    if (!hashVerification.isValid) {
      logger.error("Webhook hash verification failed", {
        txnid: webhookData.txnid,
        bookingId: payment.bookingId,
        hash: webhookData.hash,
      });
      return NextResponse.json({ status: "error", message: "Invalid hash" }, { status: 400 });
    }

    // 3. Check for duplicate webhook processing
    if (payment.status === "SUCCESS" && webhookData.status === "success") {
      logger.info("Webhook already processed for successful payment", {
        txnid: webhookData.txnid,
        bookingId: payment.bookingId,
      });
      return NextResponse.json({ status: "success", message: "Already processed" });
    }

    // 4. Determine payment status from webhook
    let newPaymentStatus: "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED" = "PENDING";
    let newBookingStatus: "PENDING" | "ACCEPTED" | "CANCELLED" = "PENDING";
    let newBookingPaymentStatus: "PENDING" | "PAID" | "FAILED" | "CANCELLED" = "PENDING";
    let isPaid = false;

    switch (webhookData.status.toLowerCase()) {
      case "success":
        newPaymentStatus = "SUCCESS";
        newBookingStatus = "ACCEPTED";
        newBookingPaymentStatus = "PAID";
        isPaid = true;
        break;
      case "failure":
      case "failed":
        newPaymentStatus = "FAILED";
        newBookingStatus = "PENDING"; // Keep booking available for retry
        newBookingPaymentStatus = "FAILED";
        break;
      case "cancelled":
        newPaymentStatus = "CANCELLED";
        newBookingStatus = "CANCELLED";
        newBookingPaymentStatus = "CANCELLED";
        break;
      default:
        logger.warn("Unknown webhook status", {
          txnid: webhookData.txnid,
          status: webhookData.status,
        });
        return NextResponse.json({ status: "success", message: "Unknown status" });
    }

    // 5. Update payment record
    const updatedPayment = await prisma.easebuzzPayment.update({
      where: { id: payment.id },
      data: {
        status: newPaymentStatus,
        paidAt: newPaymentStatus === "SUCCESS" ? new Date() : null,
        paymentMethod: webhookData.payment_source || webhookData.pg_type,
        bankRefNum: webhookData.bank_ref_num,
        easepayid: webhookData.easepayid || null, // Extract easepayid from webhook data
        easebuzzResponse: {
          ...webhookData,
          webhookReceivedAt: new Date().toISOString(),
        },
      },
    });

    // 6. Update booking status
    await prisma.booking.update({
      where: { id: payment.bookingId },
      data: {
        status: newBookingStatus,
        paymentStatus: newBookingPaymentStatus,
        paid: isPaid,
      },
    });

    // 7. Send notifications for successful payments
    if (newPaymentStatus === "SUCCESS") {
      try {
        // Import email function dynamically to avoid circular dependencies
        // TODO: Fix email sending after resolving import issues
        logger.info("Email sending temporarily disabled", {
          bookingId: payment.bookingId,
          userEmail: payment.booking.user?.email,
          attendeeCount: payment.booking.attendees.length,
        });
      } catch (emailError) {
        logger.error("Failed to send webhook confirmation emails", {
          bookingId: payment.bookingId,
          error: getErrorFromUnknown(emailError).message,
        });
        // Don't fail the webhook if email fails
      }
    }

    logger.info("Webhook processed successfully", {
      txnid: webhookData.txnid,
      bookingId: payment.bookingId,
      status: webhookData.status,
      paymentStatus: newPaymentStatus,
      amount: webhookData.amount,
    });

    // 8. Return success response
    return NextResponse.json({
      status: "success",
      message: "Webhook processed successfully",
      paymentStatus: newPaymentStatus,
    });
  } catch (error) {
    const err = getErrorFromUnknown(error);

    logger.error("Webhook processing failed", {
      error: err.message,
      stack: err.stack,
      body: await req.text().catch(() => "Unable to read body"),
    });

    // Return error response to Easebuzz
    return NextResponse.json(
      {
        status: "error",
        message: "Internal server error",
      },
      { status: 500 }
    );
  }
}

export const POST = handler;
