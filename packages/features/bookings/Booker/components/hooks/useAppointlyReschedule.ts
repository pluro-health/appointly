import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { showToast } from "@calcom/ui/components/toast";

interface AppointlyRescheduleRequest {
  bookingId: number;
  newStartTime: string;
  newEndTime: string;
  timeZone: string;
  reason?: string;
  attendeeEmail?: string; // Add attendee email for unauthenticated reschedules
}

interface AppointlyRescheduleResponse {
  success: boolean;
  message: string;
  bookingUid?: string;
  newBookingId?: number;
  errors?: string[];
}

export const useAppointlyReschedule = () => {
  const { t } = useLocale();
  const router = useRouter();

  const appointlyRescheduleMutation = useMutation({
    mutationFn: async (request: AppointlyRescheduleRequest): Promise<AppointlyRescheduleResponse> => {
      console.log("🚀 Appointly Reschedule: Making API call to custom endpoint", {
        bookingId: request.bookingId,
        newStartTime: request.newStartTime,
        newEndTime: request.newEndTime,
      });

      const response = await fetch(`/api/appointly/reschedule/${request.bookingId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          newStartTime: request.newStartTime,
          newEndTime: request.newEndTime,
          timeZone: request.timeZone,
          reason: request.reason,
          attendeeEmail: request.attendeeEmail, // Pass attendee email for authentication
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Reschedule failed");
      }

      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        showToast(t("booking_rescheduled_successfully"), "success");
        // Redirect to the updated booking page
        if (data.bookingUid) {
          router.push(`/booking/${data.bookingUid}`);
        } else {
          router.push("/bookings/upcoming");
        }
      } else {
        showToast(data.message || t("reschedule_failed"), "error");
      }
    },
    onError: (error: Error) => {
      showToast(error.message || t("unexpected_error_try_again"), "error");
    },
  });

  return {
    appointlyReschedule: appointlyRescheduleMutation.mutate,
    isRescheduling: appointlyRescheduleMutation.isPending,
    error: appointlyRescheduleMutation.error,
  };
};
