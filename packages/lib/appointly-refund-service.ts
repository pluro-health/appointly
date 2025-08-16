import { Booking, EasebuzzPayment } from "@prisma/client";

import logger from "@calcom/lib/logger";
import { prisma } from "@calcom/prisma";

import { calculateRefundAmount } from "./appointly-business-rules";

// Define AppointlyRefundStatus enum locally until Prisma types are regenerated
export enum AppointlyRefundStatus {
  PENDING = "PENDING",
  PROCESSED = "PROCESSED",
  REJECTED = "REJECTED",
  NOT_APPLICABLE = "NOT_APPLICABLE",
}

interface RefundRequest {
  bookingId: number;
  refundPercentage: number;
  reason?: string;
  cancelledBy: string;
  isEventOwnerCancellation?: boolean;
}

interface EasebuzzRefundApiResponse {
  status: number;
  data: {
    status: string;
    txnid: string;
    refund_id?: string;
    amount: string;
    message?: string;
    // Additional fields from actual Easebuzz response
    easebuzz_id?: string;
    refund_amount?: number;
    merchant_refund_id?: string;
  };
}

/**
 * Service class for handling Easebuzz refunds
 */
export class AppointlyRefundService {
  private easebuzzBaseUrl: string;
  private easebuzzKey: string;
  private easebuzzSalt: string;

  // Use separate base URL for refund API if provided
  private easebuzzRefundBaseUrl: string;

  constructor() {
    this.easebuzzBaseUrl = process.env.EASEBUZZ_BASE_URL || "https://test.easebuzz.in";
    this.easebuzzKey = process.env.EASEBUZZ_MERCHANT_KEY || "";
    this.easebuzzSalt = process.env.EASEBUZZ_SALT || "";

    // Use separate base URL for refund API if provided
    this.easebuzzRefundBaseUrl = process.env.EASEBUZZ_REFUND_BASE_URL || this.easebuzzBaseUrl;

    if (!this.easebuzzKey || !this.easebuzzSalt) {
      throw new Error("Easebuzz credentials not configured");
    }
  }

  /**
   * Generate hash for Easebuzz refund API
   */
  private generateRefundHash(key: string, txnid: string, amount: string, salt: string): string {
    const crypto = require("crypto");
    const hashString = `${key}|${txnid}|${amount}|${salt}`;
    return crypto.createHash("sha512").update(hashString).digest("hex");
  }

  /**
   * Call Easebuzz refund API
   */
  private async callEasebuzzRefundApi(
    easebuzzTxnId: string,
    refundAmount: number
  ): Promise<EasebuzzRefundApiResponse> {
    const amount = refundAmount.toFixed(2);

    // Generate unique merchant refund ID for auditing
    const merchantRefundId = `REF_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    // Get the easepayid from the payment response
    const booking = await prisma.booking.findFirst({
      where: {
        easebuzzPayment: {
          easebuzzTxnId: easebuzzTxnId,
        },
      },
      include: {
        easebuzzPayment: true,
      },
    });

    if (!booking?.easebuzzPayment) {
      throw new Error(`No payment found for transaction ID: ${easebuzzTxnId}`);
    }

    // Use the easepayid field directly, fallback to JSON extraction if not set
    let easepayid = booking.easebuzzPayment.easepayid;

    if (!easepayid) {
      // Extract easepayid from the easebuzzResponse JSON as fallback
      const easebuzzResponse = booking.easebuzzPayment.easebuzzResponse as any;
      easepayid = easebuzzResponse?.easepayid || easebuzzResponse?.easebuzz_id;
    }

    if (!easepayid) {
      throw new Error(`No easepayid found for transaction: ${easebuzzTxnId}`);
    }

    // Generate hash for the new payload structure
    const crypto = require("crypto");
    const hashString = `${this.easebuzzKey}|${merchantRefundId}|${easepayid}|${amount}|${this.easebuzzSalt}`;
    const hash = crypto.createHash("sha512").update(hashString).digest("hex");

    const refundData = {
      key: this.easebuzzKey,
      merchant_refund_id: merchantRefundId,
      easebuzz_id: easepayid,
      refund_amount: amount,
      hash: hash,
    };

    const log = logger.getSubLogger({ prefix: ["AppointlyRefundService", "callEasebuzzRefundApi"] });

    // Use the correct refund base URL and endpoint from documentation
    const refundUrl = `${this.easebuzzRefundBaseUrl}/transaction/v2/refund`;

    log.info("Calling Easebuzz Refund API", {
      txnid: easebuzzTxnId,
      easepayid: easepayid,
      merchantRefundId: merchantRefundId,
      amount: amount,
      hash: hash.substring(0, 20) + "...",
      refundBaseUrl: this.easebuzzRefundBaseUrl,
      refundUrl: refundUrl,
    });

    const response = await fetch(refundUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(refundData),
    });

    const responseText = await response.text();

    log.info("Easebuzz refund API response", {
      status: response.status,
      statusText: response.statusText,
      responseLength: responseText.length,
      responsePreview: responseText.substring(0, 200) + "...",
    });

    // Parse the response
    if (!response.ok) {
      throw new Error(
        `Easebuzz refund API failed: ${response.status} ${response.statusText} - ${responseText}`
      );
    }

    try {
      const responseData = JSON.parse(responseText);

      // Map the response to our expected format based on actual Easebuzz response
      const mappedResponse: EasebuzzRefundApiResponse = {
        status: response.status,
        data: {
          status: responseData.status ? "success" : "failed",
          txnid: easebuzzTxnId,
          refund_id: responseData.refund_id || responseData.data?.refund_id || merchantRefundId,
          amount: amount,
          message: responseData.message || responseData.data?.message || "Refund processed",
          // Additional fields from actual response
          easebuzz_id: responseData.easebuzz_id,
          refund_amount: responseData.refund_amount,
          merchant_refund_id: responseData.merchant_refund_id,
        },
      };

      log.info("Easebuzz refund API successful", {
        originalResponse: responseData,
        mappedResponse: mappedResponse,
        merchantRefundId: merchantRefundId,
        easepayid: easepayid,
      });

      return mappedResponse;
    } catch (parseError) {
      log.error("Failed to parse JSON response from Easebuzz", {
        responseText: responseText,
        error: parseError,
      });
      throw new Error(`Invalid JSON response from Easebuzz: ${responseText}`);
    }
  }

  /**
   * Process refund for a booking
   */
  async processRefund(request: RefundRequest): Promise<{
    success: boolean;
    refundId?: string;
    refundAmount: number;
    message?: string;
  }> {
    const log = logger.getSubLogger({ prefix: ["AppointlyRefundService", "processRefund"] });

    try {
      // Get booking with payment information
      const booking = (await prisma.booking.findUniqueOrThrow({
        where: { id: request.bookingId },
        include: {
          easebuzzPayment: true,
        },
      })) as any;

      if (!booking.easebuzzPayment) {
        throw new Error("No Easebuzz payment found for this booking");
      }

      if (booking.easebuzzPayment.status !== "SUCCESS") {
        throw new Error("Payment is not in SUCCESS status, cannot refund");
      }

      // Check if refund already processed
      const existingRefunds = await (prisma as any).appointlyBookingRefunds.findMany({
        where: { bookingId: request.bookingId },
      });

      const existingRefund = existingRefunds.find(
        (refund: any) => refund.refundStatus === AppointlyRefundStatus.PROCESSED
      );

      if (existingRefund) {
        throw new Error("Refund already processed for this booking");
      }

      // Calculate refund amount
      const refundAmount = calculateRefundAmount(booking, request.refundPercentage);

      if (refundAmount <= 0) {
        throw new Error("Invalid refund amount calculated");
      }

      log.info("Processing refund", {
        bookingId: request.bookingId,
        easebuzzTxnId: booking.easebuzzPayment.easebuzzTxnId,
        refundAmount,
        refundPercentage: request.refundPercentage,
      });

      // Create refund record in pending status
      const refundRecord = await (prisma as any).appointlyBookingRefunds.create({
        data: {
          bookingId: booking.id,
          easebuzzPaymentId: booking.easebuzzPayment.id,
          refundAmount,
          refundPercentage: request.refundPercentage,
          refundStatus: AppointlyRefundStatus.PENDING,
        },
      });

      // Call Easebuzz refund API
      const easebuzzResponse = await this.callEasebuzzRefundApi(
        booking.easebuzzPayment.easebuzzTxnId!,
        refundAmount
      );

      log.info("Easebuzz refund API response", {
        bookingId: request.bookingId,
        response: easebuzzResponse,
      });

      // Update refund record based on API response
      if (easebuzzResponse.data.status === "success") {
        await (prisma as any).appointlyBookingRefunds.update({
          where: { id: refundRecord.id },
          data: {
            refundStatus: AppointlyRefundStatus.PROCESSED,
            easebuzzRefundId: easebuzzResponse.data.refund_id,
            refundCompletedAt: new Date(),
          },
        });

        // Update booking refund status
        await (prisma as any).booking.update({
          where: { id: booking.id },
          data: {
            appointlyRefundStatus: AppointlyRefundStatus.PROCESSED,
            appointlyRefundAmount: refundAmount,
            appointlyCancellationReason: request.reason,
          },
        });

        return {
          success: true,
          refundId: easebuzzResponse.data.refund_id,
          refundAmount,
          message: easebuzzResponse.data.message || "Refund processed successfully",
        };
      } else {
        // Update refund record to REJECTED status
        await (prisma as any).appointlyBookingRefunds.update({
          where: { id: refundRecord.id },
          data: {
            refundStatus: AppointlyRefundStatus.REJECTED,
          },
        });

        // Update booking refund status
        await (prisma as any).booking.update({
          where: { id: booking.id },
          data: {
            appointlyRefundStatus: AppointlyRefundStatus.REJECTED,
            appointlyCancellationReason: request.reason,
          },
        });

        return {
          success: false,
          refundAmount,
          message: easebuzzResponse.data.message || "Refund failed",
        };
      }
    } catch (error: any) {
      log.error("Refund processing failed", {
        bookingId: request.bookingId,
        error: error?.message || error,
      });

      // Update refund record to REJECTED if it exists
      try {
        await (prisma as any).appointlyBookingRefunds.updateMany({
          where: {
            bookingId: request.bookingId,
            refundStatus: AppointlyRefundStatus.PENDING,
          },
          data: {
            refundStatus: AppointlyRefundStatus.REJECTED,
          },
        });

        await (prisma as any).booking.update({
          where: { id: request.bookingId },
          data: {
            appointlyRefundStatus: AppointlyRefundStatus.REJECTED,
            appointlyCancellationReason: request.reason,
          },
        });
      } catch (updateError: any) {
        log.error("Failed to update refund status after error", {
          bookingId: request.bookingId,
          updateError: updateError?.message || updateError,
        });
      }

      throw error;
    }
  }

  /**
   * Get refund status for a booking
   */
  async getRefundStatus(bookingId: number): Promise<{
    hasRefund: boolean;
    refunds: Array<{
      id: number;
      refundAmount: number;
      refundPercentage: number;
      refundStatus: AppointlyRefundStatus;
      easebuzzRefundId?: string;
      refundInitiatedAt: Date;
      refundCompletedAt?: Date;
    }>;
  }> {
    const refunds = await (prisma as any).appointlyBookingRefunds.findMany({
      where: { bookingId },
      orderBy: { createdAt: "desc" },
    });

    return {
      hasRefund: refunds.length > 0,
      refunds: refunds.map((refund: any) => ({
        id: refund.id,
        refundAmount: parseFloat(refund.refundAmount.toString()),
        refundPercentage: refund.refundPercentage,
        refundStatus: refund.refundStatus,
        easebuzzRefundId: refund.easebuzzRefundId || undefined,
        refundInitiatedAt: refund.refundInitiatedAt,
        refundCompletedAt: refund.refundCompletedAt || undefined,
      })),
    };
  }

  /**
   * Handle Easebuzz refund webhook
   */
  async handleRefundWebhook(webhookData: any): Promise<void> {
    const log = logger.getSubLogger({ prefix: ["AppointlyRefundService", "handleRefundWebhook"] });

    try {
      // Verify webhook signature (implement based on Easebuzz documentation)
      const isValidSignature = this.verifyWebhookSignature(webhookData);

      if (!isValidSignature) {
        throw new Error("Invalid webhook signature");
      }

      const { txnid, refund_id, status, amount } = webhookData;

      // Find the refund record
      const refund = await (prisma as any).appointlyBookingRefunds.findFirst({
        where: {
          easebuzzRefundId: refund_id,
        },
        include: {
          booking: true,
        },
      });

      if (!refund) {
        log.warn("Refund record not found for webhook", { refund_id, txnid });
        return;
      }

      // Update refund status based on webhook
      if (status === "success") {
        await (prisma as any).appointlyBookingRefunds.update({
          where: { id: refund.id },
          data: {
            refundStatus: AppointlyRefundStatus.PROCESSED,
            refundCompletedAt: new Date(),
          },
        });

        await (prisma as any).booking.update({
          where: { id: refund.bookingId },
          data: {
            appointlyRefundStatus: AppointlyRefundStatus.PROCESSED,
          },
        });

        log.info("Refund confirmed via webhook", {
          bookingId: refund.bookingId,
          refundId: refund_id,
          amount,
        });
      } else {
        await (prisma as any).appointlyBookingRefunds.update({
          where: { id: refund.id },
          data: {
            refundStatus: AppointlyRefundStatus.REJECTED,
          },
        });

        await (prisma as any).booking.update({
          where: { id: refund.bookingId },
          data: {
            appointlyRefundStatus: AppointlyRefundStatus.REJECTED,
          },
        });

        log.warn("Refund failed via webhook", {
          bookingId: refund.bookingId,
          refundId: refund_id,
          status,
        });
      }
    } catch (error: any) {
      log.error("Webhook processing failed", {
        error: error?.message || error,
        webhookData,
      });
      throw error;
    }
  }

  /**
   * Verify webhook authenticity using Easebuzz's method
   * Easebuzz doesn't provide webhook secrets, but we can verify using:
   * 1. IP whitelisting (recommended)
   * 2. Payload validation
   * 3. Hash verification using merchant credentials
   */
  private verifyWebhookSignature(webhookData: any, request?: Request): boolean {
    try {
      // Method 1: Verify essential fields are present
      if (!webhookData.txnid || !webhookData.status || !webhookData.amount) {
        logger.warn("Invalid webhook: missing required fields");
        return false;
      }

      // Method 2: Verify the transaction exists in our system
      // This will be done in the main webhook handler

      // Method 3: Optional - verify hash if Easebuzz provides it
      if (webhookData.hash && this.easebuzzKey && this.easebuzzSalt) {
        const expectedHash = this.generateRefundHash(
          this.easebuzzKey,
          webhookData.txnid,
          webhookData.amount,
          this.easebuzzSalt
        );

        if (webhookData.hash !== expectedHash) {
          logger.warn("Webhook hash verification failed", {
            txnid: webhookData.txnid,
            expected: expectedHash,
            received: webhookData.hash,
          });
          return false;
        }
      }

      return true;
    } catch (error: any) {
      logger.error("Webhook verification error", {
        error: error?.message || error,
        webhookData,
      });
      return false;
    }
  }
}

// Export singleton instance
export const appointlyRefundService = new AppointlyRefundService();
