/**
 * Payment Flow Hook for Easebuzz Integration
 *
 * This hook handles the correct payment-first flow where payment is initiated
 * before booking confirmation, preventing emails being sent for unpaid bookings.
 */
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { showToast } from "@calcom/ui/components/toast";

import { useBookerStore } from "../../store";

interface PaymentInitiationData {
  eventTypeId: number;
  startTime: string;
  endTime: string;
  responses: Record<string, any>;
  timeZone: string;
  language: string;
  metadata?: Record<string, any>;
}

interface PaymentInitiationResponse {
  success: boolean;
  paymentUrl?: string;
  transactionId?: string;
  bookingUid?: string;
  message?: string;
  error?: string;
}

async function initiateEasebuzzPayment(data: PaymentInitiationData): Promise<PaymentInitiationResponse> {
  console.log("🚀 Initiating Easebuzz payment with data:", {
    eventTypeId: data.eventTypeId,
    startTime: data.startTime,
    endTime: data.endTime,
    hasResponses: !!data.responses,
    timeZone: data.timeZone,
  });

  try {
    const response = await fetch("/api/payments/easebuzz/initiate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    console.log("📡 Payment initiation API response status:", response.status);

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Payment initiation failed:", errorData);
      throw new Error(`Payment initiation failed: ${response.status} - ${errorData}`);
    }

    const result = await response.json();
    console.log("✅ Payment initiation successful:", {
      success: result.success,
      hasPaymentUrl: !!result.paymentUrl,
      transactionId: result.transactionId,
      bookingUid: result.bookingUid,
    });

    return result;
  } catch (error) {
    console.error("💥 Payment initiation error:", error);
    throw error;
  }
}

// Export both the new name and the old name for compatibility
export function useEasebuzzPaymentFlow(eventTypeLength?: number) {
  const router = useRouter();
  const { t } = useLocale();
  const timeslot = useBookerStore((state) => state.selectedTimeslot);
  const selectedDuration = useBookerStore((state) => state.selectedDuration);

  const paymentMutation = useMutation({
    mutationFn: initiateEasebuzzPayment,
    onSuccess: (data) => {
      console.log(" Payment flow started successfully:", data);

      if (data.success && data.paymentUrl) {
        console.log("🔄 Redirecting to Easebuzz payment page:", data.paymentUrl);
        // Redirect to Easebuzz payment page
        window.location.href = data.paymentUrl;
      } else {
        console.error("Payment initiation succeeded but no payment URL received");
        showToast(t("payment_initiation_failed"), "error");
      }
    },
    onError: (error) => {
      console.error("💥 Payment flow failed:", error);
      showToast(error instanceof Error ? error.message : t("payment_initiation_failed"), "error");
    },
  });

  const initiatePayment = (eventTypeId: number, bookingForm: any) => {
    if (!timeslot) {
      console.error("No timeslot selected");
      showToast(t("please_select_time_slot"), "error");
      return;
    }

    const duration = selectedDuration || eventTypeLength;
    if (!duration) {
      console.error("No duration selected or provided");
      showToast(t("please_select_duration"), "error");
      return;
    }

    console.log("🚀 Starting payment initiation process...");

    const formData = bookingForm.getValues();
    console.log("📋 Form data collected:", {
      hasResponses: !!formData.responses,
      timeZone: formData.timeZone,
      email: formData.responses?.email,
      name: formData.responses?.name,
    });

    const paymentData: PaymentInitiationData = {
      eventTypeId,
      startTime: timeslot,
      endTime: new Date(new Date(timeslot).getTime() + duration * 60 * 1000).toISOString(),
      responses: formData.responses || {},
      timeZone: formData.timeZone || "UTC",
      language: formData.language || "en",
      metadata: formData.metadata || {},
    };

    console.log("💳 Calling payment mutation with:", paymentData);
    paymentMutation.mutate(paymentData);
  };

  return {
    initiatePayment,
    isLoading: paymentMutation.isPending,
    error: paymentMutation.error,
    isSuccess: paymentMutation.isSuccess,
  };
}

// Export the hook with the old name for backward compatibility
export const usePaymentFlow = useEasebuzzPaymentFlow;
