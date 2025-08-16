import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { sendAwaitingPaymentEmailAndSMS } from "@calcom/emails";
import { EasebuzzHashUtils } from "@calcom/lib/easebuzz-hash";
import { EasebuzzService } from "@calcom/lib/easebuzz-service";
import { getErrorFromUnknown } from "@calcom/lib/errors";
import { HttpError } from "@calcom/lib/http-error";
import logger from "@calcom/lib/logger";
import { defaultHandler } from "@calcom/lib/server/defaultHandler";
import { prisma } from "@calcom/prisma";

// Easebuzz success callback parameters
const successCallbackSchema = z.object({
  txnid: z.string().optional(),
  firstname: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  productinfo: z.string().optional(),
  amount: z.string().optional(),
  hash: z.string().optional(),
  status: z.string().optional(),
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
  net_amount_debit: z.string().optional(),
});

export type SuccessCallbackRequest = z.infer<typeof successCallbackSchema>;

async function handler(req: NextRequest) {
  try {
    if (req.method !== "POST") {
      throw new HttpError({ statusCode: 405, message: "Method Not Allowed" });
    }

    // Parse query parameters
    const url = new URL(req.url);
    const queryParams = Object.fromEntries(url.searchParams.entries());

    const parseResult = successCallbackSchema.safeParse(queryParams);
    if (!parseResult.success) {
      logger.error("Invalid success callback parameters", {
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
            attendees: true,
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
      logger.info("Payment already processed", {
        txnid: callbackData.txnid,
        bookingId: payment.bookingId,
      });
      // Redirect to success page even if already processed
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_WEBAPP_URL}/booking/${payment.booking.uid}?payment=success`,
        303
      );
    }

    // 4. Validate payment amount
    const expectedAmount = payment.amount.toString();
    const receivedAmount = callbackData.amount;

    // Normalize amounts to numbers for comparison (handles "200" vs "200.0")
    const expectedAmountNum = parseFloat(expectedAmount);
    const receivedAmountNum = receivedAmount ? parseFloat(receivedAmount) : null;

    if (!receivedAmount || receivedAmountNum === null || expectedAmountNum !== receivedAmountNum) {
      logger.error("Payment amount mismatch", {
        txnid: callbackData.txnid,
        expected: expectedAmount,
        received: receivedAmount,
        expectedNum: expectedAmountNum,
        receivedNum: receivedAmountNum,
        bookingId: payment.bookingId,
      });
      throw new HttpError({ statusCode: 400, message: "Payment amount mismatch" });
    }

    // 5. Update payment record with success status
    const updatedPayment = await prisma.easebuzzPayment.update({
      where: { id: payment.id },
      data: {
        status: "SUCCESS",
        paidAt: new Date(),
        paymentMethod: callbackData.payment_source || callbackData.pg_type,
        bankRefNum: callbackData.bank_ref_num,
        easebuzzResponse: callbackData,
      },
    });

    // 6. Update booking status
    await prisma.booking.update({
      where: { id: payment.bookingId },
      data: {
        status: "ACCEPTED",
        paymentStatus: "PAID",
        paid: true,
      },
    });

    // 7. Send confirmation emails
    try {
      if (payment.booking.user?.email) {
        // Create a proper CalendarEvent from booking data
        const calendarEvent = {
          type: "booking",
          title: payment.booking.title,
          startTime: payment.booking.startTime.toISOString(),
          endTime: payment.booking.endTime.toISOString(),
          organizer: {
            name: payment.booking.user?.name || "Organizer",
            email: payment.booking.user?.email || "",
            timeZone: payment.booking.user?.timeZone || "UTC",
            language: { translate: () => "" as any, locale: "en" },
          },
          attendees: payment.booking.attendees.map((attendee) => ({
            name: attendee.name || "",
            email: attendee.email,
            timeZone: attendee.timeZone || "UTC",
            language: { translate: () => "" as any, locale: "en" },
          })),
          paymentInfo: {
            link: `${process.env.NEXT_PUBLIC_WEBAPP_URL}/booking/${payment.booking.uid}`,
            reason: "Payment successful",
            id: payment.booking.uid,
          },
        };
        await sendAwaitingPaymentEmailAndSMS(calendarEvent);
      }

      // Send email to attendees
      for (const attendee of payment.booking.attendees) {
        if (attendee.email) {
          // Create a proper CalendarEvent from booking data for attendee
          const attendeeCalendarEvent = {
            type: "booking",
            title: payment.booking.title,
            startTime: payment.booking.startTime.toISOString(),
            endTime: payment.booking.endTime.toISOString(),
            organizer: {
              name: payment.booking.user?.name || "Organizer",
              email: payment.booking.user?.email || "",
              timeZone: payment.booking.user?.timeZone || "UTC",
              language: { translate: () => "" as any, locale: "en" },
            },
            attendees: payment.booking.attendees.map((attendee) => ({
              name: attendee.name || "",
              email: attendee.email,
              timeZone: attendee.timeZone || "UTC",
              language: { translate: () => "" as any, locale: "en" },
            })),
            paymentInfo: {
              link: `${process.env.NEXT_PUBLIC_WEBAPP_URL}/booking/${payment.booking.uid}`,
              reason: "Payment successful",
              id: payment.booking.uid,
            },
          };
          await sendAwaitingPaymentEmailAndSMS(attendeeCalendarEvent);
        }
      }
    } catch (emailError) {
      logger.error("Failed to send confirmation emails", {
        bookingId: payment.bookingId,
        error: getErrorFromUnknown(emailError).message,
      });
      // Don't fail the payment process if email fails
    }

    logger.info("Payment success processed", {
      txnid: callbackData.txnid,
      bookingId: payment.bookingId,
      amount: callbackData.amount,
      paymentMethod: callbackData.payment_source,
    });

    // 8. Redirect to success page
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_WEBAPP_URL}/booking/${payment.booking.uid}?payment=success`,
      303
    );
  } catch (error) {
    const err = getErrorFromUnknown(error);

    logger.error("Payment success callback failed", {
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
