import { NextRequest, NextResponse } from "next/server";

import { validateEasebuzzWebhook } from "@calcom/lib/appointly-webhook-security";
import logger from "@calcom/lib/logger";

// Function to get refund service only when credentials are available
async function getRefundService() {
  try {
    const { appointlyRefundService } = await import("@calcom/lib/appointly-refund-service");
    return appointlyRefundService;
  } catch (error) {
    // Service will be null if credentials are not configured
    logger.warn("Easebuzz refund service not available - credentials not configured");
    return null;
  }
}

/**
 * POST /api/webhooks/easebuzz/refund
 * Handle Easebuzz refund status webhook
 */
export async function POST(request: NextRequest) {
  const log = logger.getSubLogger({ prefix: ["Webhook", "Easebuzz", "Refund"] });

  try {
    // Get client information
    const clientIP =
      request.headers.get("x-forwarded-for")?.split(",")[0] || request.headers.get("x-real-ip") || "unknown";
    const userAgent = request.headers.get("user-agent");

    log.info("Received Easebuzz refund webhook", {
      clientIP,
      userAgent,
    });

    // Parse webhook payload
    const webhookData = await request.json();

    log.info("Webhook payload received", {
      txnid: webhookData.txnid,
      refund_id: webhookData.refund_id,
      status: webhookData.status,
      amount: webhookData.amount,
    });

    // Security validation
    const securityCheck = validateEasebuzzWebhook(clientIP, userAgent, webhookData);
    if (!securityCheck.isValid) {
      log.warn("Webhook security validation failed", {
        reason: securityCheck.reason,
        clientIP,
        userAgent,
      });

      // Return 200 to prevent retries for security failures
      return NextResponse.json({ message: "Received" }, { status: 200 });
    }

    // Validate required fields
    if (!webhookData.txnid || !webhookData.refund_id || !webhookData.status) {
      log.warn("Invalid webhook payload - missing required fields", webhookData);
      return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
    }

    // Get refund service
    const refundService = await getRefundService();

    // Check if refund service is available
    if (!refundService) {
      log.warn("Easebuzz refund service not available - credentials not configured");
      return NextResponse.json(
        {
          success: true,
          message: "Webhook received but refund service not configured",
          note: "Set EASEBUZZ_MERCHANT_KEY and EASEBUZZ_SALT environment variables to enable refund processing",
        },
        { status: 200 }
      );
    }

    // Process the webhook
    await refundService.handleRefundWebhook(webhookData);

    log.info("Refund webhook processed successfully", {
      txnid: webhookData.txnid,
      refund_id: webhookData.refund_id,
      status: webhookData.status,
    });

    return NextResponse.json({
      success: true,
      message: "Webhook processed successfully",
    });
  } catch (error: any) {
    log.error("Refund webhook processing failed", {
      error: error?.message || error,
    });

    // Return success to prevent webhook retries for processing errors
    // But log the error for investigation
    return NextResponse.json({ success: true, message: "Received" }, { status: 200 });
  }
}

/**
 * GET /api/webhooks/easebuzz/refund
 * Webhook verification endpoint for testing
 */
export async function GET() {
  return NextResponse.json({
    message: "Easebuzz refund webhook endpoint is active",
    timestamp: new Date().toISOString(),
  });
}
