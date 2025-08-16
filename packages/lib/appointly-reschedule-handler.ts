import { BookingStatus } from "@prisma/client";
import { Request } from "express";

import logger from "@calcom/lib/logger";
import { prisma } from "@calcom/prisma";

import {
  canRescheduleBooking,
  hasBookingModifyPermission,
  validateRescheduleTimeSlot,
} from "./appointly-business-rules";

interface AppointlyRescheduleRequest {
  bookingId: number;
  newStartTime: Date;
  newEndTime: Date;
  timeZone: string;
  reason?: string;
  userId?: number;
  userEmail?: string;
}

interface AppointlyRescheduleResponse {
  success: boolean;
  message: string;
  bookingUid?: string;
  newBookingId?: number;
  errors?: string[];
}

/**
 * Service for handling appointly-specific reschedule logic
 * Extends existing Cal.com reschedule functionality with business rules
 */
export class AppointlyRescheduleHandler {
  private log = logger.getSubLogger({ prefix: ["AppointlyRescheduleHandler"] });

  /**
   * Validate and process a reschedule request with appointly business rules
   */
  async handleReschedule(request: AppointlyRescheduleRequest): Promise<AppointlyRescheduleResponse> {
    const { bookingId, newStartTime, newEndTime, timeZone, reason, userId, userEmail } = request;

    this.log.info("Processing reschedule request", {
      bookingId,
      newStartTime,
      newEndTime,
      timeZone,
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

      // 3. Validate reschedule eligibility based on appointly business rules
      const eligibilityCheck = canRescheduleBooking(booking);
      if (!eligibilityCheck.canReschedule) {
        return {
          success: false,
          message: eligibilityCheck.reason || "Reschedule not allowed",
          errors: ["RESCHEDULE_NOT_ALLOWED"],
        };
      }

      // 4. Validate new time slot
      const timeSlotValidation = validateRescheduleTimeSlot(newStartTime, newEndTime);
      if (!timeSlotValidation.isValid) {
        return {
          success: false,
          message: timeSlotValidation.reason || "Invalid time slot",
          errors: ["INVALID_TIME_SLOT"],
        };
      }

      // 5. Check if new time slot is available (delegate to existing Cal.com logic)
      const availabilityCheck = await this.checkSlotAvailability(
        booking.eventTypeId!,
        newStartTime,
        newEndTime,
        timeZone
      );

      if (!availabilityCheck.isAvailable) {
        return {
          success: false,
          message: "The selected time slot is not available",
          errors: ["SLOT_NOT_AVAILABLE"],
        };
      }

      // 6. Create reschedule by calling existing Cal.com reschedule service
      const rescheduleResult = await this.performReschedule(booking, {
        newStartTime,
        newEndTime,
        timeZone,
        reason,
        userRole: permissionCheck.role,
      });

      if (!rescheduleResult.success) {
        return {
          success: false,
          message: rescheduleResult.message || "Reschedule failed",
          errors: ["RESCHEDULE_FAILED"],
        };
      }

      // 7. Update appointly-specific fields
      const bookingWithAppointlyFields = booking as any;
      await this.updateAppointlyFields(booking.id, {
        newStartTime,
        originalBookingDate: bookingWithAppointlyFields.appointlyOriginalBookingDate || booking.startTime,
        rescheduleCount: (bookingWithAppointlyFields.appointlyRescheduleCount || 0) + 1,
        reason,
      });

      this.log.info("Reschedule completed successfully", {
        bookingId: booking.id,
        newBookingId: rescheduleResult.newBookingId,
        rescheduleCount: (bookingWithAppointlyFields.appointlyRescheduleCount || 0) + 1,
      });

      return {
        success: true,
        message: "Booking rescheduled successfully",
        bookingUid: rescheduleResult.bookingUid,
        newBookingId: rescheduleResult.newBookingId,
      };
    } catch (error: any) {
      this.log.error("Reschedule failed", {
        bookingId,
        error: error?.message || error,
      });

      return {
        success: false,
        message: "An error occurred while rescheduling the booking",
        errors: ["INTERNAL_ERROR"],
      };
    }
  }

  /**
   * Check if a time slot is available for the given event type
   * This integrates with existing Cal.com availability checking
   */
  private async checkSlotAvailability(
    eventTypeId: number,
    startTime: Date,
    endTime: Date,
    timeZone: string
  ): Promise<{ isAvailable: boolean; reason?: string }> {
    // TODO: Integrate with existing Cal.com availability checking logic
    // For now, we'll do a basic check for existing bookings

    try {
      const conflictingBooking = await prisma.booking.findFirst({
        where: {
          eventTypeId,
          status: {
            not: BookingStatus.CANCELLED,
          },
          OR: [
            {
              startTime: {
                gte: startTime,
                lt: endTime,
              },
            },
            {
              endTime: {
                gt: startTime,
                lte: endTime,
              },
            },
            {
              AND: [{ startTime: { lte: startTime } }, { endTime: { gte: endTime } }],
            },
          ],
        },
      });

      if (conflictingBooking) {
        return {
          isAvailable: false,
          reason: "Time slot conflicts with an existing booking",
        };
      }

      return { isAvailable: true };
    } catch (error) {
      this.log.error("Error checking slot availability", { error, eventTypeId, startTime, endTime });
      return {
        isAvailable: false,
        reason: "Unable to verify slot availability",
      };
    }
  }

  /**
   * Perform the actual reschedule using existing Cal.com logic
   * This would integrate with the existing reschedule service
   */
  private async performReschedule(
    booking: any,
    options: {
      newStartTime: Date;
      newEndTime: Date;
      timeZone: string;
      reason?: string;
      userRole: "host" | "attendee" | "unauthorized";
    }
  ): Promise<{ success: boolean; message?: string; bookingUid?: string; newBookingId?: number }> {
    try {
      // TODO: Integrate with existing Cal.com reschedule service
      // For now, we'll do a basic update

      const updatedBooking = await prisma.booking.update({
        where: { id: booking.id },
        data: {
          startTime: options.newStartTime,
          endTime: options.newEndTime,
          rescheduled: true,
          // Set rescheduledBy based on user role
          rescheduledBy: options.userRole === "host" ? booking.user?.email : booking.attendees[0]?.email,
        },
      });

      this.log.info("Booking updated successfully", {
        bookingId: booking.id,
        newStartTime: options.newStartTime,
        newEndTime: options.newEndTime,
      });

      return {
        success: true,
        bookingUid: updatedBooking.uid,
        newBookingId: updatedBooking.id,
      };
    } catch (error: any) {
      this.log.error("Failed to perform reschedule", {
        bookingId: booking.id,
        error: error?.message || error,
      });

      return {
        success: false,
        message: "Failed to update booking",
      };
    }
  }

  /**
   * Update appointly-specific fields after successful reschedule
   */
  private async updateAppointlyFields(
    bookingId: number,
    updates: {
      newStartTime: Date;
      originalBookingDate: Date;
      rescheduleCount: number;
      reason?: string;
    }
  ): Promise<void> {
    try {
      await (prisma as any).booking.update({
        where: { id: bookingId },
        data: {
          appointlyRescheduleCount: updates.rescheduleCount,
          appointlyOriginalBookingDate: updates.originalBookingDate,
          // Store reschedule reason if provided
          ...(updates.reason && { description: updates.reason }),
        },
      });

      this.log.info("Updated appointly fields", {
        bookingId,
        rescheduleCount: updates.rescheduleCount,
        originalBookingDate: updates.originalBookingDate,
      });
    } catch (error: any) {
      this.log.error("Failed to update appointly fields", {
        bookingId,
        error: error?.message || error,
      });
      // Don't throw here as the main reschedule was successful
    }
  }

  /**
   * Get reschedule information for a booking
   */
  async getRescheduleInfo(bookingId: number): Promise<{
    canReschedule: boolean;
    reason?: string;
    rescheduleCount: number;
    maxReschedules: number;
    originalBookingDate?: Date;
    timeUntilAppointment?: number; // hours
  }> {
    try {
      const booking = await prisma.booking.findUniqueOrThrow({
        where: { id: bookingId },
      });

      const bookingWithAppointlyFields = booking as any;
      const eligibilityCheck = canRescheduleBooking(booking);
      const now = new Date();
      const timeUntilAppointment = (booking.startTime.getTime() - now.getTime()) / (1000 * 60 * 60);

      return {
        canReschedule: eligibilityCheck.canReschedule,
        reason: eligibilityCheck.reason,
        rescheduleCount: bookingWithAppointlyFields.appointlyRescheduleCount || 0,
        maxReschedules: 1, // As per business rules
        originalBookingDate: bookingWithAppointlyFields.appointlyOriginalBookingDate || undefined,
        timeUntilAppointment: Math.max(0, timeUntilAppointment),
      };
    } catch (error: any) {
      this.log.error("Failed to get reschedule info", {
        bookingId,
        error: error?.message || error,
      });

      return {
        canReschedule: false,
        reason: "Unable to retrieve booking information",
        rescheduleCount: 0,
        maxReschedules: 1,
      };
    }
  }
}

// Export singleton instance
export const appointlyRescheduleHandler = new AppointlyRescheduleHandler();
