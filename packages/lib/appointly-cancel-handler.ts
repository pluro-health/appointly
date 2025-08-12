import { BookingStatus } from "@prisma/client";

import handleCancelBooking from "@calcom/features/bookings/lib/handleCancelBooking";
import logger from "@calcom/lib/logger";
import { prisma } from "@calcom/prisma";
import { bookingCancelInput } from "@calcom/prisma/zod-utils";

import {
  canCancelBookingWithRefund,
  hasBookingModifyPermission,
  getEventOwnerCancellationRules,
  hasRefundablePayment,
} from "./appointly-business-rules";
import { appointlyRefundService, AppointlyRefundStatus } from "./appointly-refund-service";

interface AppointlyCancelRequest {
  bookingId: number;
  reason: string;
  cancelledBy: "BOOKER" | "EVENT_OWNER";
  userId?: number;
  userEmail?: string;
}

interface AppointlyCancelResponse {
  success: boolean;
  message: string;
  refundInfo?: {
    refundEligible: boolean;
    refundAmount: number;
    refundPercentage: number;
    refundStatus: AppointlyRefundStatus;
    refundId?: string;
  };
  errors?: string[];
}

/**
 * Service for handling appointly-specific cancellation logic
 * Extends existing Cal.com cancellation functionality with refund processing
 */
export class AppointlyCancelHandler {
  private log = logger.getSubLogger({ prefix: ["AppointlyCancelHandler"] });

  /**
   * Validate and process a cancellation request with appointly business rules
   */
  async handleCancellation(request: AppointlyCancelRequest): Promise<AppointlyCancelResponse> {
    const { bookingId, reason, cancelledBy, userId, userEmail } = request;

    this.log.info("Processing cancellation request", {
      bookingId,
      reason,
      cancelledBy,
      userId,
    });

    try {
      // 1. Get the booking with all necessary relations
      const booking = await prisma.booking.findUniqueOrThrow({
        where: { id: bookingId },
        include: {
          attendees: true,
          user: true,
          eventType: true,
          easebuzzPayment: true,
        },
      });

      // 2. Check user permissions
      const permissionCheck = hasBookingModifyPermission(booking, userId, userEmail);
      if (!permissionCheck.hasPermission) {
        return {
          success: false,
          message: permissionCheck.reason || "Permission denied",
          errors: ["PERMISSION_DENIED"],
        };
      }

      // 3. Determine cancellation rules based on who is cancelling
      let cancellationRules;
      if (cancelledBy === "EVENT_OWNER" && permissionCheck.role === "host") {
        // Event owner cancellation - full refund regardless of timing
        cancellationRules = getEventOwnerCancellationRules();
      } else {
        // Booker cancellation - apply 24-hour rule
        cancellationRules = canCancelBookingWithRefund(booking);
      }

      if (!cancellationRules.canCancel) {
        return {
          success: false,
          message: cancellationRules.reason || "Cancellation not allowed",
          errors: ["CANCELLATION_NOT_ALLOWED"],
        };
      }

      // 4. Process refund if eligible
      let refundInfo: AppointlyCancelResponse["refundInfo"];

      if (cancellationRules.isRefundEligible && hasRefundablePayment(booking)) {
        this.log.info("Processing refund for cancellation", {
          bookingId,
          refundPercentage: cancellationRules.refundPercentage,
          cancelledBy,
        });

        try {
          const refundResult = await appointlyRefundService.processRefund({
            bookingId,
            refundPercentage: cancellationRules.refundPercentage,
            reason: `Cancellation by ${cancelledBy.toLowerCase()}: ${reason}`,
            cancelledBy: cancelledBy,
            isEventOwnerCancellation: cancelledBy === "EVENT_OWNER",
          });

          refundInfo = {
            refundEligible: true,
            refundAmount: refundResult.refundAmount,
            refundPercentage: cancellationRules.refundPercentage,
            refundStatus: refundResult.success
              ? AppointlyRefundStatus.PROCESSED
              : AppointlyRefundStatus.REJECTED,
            refundId: refundResult.refundId,
          };

          if (!refundResult.success) {
            this.log.warn("Refund processing failed but continuing with cancellation", {
              bookingId,
              refundMessage: refundResult.message,
            });
          }
        } catch (refundError: any) {
          this.log.error("Refund processing error", {
            bookingId,
            error: refundError?.message || refundError,
          });

          refundInfo = {
            refundEligible: true,
            refundAmount: 0,
            refundPercentage: cancellationRules.refundPercentage,
            refundStatus: AppointlyRefundStatus.REJECTED,
          };
        }
      } else {
        // No refund - update status to NOT_APPLICABLE
        refundInfo = {
          refundEligible: false,
          refundAmount: 0,
          refundPercentage: 0,
          refundStatus: AppointlyRefundStatus.NOT_APPLICABLE,
        };
      }

      // 5. Perform the actual cancellation using existing Cal.com logic
      const cancellationResult = await this.performCancellation(booking, {
        reason,
        cancelledBy,
        userRole: permissionCheck.role,
      });

      if (!cancellationResult.success) {
        return {
          success: false,
          message: cancellationResult.message || "Cancellation failed",
          errors: ["CANCELLATION_FAILED"],
        };
      }

      // 6. Update appointly-specific fields
      await this.updateAppointlyFields(booking.id, {
        reason,
        refundStatus: refundInfo.refundStatus,
        refundAmount: refundInfo.refundAmount,
      });

      this.log.info("Cancellation completed successfully", {
        bookingId: booking.id,
        cancelledBy,
        refundEligible: refundInfo.refundEligible,
        refundAmount: refundInfo.refundAmount,
      });

      return {
        success: true,
        message: "Booking cancelled successfully",
        refundInfo,
      };
    } catch (error: any) {
      this.log.error("Cancellation failed", {
        bookingId,
        error: error?.message || error,
      });

      return {
        success: false,
        message: "An error occurred while cancelling the booking",
        errors: ["INTERNAL_ERROR"],
      };
    }
  }

  /**
   * Perform the actual cancellation using existing Cal.com logic
   * This integrates with the existing cancellation service to properly handle:
   * - Calendar event deletion (Google Calendar, etc.)
   * - Video meeting deletion
   * - Email notifications
   * - Workflow reminders cancellation
   */
  private async performCancellation(
    booking: any,
    options: {
      reason: string;
      cancelledBy: "BOOKER" | "EVENT_OWNER";
      userRole: "host" | "attendee" | "unauthorized";
    }
  ): Promise<{ success: boolean; message?: string }> {
    try {
      this.log.info("Integrating with Cal.com cancellation service", {
        bookingId: booking.id,
        cancelledBy: options.cancelledBy,
        reason: options.reason,
      });

      const cancelledByEmail =
        options.userRole === "host" ? booking.user?.email : booking.attendees[0]?.email;

      // Prepare cancellation data for Cal.com's handleCancelBooking
      const bookingData = bookingCancelInput.parse({
        id: booking.id,
        cancellationReason: options.reason,
        cancelledBy: cancelledByEmail,
      });

      // Get userId for the cancellation - use the event owner's ID
      const userId = options.userRole === "host" ? booking.user?.id : undefined;

      // Call Cal.com's standard cancellation handler
      const result = await handleCancelBooking({
        userId,
        bookingData,
      });

      if (result.success) {
        this.log.info("Cal.com cancellation completed successfully", {
          bookingId: booking.id,
          bookingUid: result.bookingUid,
          message: result.message,
        });
        return { success: true, message: result.message };
      } else {
        this.log.error("Cal.com cancellation failed", {
          bookingId: booking.id,
          message: result.message,
        });
        return { success: false, message: result.message };
      }
    } catch (error: any) {
      this.log.error("Failed to perform cancellation", {
        bookingId: booking.id,
        error: error?.message || error,
      });

      return {
        success: false,
        message: "Failed to cancel booking: " + (error?.message || "Unknown error"),
      };
    }
  }

  /**
   * Update appointly-specific fields after successful cancellation
   */
  private async updateAppointlyFields(
    bookingId: number,
    updates: {
      reason: string;
      refundStatus: AppointlyRefundStatus;
      refundAmount: number;
    }
  ): Promise<void> {
    try {
      await (prisma as any).booking.update({
        where: { id: bookingId },
        data: {
          appointlyCancellationReason: updates.reason,
          appointlyRefundStatus: updates.refundStatus,
          appointlyRefundAmount: updates.refundAmount,
        },
      });

      this.log.info("Updated appointly cancellation fields", {
        bookingId,
        refundStatus: updates.refundStatus,
        refundAmount: updates.refundAmount,
      });
    } catch (error: any) {
      this.log.error("Failed to update appointly cancellation fields", {
        bookingId,
        error: error?.message || error,
      });
      // Don't throw here as the main cancellation was successful
    }
  }

  /**
   * Get cancellation information for a booking
   */
  async getCancellationInfo(
    bookingId: number,
    userRole: "host" | "attendee" = "attendee"
  ): Promise<{
    canCancel: boolean;
    reason?: string;
    refundEligible: boolean;
    refundPercentage: number;
    refundAmount?: number;
    timeUntilAppointment?: number; // hours
  }> {
    try {
      const booking = await prisma.booking.findUniqueOrThrow({
        where: { id: bookingId },
        include: {
          easebuzzPayment: true,
        },
      });

      // Determine cancellation rules based on user role
      let cancellationRules;
      if (userRole === "host") {
        cancellationRules = getEventOwnerCancellationRules();
      } else {
        cancellationRules = canCancelBookingWithRefund(booking);
      }

      const now = new Date();
      const timeUntilAppointment = (booking.startTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      // Calculate potential refund amount
      let refundAmount = 0;
      if (cancellationRules.isRefundEligible && booking.easebuzzPayment) {
        const paymentAmount = parseFloat(booking.easebuzzPayment.amount.toString());
        refundAmount = (paymentAmount * cancellationRules.refundPercentage) / 100;
      }

      return {
        canCancel: cancellationRules.canCancel,
        reason: cancellationRules.reason,
        refundEligible: cancellationRules.isRefundEligible,
        refundPercentage: cancellationRules.refundPercentage,
        refundAmount,
        timeUntilAppointment: Math.max(0, timeUntilAppointment),
      };
    } catch (error: any) {
      this.log.error("Failed to get cancellation info", {
        bookingId,
        error: error?.message || error,
      });

      return {
        canCancel: false,
        reason: "Unable to retrieve booking information",
        refundEligible: false,
        refundPercentage: 0,
      };
    }
  }

  /**
   * Get refund status for a cancelled booking
   */
  async getRefundStatus(bookingId: number): Promise<{
    hasRefund: boolean;
    refundStatus?: AppointlyRefundStatus;
    refundAmount?: number;
    refundDetails?: any;
  }> {
    try {
      const refundStatus = await appointlyRefundService.getRefundStatus(bookingId);

      if (!refundStatus.hasRefund) {
        return { hasRefund: false };
      }

      const latestRefund = refundStatus.refunds[0]; // Most recent refund

      return {
        hasRefund: true,
        refundStatus: latestRefund.refundStatus,
        refundAmount: latestRefund.refundAmount,
        refundDetails: {
          refundPercentage: latestRefund.refundPercentage,
          refundInitiatedAt: latestRefund.refundInitiatedAt,
          refundCompletedAt: latestRefund.refundCompletedAt,
          easebuzzRefundId: latestRefund.easebuzzRefundId,
        },
      };
    } catch (error: any) {
      this.log.error("Failed to get refund status", {
        bookingId,
        error: error?.message || error,
      });

      return { hasRefund: false };
    }
  }
}

// Export singleton instance
export const appointlyCancelHandler = new AppointlyCancelHandler();
