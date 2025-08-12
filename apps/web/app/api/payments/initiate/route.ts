import { headers, cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getServerSession } from "@calcom/features/auth/lib/getServerSession";
import { EasebuzzConfigManager } from "@calcom/lib/easebuzz";
import { EasebuzzService } from "@calcom/lib/easebuzz-service";
import { HttpError } from "@calcom/lib/http-error";
import logger from "@calcom/lib/logger";
// Remove legacy handlers - using App Router directly
import { prisma } from "@calcom/prisma";

import { buildLegacyRequest } from "@lib/buildLegacyCtx";

const initiatePaymentSchema = z
  .object({
    bookingId: z.number().int().positive().optional(),
    bookingUid: z.string().optional(),
  })
  .refine((data) => data.bookingId || data.bookingUid, {
    message: "Either bookingId or bookingUid must be provided",
  });

export type InitiatePaymentRequest = z.infer<typeof initiatePaymentSchema>;

const initiatePaymentResponseSchema = z.object({
  success: z.boolean(),
  paymentUrl: z.string().url().optional(),
  transactionId: z.string().optional(),
  accessKey: z.string().optional(),
  message: z.string(),
  error: z.string().optional(),
});

export type InitiatePaymentResponse = z.infer<typeof initiatePaymentResponseSchema>;

async function handler(req: NextRequest) {
  const startTime = Date.now();
  logger.info("🚀 Payment initiation request started", {
    method: req.method,
    url: req.url,
    userAgent: req.headers.get("user-agent"),
    timestamp: new Date().toISOString(),
  });

  const session = await getServerSession({ req: buildLegacyRequest(await headers(), await cookies()) });

  const body = await req.json();
  logger.info("📋 Request body received", {
    hasBookingId: !!body.bookingId,
    bookingId: body.bookingId,
    userId: session?.user?.id || "guest",
  });

  const parseResult = initiatePaymentSchema.safeParse(body);
  if (!parseResult.success) {
    logger.error("❌ Invalid request body", {
      errors: parseResult.error.errors,
      receivedData: body,
    });
    throw new HttpError({
      statusCode: 400,
      message: "Invalid request body",
      data: { errors: parseResult.error.errors },
    });
  }

  const { bookingId, bookingUid } = parseResult.data;
  const lookupKey = bookingUid || bookingId;

  try {
    logger.info("🔍 Looking up booking details", { bookingId, bookingUid, lookupKey });

    // 1. Retrieve booking details with related data (✅ ROBUST: Support both ID and UID lookup)
    const booking = await prisma.booking.findUnique({
      where: bookingUid ? { uid: bookingUid } : { id: bookingId! },
      include: {
        user: {
          include: {
            center: true,
          },
        },
        eventType: true,
        easebuzzPayment: true,
        attendees: true,
      },
    });

    if (!booking) {
      logger.error("❌ Booking not found", { bookingId, bookingUid, lookupKey });
      throw new HttpError({ statusCode: 404, message: "Booking not found" });
    }

    logger.info("✅ Booking found", {
      bookingId: booking.id,
      bookingUid: booking.uid,
      eventTypeId: booking.eventTypeId,
      userId: booking.userId,
      hasEventType: !!booking.eventType,
      hasCenter: !!booking.user?.center,
      currentStatus: booking.status,
      paymentStatus: booking.paymentStatus,
    });

    // 2. Validate booking ownership (allow guest access without session)
    if (session?.user?.id && booking.userId !== session.user.id) {
      logger.error("❌ Access denied", {
        bookingUserId: booking.userId,
        sessionUserId: session.user.id,
      });
      throw new HttpError({ statusCode: 403, message: "Access denied to this booking" });
    }

    // 3. Check if payment is already processed
    if (booking.easebuzzPayment) {
      logger.warn("⚠️ Payment already exists", {
        bookingId,
        paymentId: booking.easebuzzPayment.id,
        paymentStatus: booking.easebuzzPayment.status,
      });
      throw new HttpError({
        statusCode: 400,
        message: "Payment already exists for this booking",
      });
    }

    // 4. Validate that payment is required
    if (!booking.eventType?.requiresPayment || !booking.eventType?.consultationPrice) {
      logger.error("❌ Payment not required", {
        requiresPayment: booking.eventType?.requiresPayment,
        consultationPrice: booking.eventType?.consultationPrice,
      });
      throw new HttpError({
        statusCode: 400,
        message: "Payment is not required for this event type",
      });
    }

    logger.info("💰 Payment details validated", {
      consultationPrice: booking.eventType.consultationPrice,
      paymentCurrency: booking.eventType.paymentCurrency,
      requiresPayment: booking.eventType.requiresPayment,
    });

    // 5. Check if Easebuzz is configured
    const configManager = new EasebuzzConfigManager();
    if (!configManager.isConfigured()) {
      logger.error("❌ Easebuzz not configured", {
        hasKey: !!configManager.getMerchantKey(),
        hasSalt: !!configManager.getSalt(),
        environment: configManager.getEnvironment(),
      });
      throw new HttpError({
        statusCode: 500,
        message: "Payment gateway is not configured",
      });
    }

    logger.info("✅ Easebuzz configuration validated", {
      environment: configManager.getEnvironment(),
      baseUrl: configManager.getBaseUrl(),
    });

    // 6. Generate unique merchant transaction ID
    const timestamp = Date.now();
    const merchantTxnId = `cal_${bookingId}_${timestamp}`;

    logger.info("🆔 Generated transaction ID", {
      merchantTxnId,
      timestamp,
      bookingId,
    });

    // 7. Create payment record in database (✅ ROBUST: Store both ID and UID)
    logger.info("💾 Creating payment record in database");
    const paymentRecord = await prisma.easebuzzPayment.create({
      data: {
        bookingId: booking.id,
        bookingUid: booking.uid, // ✅ Store UID for robust testing
        centerId: booking.user?.centerId || null,
        userId: booking.userId,
        merchantTxnId,
        amount: booking.eventType.consultationPrice || 0,
        currency: booking.eventType.paymentCurrency || "INR",
        status: "PENDING",
        easebuzzResponse: {},
      },
    });

    logger.info("✅ Payment record created", {
      paymentId: paymentRecord.id,
      merchantTxnId: paymentRecord.merchantTxnId,
      amount: paymentRecord.amount,
      currency: paymentRecord.currency,
    });

    // 8. Update booking payment status
    await prisma.booking.update({
      where: { id: booking.id },
      data: { paymentStatus: "PENDING" },
    });

    logger.info("📝 Booking payment status updated to PENDING");

    // 9. Prepare booking and center data for Easebuzz service
    // Extract phone number from booking responses or attendees
    let userPhone = "";
    let userName = "";
    let userEmail = "";

    // Extract data from booking responses first (this is where form data goes)
    if (booking.responses && typeof booking.responses === "object") {
      const responses = booking.responses as Record<string, any>;
      userPhone = responses.phone || responses.phoneNumber || responses.attendeePhoneNumber || "";
      userName = responses.name || responses.firstName || responses.fullName || "";
      userEmail = responses.email || "";
    }

    // Fallback to attendees data if not in responses
    if (!userPhone && booking.attendees && booking.attendees.length > 0) {
      userPhone = booking.attendees[0].phoneNumber || "";
    }
    if (!userName && booking.attendees && booking.attendees.length > 0) {
      userName = booking.attendees[0].name || "";
    }
    if (!userEmail && booking.attendees && booking.attendees.length > 0) {
      userEmail = booking.attendees[0].email || "";
    }

    // Final fallback to booking/user data
    if (!userName) {
      userName = booking.user?.name || "Guest User";
    }
    if (!userEmail) {
      userEmail = booking.userPrimaryEmail || booking.user?.email || "";
    }

    // Final fallback to a default phone number if still empty (required by Easebuzz)
    if (!userPhone || userPhone.length < 10) {
      userPhone = "9999999999"; // Default fallback phone number
      logger.warn("⚠️ No valid phone number found, using default", {
        bookingId,
        originalPhone: userPhone,
        defaultPhone: "9999999999",
      });
    }

    logger.info("📞 User data extracted", {
      userName: userName,
      userEmail: userEmail,
      userPhone: userPhone.substring(0, 5) + "*****", // Mask phone for privacy
      dataSource: booking.responses ? "responses" : booking.attendees?.length ? "attendees" : "user_booking",
      hasResponses: !!booking.responses,
      hasAttendees: !!(booking.attendees && booking.attendees.length > 0),
      hasUser: !!booking.user?.name,
    });

    const bookingData = {
      id: booking.id,
      uid: booking.uid,
      title: booking.title,
      startTime: booking.startTime,
      endTime: booking.endTime,
      userEmail: userEmail,
      userName: userName,
      userPhone: userPhone,
      amount: parseFloat(booking.eventType.consultationPrice?.toString() || "0"),
      currency: booking.eventType.paymentCurrency || "INR",
      description: `${booking.eventType.title} - Consultation Fee`,
    };

    const centerData = booking.user?.center
      ? {
          id: booking.user.center.id,
          name: booking.user.center.name,
          easebuzzSubMerchantId: booking.user.center.easebuzzSubMerchantId,
        }
      : null;

    logger.info("📦 Payment data prepared", {
      bookingData: {
        id: bookingData.id,
        uid: bookingData.uid,
        title: bookingData.title,
        userEmail: bookingData.userEmail,
        userName: bookingData.userName,
        amount: bookingData.amount,
        currency: bookingData.currency,
      },
      centerData: centerData
        ? {
            id: centerData.id,
            name: centerData.name,
            hasSubMerchantId: !!centerData.easebuzzSubMerchantId,
          }
        : null,
    });

    // 10. Initialize Easebuzz service and create payment
    logger.info("🔄 Initializing Easebuzz service");
    const easebuzzService = new EasebuzzService();
    const paymentResult = await easebuzzService.initiatePayment(bookingData, centerData);

    logger.info("📡 Easebuzz service response", {
      success: paymentResult.success,
      hasPaymentUrl: !!paymentResult.paymentUrl,
      hasAccessKey: !!paymentResult.accessKey,
      transactionId: paymentResult.transactionId,
      error: paymentResult.error,
      message: paymentResult.message,
    });

    if (!paymentResult.success) {
      logger.error("❌ Payment initiation failed, rolling back", {
        error: paymentResult.error,
        message: paymentResult.message,
        paymentId: paymentRecord.id,
      });

      // Rollback payment record creation
      await prisma.easebuzzPayment.delete({
        where: { id: paymentRecord.id },
      });
      await prisma.booking.update({
        where: { id: booking.id },
        data: { paymentStatus: "PENDING" },
      });

      throw new HttpError({
        statusCode: 500,
        message: paymentResult.message || "Failed to initiate payment",
      });
    }

    // 11. Update payment record with Easebuzz transaction ID
    logger.info("📝 Updating payment record with Easebuzz transaction ID");
    await prisma.easebuzzPayment.update({
      where: { id: paymentRecord.id },
      data: {
        easebuzzTxnId: paymentResult.transactionId,
        easebuzzResponse: paymentResult.response,
      },
    });

    const endTime = Date.now();
    const duration = endTime - startTime;

    logger.info(" Payment initiation completed successfully", {
      bookingId,
      transactionId: paymentResult.transactionId,
      paymentUrl: paymentResult.paymentUrl,
      accessKey: paymentResult.accessKey?.substring(0, 20) + "...",
      userId: session?.user?.id || "guest",
      duration: `${duration}ms`,
    });

    const response: InitiatePaymentResponse = {
      success: true,
      paymentUrl: paymentResult.paymentUrl!,
      transactionId: paymentResult.transactionId!,
      accessKey: paymentResult.accessKey,
      message: "Payment initiated successfully",
    };

    return NextResponse.json(response);
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;

    logger.error("💥 Payment initiation failed", {
      bookingId,
      userId: session?.user?.id || "guest",
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      duration: `${duration}ms`,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorType: typeof error,
      fullError: error,
    });

    // Log more details for debugging
    console.error("💥 === DETAILED ERROR DEBUG ===");
    console.error("Error type:", typeof error);
    console.error("Error name:", error instanceof Error ? error.name : "N/A");
    console.error("Error message:", error instanceof Error ? error.message : error);
    console.error("Error stack:", error instanceof Error ? error.stack : "N/A");
    console.error("Is HttpError:", error instanceof HttpError);
    console.error("Full error object:", error);
    console.error("💥 === END ERROR DEBUG ===");

    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError({
      statusCode: 500,
      message: `Internal server error during payment initiation: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    });
  }
}

// ✅ FIX: Direct App Router export (no legacy wrappers needed)
export const POST = handler;
