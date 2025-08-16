import { Booking, EasebuzzPayment } from "@prisma/client";

import { BookingStatus } from "@calcom/prisma/client";

import { AppointlyRefundStatus } from "./appointly-refund-service";

/**
 * Check if an action (reschedule/cancel) is allowed based on 24-hour rule
 * @param appointmentStartTime - The appointment start time
 * @returns boolean - True if action is allowed (24+ hours before appointment)
 */
export function isActionAllowedBeforeAppointment(appointmentStartTime: Date): boolean {
  const now = new Date();
  const timeDifference = appointmentStartTime.getTime() - now.getTime();
  const hoursUntilAppointment = timeDifference / (1000 * 60 * 60);

  return hoursUntilAppointment >= 24;
}

/**
 * Check if a booking is eligible for rescheduling
 * @param booking - The booking to check
 * @returns Object with eligibility status and reason
 */
export function canRescheduleBooking(booking: Booking): {
  canReschedule: boolean;
  reason?: string;
} {
  // Must be confirmed and not cancelled
  if (booking.status === BookingStatus.CANCELLED) {
    return { canReschedule: false, reason: "Booking is already cancelled" };
  }

  if (booking.status !== BookingStatus.ACCEPTED) {
    return { canReschedule: false, reason: "Booking is not confirmed" };
  }

  // Check if within 24-hour limit
  if (!isActionAllowedBeforeAppointment(booking.startTime)) {
    return { canReschedule: false, reason: "Cannot reschedule within 24 hours of appointment" };
  }

  // Check reschedule count limit (only once allowed)
  if (((booking as any).appointlyRescheduleCount || 0) >= 1) {
    return { canReschedule: false, reason: "Maximum reschedule limit reached (1 reschedule allowed)" };
  }

  return { canReschedule: true };
}

/**
 * Check if a booking is eligible for cancellation with refund
 * @param booking - The booking to check
 * @returns Object with eligibility status, refund details, and reason
 */
export function canCancelBookingWithRefund(booking: Booking): {
  canCancel: boolean;
  isRefundEligible: boolean;
  refundPercentage: number;
  reason?: string;
} {
  // Must be confirmed and not cancelled
  if (booking.status === BookingStatus.CANCELLED) {
    return {
      canCancel: false,
      isRefundEligible: false,
      refundPercentage: 0,
      reason: "Booking is already cancelled",
    };
  }

  if (booking.status !== BookingStatus.ACCEPTED) {
    return {
      canCancel: false,
      isRefundEligible: false,
      refundPercentage: 0,
      reason: "Booking is not confirmed",
    };
  }

  // Check if booking is paid
  if (!booking.paid) {
    return {
      canCancel: true,
      isRefundEligible: false,
      refundPercentage: 0,
      reason: "No payment to refund",
    };
  }

  // Check if within 24-hour limit for refund eligibility
  const isWithin24Hours = isActionAllowedBeforeAppointment(booking.startTime);

  if (isWithin24Hours) {
    // 24+ hours before: eligible for refund based on CANCELLATION_REFUND_PERCENTAGE
    const refundPercentage = parseInt(process.env.CANCELLATION_REFUND_PERCENTAGE || "80");
    return {
      canCancel: true,
      isRefundEligible: true,
      refundPercentage,
    };
  } else {
    // Within 24 hours: can cancel but no refund
    return {
      canCancel: true,
      isRefundEligible: false,
      refundPercentage: 0,
      reason: "No refund available within 24 hours of appointment",
    };
  }
}

/**
 * Calculate refund amount based on booking and refund percentage
 * @param booking - The booking with payment information
 * @param refundPercentage - Percentage to refund (0-100)
 * @returns Refund amount in decimal
 */
export function calculateRefundAmount(
  booking: Booking & { easebuzzPayment?: EasebuzzPayment | null },
  refundPercentage: number
): number {
  if (!booking.easebuzzPayment || refundPercentage <= 0) {
    return 0;
  }

  const paymentAmount = parseFloat(booking.easebuzzPayment.amount.toString());
  return (paymentAmount * refundPercentage) / 100;
}

/**
 * Check if user has permission to modify the booking
 * @param booking - The booking to check
 * @param userId - User trying to modify the booking
 * @param userEmail - Email of the user trying to modify
 * @returns Object with permission status and role
 */
export function hasBookingModifyPermission(
  booking: Booking & {
    attendees?: Array<{ email: string }>;
    user?: { id: number; email: string } | null;
  },
  userId?: number,
  userEmail?: string
): {
  hasPermission: boolean;
  role: "host" | "attendee" | "unauthorized";
  reason?: string;
} {
  // Check if user is the host/owner
  if (booking.userId && userId && booking.userId === userId) {
    return { hasPermission: true, role: "host" };
  }

  // Check if user is an attendee
  if (userEmail && booking.attendees) {
    const isAttendee = booking.attendees.some(
      (attendee) => attendee.email.toLowerCase() === userEmail.toLowerCase()
    );
    if (isAttendee) {
      return { hasPermission: true, role: "attendee" };
    }
  }

  return {
    hasPermission: false,
    role: "unauthorized",
    reason: "User is not authorized to modify this booking",
  };
}

/**
 * Get cancellation rules for event owner
 * Event owners can always cancel with full refund regardless of timing
 */
export function getEventOwnerCancellationRules(): {
  canCancel: boolean;
  isRefundEligible: boolean;
  refundPercentage: number;
  reason?: string;
} {
  return {
    canCancel: true,
    isRefundEligible: true,
    refundPercentage: 100, // Full refund for event owner cancellations
  };
}

/**
 * Check if a booking has an active payment that can be refunded
 * @param booking - Booking with payment information
 * @returns Boolean indicating if payment is refundable
 */
export function hasRefundablePayment(
  booking: Booking & { easebuzzPayment?: EasebuzzPayment | null }
): boolean {
  return !!(
    booking.paid &&
    booking.easebuzzPayment &&
    booking.easebuzzPayment.status === "SUCCESS" &&
    (booking as any).appointlyRefundStatus !== AppointlyRefundStatus.PROCESSED
  );
}

/**
 * Validate if a new time slot is valid for rescheduling
 * @param newStartTime - New appointment start time
 * @param newEndTime - New appointment end time
 * @returns Object with validation status and reason
 */
export function validateRescheduleTimeSlot(
  newStartTime: Date,
  newEndTime: Date
): {
  isValid: boolean;
  reason?: string;
} {
  const now = new Date();

  // Check if new time is in the future
  if (newStartTime <= now) {
    return { isValid: false, reason: "New appointment time must be in the future" };
  }

  // Check if end time is after start time
  if (newEndTime <= newStartTime) {
    return { isValid: false, reason: "End time must be after start time" };
  }

  // Check if new appointment is at least 24 hours from now
  if (!isActionAllowedBeforeAppointment(newStartTime)) {
    return { isValid: false, reason: "New appointment must be at least 24 hours from now" };
  }

  return { isValid: true };
}
