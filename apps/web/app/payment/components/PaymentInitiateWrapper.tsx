"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@calcom/ui/components/button";
import { showToast } from "@calcom/ui/components/toast";

interface PaymentInitiateWrapperProps {
  bookingId: number;
  bookingUid: string;
  eventType: {
    title: string;
    consultationPrice: number;
    paymentCurrency: string;
    description?: string | null;
  };
  bookingData: {
    startTime: string;
    endTime: string;
    duration: number;
  };
  center?: {
    name: string;
    address?: string;
  } | null;
  doctor?: {
    name: string;
    email: string;
  } | null;
}

export const PaymentInitiateWrapper: React.FC<PaymentInitiateWrapperProps> = ({
  bookingId,
  bookingUid,
  eventType,
  bookingData,
  center,
  doctor,
}) => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleInitiatePayment = async () => {
    setIsLoading(true);
    console.log("🚀 Initiating payment for existing booking:", bookingId);
    console.log("📋 Payment details:", {
      bookingId,
      bookingUid,
      amount: eventType.consultationPrice,
      currency: eventType.paymentCurrency,
    });

    try {
      // Call the payment initiation API
      console.log("📡 Calling payment initiation API...");
      const response = await fetch("/api/payments/initiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ bookingId }),
      });

      console.log("📨 Payment initiation response status:", response.status);
      console.log("📨 Response headers:", {
        contentType: response.headers.get("content-type"),
        contentLength: response.headers.get("content-length"),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Payment initiation failed:", {
          status: response.status,
          statusText: response.statusText,
          errorText: errorText,
        });
        throw new Error(`Payment initiation failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log("✅ Payment initiation successful:", {
        success: result.success,
        hasPaymentUrl: !!result.paymentUrl,
        hasTransactionId: !!result.transactionId,
        hasAccessKey: !!result.accessKey,
        message: result.message,
      });

      if (result.success && result.paymentUrl) {
        console.log("🔄 Redirecting to Easebuzz payment page:", result.paymentUrl);

        // Store transaction details for potential debugging
        if (typeof window !== "undefined") {
          sessionStorage.setItem(
            "easebuzz_payment_details",
            JSON.stringify({
              bookingId,
              bookingUid,
              transactionId: result.transactionId,
              accessKey: result.accessKey,
              paymentUrl: result.paymentUrl,
              timestamp: new Date().toISOString(),
            })
          );
        }

        // Direct redirect to Easebuzz payment page (official flow)
        console.log("🌐 Opening Easebuzz payment page...");
        window.location.href = result.paymentUrl;
      } else {
        console.error("❌ Invalid response from payment API:", result);
        throw new Error(result.message || "No payment URL received from server");
      }
    } catch (error) {
      console.error("💥 Payment initiation error:", {
        error: error instanceof Error ? error.message : error,
        bookingId,
        timestamp: new Date().toISOString(),
      });

      setIsLoading(false);
      showToast(error instanceof Error ? error.message : "Payment initiation failed", "error");
    }
  };

  const handleCancel = () => {
    console.log("❌ User cancelled payment initiation");
    router.push(`/booking/${bookingUid}`);
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow-lg">
      <div className="mb-6">
        <h2 className="mb-2 text-xl font-semibold text-gray-900">Complete Payment</h2>
        <p className="text-gray-600">Please complete your payment to confirm your appointment.</p>
      </div>

      {/* Booking Details */}
      <div className="mb-6 border-b border-gray-200 pb-4">
        <h3 className="mb-3 font-medium text-gray-900">Appointment Details</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Service:</span>
            <span className="font-medium">{eventType.title}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Duration:</span>
            <span>{bookingData.duration} minutes</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Date & Time:</span>
            <span>{new Date(bookingData.startTime).toLocaleString()}</span>
          </div>
          {doctor && (
            <div className="flex justify-between">
              <span className="text-gray-600">Doctor:</span>
              <span>{doctor.name}</span>
            </div>
          )}
          {center && (
            <div className="flex justify-between">
              <span className="text-gray-600">Center:</span>
              <span>{center.name}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-600">Booking ID:</span>
            <span className="font-mono text-xs">{bookingUid}</span>
          </div>
        </div>
      </div>

      {/* Payment Details */}
      <div className="mb-6 border-b border-gray-200 pb-4">
        <h3 className="mb-3 font-medium text-gray-900">Payment Details</h3>
        <div className="flex items-center justify-between">
          <span className="text-lg font-semibold text-gray-900">Total Amount:</span>
          <span className="text-2xl font-bold text-green-600">
            {eventType.paymentCurrency} {eventType.consultationPrice}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button
          type="button"
          color="secondary"
          onClick={handleCancel}
          disabled={isLoading}
          className="flex-1">
          Cancel
        </Button>
        <Button
          type="button"
          color="primary"
          onClick={handleInitiatePayment}
          loading={isLoading}
          className="flex-1">
          {isLoading ? "Redirecting to Payment..." : "Pay Now"}
        </Button>
      </div>

      {/* Payment Security Note */}
      <div className="mt-4 text-center text-xs text-gray-500">
        🔒 Your payment is secured by Easebuzz SSL encryption
      </div>

      {/* Debug Info in Development */}
      {process.env.NODE_ENV === "development" && (
        <div className="mt-4 rounded bg-gray-100 p-3 text-xs">
          <strong>Debug Info:</strong>
          <div>Booking ID: {bookingId}</div>
          <div>Booking UID: {bookingUid}</div>
          <div>
            Amount: {eventType.paymentCurrency} {eventType.consultationPrice}
          </div>
          <div>Environment: {process.env.NODE_ENV}</div>
        </div>
      )}
    </div>
  );
};
