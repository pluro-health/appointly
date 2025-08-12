import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";
import { headers, cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { EasebuzzConfigManager } from "@calcom/lib/easebuzz";
import { EasebuzzService } from "@calcom/lib/easebuzz-service";
import { HttpError } from "@calcom/lib/http-error";
import logger from "@calcom/lib/logger";
import { defaultHandler } from "@calcom/lib/server/defaultHandler";
import { prisma } from "@calcom/prisma";

import { buildLegacyRequest } from "@lib/buildLegacyCtx";

const initiatePaymentSchema = z.object({
  eventTypeId: z.number().int().positive(),
  startTime: z.string(),
  endTime: z.string(),
  responses: z.record(z.any()),
  timeZone: z.string(),
  language: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export type EasebuzzInitiatePaymentRequest = z.infer<typeof initiatePaymentSchema>;

const initiatePaymentResponseSchema = z.object({
  success: z.boolean(),
  paymentUrl: z.string().url().optional(),
  transactionId: z.string().optional(),
  bookingUid: z.string().optional(),
  message: z.string(),
  error: z.string().optional(),
});

export type EasebuzzInitiatePaymentResponse = z.infer<typeof initiatePaymentResponseSchema>;

async function handler(req: NextRequest) {
  console.log("🚀 Easebuzz payment initiation started");

  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });
  console.log("Session check:", {
    hasSession: !!session,
    userId: session?.user?.id || "guest",
    isGuest: !session?.user?.id,
  });

  const body = await req.json();
  console.log("📋 Request body received:", {
    hasEventTypeId: !!body.eventTypeId,
    hasStartTime: !!body.startTime,
    hasEndTime: !!body.endTime,
    hasResponses: !!body.responses,
    timeZone: body.timeZone,
  });

  const parseResult = initiatePaymentSchema.safeParse(body);
  if (!parseResult.success) {
    console.error("Invalid request body:", parseResult.error.errors);
    throw new HttpError({
      statusCode: 400,
      message: "Invalid request body",
      data: { errors: parseResult.error.errors },
    });
  }

  const { eventTypeId, startTime, endTime, responses, timeZone, language, metadata } = parseResult.data;
  let eventType: any = null; // Declare outside try block to access in catch

  try {
    console.log("🔍 Looking up event type:", eventTypeId);

    // 1. Get event type with payment configuration
    eventType = await prisma.eventType.findUnique({
      where: { id: eventTypeId },
      include: {
        owner: {
          include: {
            center: true,
          },
        },
      },
    });

    if (!eventType) {
      console.error("Event type not found:", eventTypeId);
      throw new HttpError({ statusCode: 404, message: "Event type not found" });
    }

    console.log("Event type found:", {
      title: eventType.title,
      requiresPayment: eventType.requiresPayment,
      consultationPrice: eventType.consultationPrice,
    });

    // 2. Validate payment is required
    if (
      !eventType.requiresPayment ||
      !eventType.consultationPrice ||
      Number(eventType.consultationPrice) <= 0
    ) {
      console.error("Payment not required for this event type");
      throw new HttpError({
        statusCode: 400,
        message: "Payment is not required for this event type",
      });
    }

    // 3. Check if Easebuzz is configured
    console.log(" Checking Easebuzz configuration...");
    const configManager = new EasebuzzConfigManager();
    if (!configManager.isConfigured()) {
      console.error("Easebuzz not configured");
      throw new HttpError({
        statusCode: 500,
        message: "Payment gateway is not configured",
      });
    }

    console.log("Easebuzz configuration validated");

    // 4. Generate unique IDs
    const bookingUid = `booking_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    const merchantTxnId = `cal_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

    console.log("Generated IDs:", {
      bookingUid: bookingUid.substring(0, 20) + "...",
      merchantTxnId: merchantTxnId.substring(0, 20) + "...",
    });

    // 5. Create booking with PENDING_PAYMENT status (NOT CONFIRMED)
    console.log("Creating booking with PENDING_PAYMENT status...");
    const booking = await prisma.booking.create({
      data: {
        uid: bookingUid,
        title: eventType.title,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        status: "PENDING", // Important: NOT ACCEPTED
        paymentStatus: "PENDING", // Payment pending
        paid: false, // Not paid yet
        userPrimaryEmail: responses.email || "",
        responses: responses,
        metadata: metadata || {},
        eventType: {
          connect: { id: eventTypeId },
        },
        user: {
          connect: { id: eventType.userId || eventType.owner?.id },
        },
        attendees: {
          create: {
            email: responses.email || "",
            name: responses.name || "",
            timeZone: timeZone,
          },
        },
      },
    });

    console.log("Booking created:", {
      id: booking.id,
      uid: booking.uid,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      paid: booking.paid,
    });

    // 6. Create payment record
    console.log("💳 Creating payment record...");
    const paymentRecord = await prisma.easebuzzPayment.create({
      data: {
        bookingId: booking.id,
        centerId: eventType.owner?.centerId || null,
        userId: eventType.userId || eventType.owner?.id, // Use event owner's ID, not guest's ID
        merchantTxnId,
        amount: eventType.consultationPrice,
        currency: eventType.paymentCurrency || "INR",
        status: "PENDING",
        easebuzzResponse: {},
      },
    });

    console.log("Payment record created:", {
      id: paymentRecord.id,
      merchantTxnId: paymentRecord.merchantTxnId,
      amount: paymentRecord.amount,
      currency: paymentRecord.currency,
    });

    // 7. Prepare data for Easebuzz service
    // Ensure phone number is provided (required by Easebuzz)
    let userPhone = responses.phone || responses.phoneNumber || responses.attendeePhoneNumber || "";

    // Final fallback to a default phone number if still empty (required by Easebuzz)
    if (!userPhone || userPhone.length < 10) {
      userPhone = "9999999999"; // Default fallback phone number
      console.warn("No valid phone number provided, using default for Easebuzz");
    }

    const bookingData = {
      id: booking.id,
      uid: booking.uid,
      title: booking.title,
      startTime: booking.startTime,
      endTime: booking.endTime,
      userEmail: responses.email || "",
      userName: responses.name || "",
      userPhone: userPhone,
      amount: Number(eventType.consultationPrice),
      currency: eventType.paymentCurrency || "INR",
      description: `${eventType.title} - Consultation Fee`,
    };

    const centerData = eventType.owner?.center
      ? {
          id: eventType.owner.center.id,
          name: eventType.owner.center.name,
          easebuzzSubMerchantId: eventType.owner.center.easebuzzSubMerchantId,
        }
      : null;

    console.log("🔄 Calling Easebuzz service for payment initiation...");

    // 8. Initialize Easebuzz service and create payment
    const easebuzzService = new EasebuzzService();
    const paymentResult = await easebuzzService.initiatePayment(
      bookingData,
      centerData,
      Number(eventType.consultationPrice)
    );

    console.log("📡 Easebuzz service response:", {
      success: paymentResult.success,
      hasPaymentUrl: !!paymentResult.paymentUrl,
      transactionId: paymentResult.transactionId,
      error: paymentResult.error,
    });

    if (!paymentResult.success) {
      console.error("Payment initiation failed, rolling back...");

      // Rollback: Delete payment record and booking
      await prisma.easebuzzPayment.delete({
        where: { id: paymentRecord.id },
      });
      await prisma.booking.delete({
        where: { id: booking.id },
      });

      throw new HttpError({
        statusCode: 500,
        message: paymentResult.message || "Failed to initiate payment with Easebuzz",
      });
    }

    // 9. Update payment record with Easebuzz transaction ID
    console.log("📝 Updating payment record with Easebuzz transaction ID...");
    await prisma.easebuzzPayment.update({
      where: { id: paymentRecord.id },
      data: {
        easebuzzTxnId: paymentResult.transactionId,
        easebuzzResponse: paymentResult.response || {},
      },
    });

    console.log("Payment record updated with Easebuzz transaction ID");

    logger.info("Payment initiated successfully (Easebuzz)", {
      bookingId: booking.id,
      bookingUid: booking.uid,
      transactionId: paymentResult.transactionId,
      merchantTxnId,
      eventOwnerId: eventType.userId || eventType.owner?.id,
      guestUserId: session?.user?.id || "guest",
      amount: eventType.consultationPrice,
      paymentUrl: paymentResult.paymentUrl,
    });

    const response: EasebuzzInitiatePaymentResponse = {
      success: true,
      paymentUrl: paymentResult.paymentUrl,
      transactionId: paymentResult.transactionId,
      bookingUid: booking.uid,
      message: "Payment initiated successfully. Redirecting to Easebuzz...",
    };

    console.log(" Payment initiation completed successfully");
    return NextResponse.json(response);
  } catch (error) {
    console.error("💥 Payment initiation failed:", error);

    logger.error("Payment initiation failed (Easebuzz)", {
      eventOwnerId: eventType?.userId || eventType?.owner?.id,
      guestUserId: session?.user?.id || "guest",
      eventTypeId,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError({
      statusCode: 500,
      message: "Internal server error during payment initiation",
    });
  }
}

export const POST = defaultResponderForAppDir(handler);
