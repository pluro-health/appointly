"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@calcom/ui/components/button";
import { Icon } from "@calcom/ui/components/icon";

export default function PaymentFailedPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const reason = searchParams?.get("reason");
  const eventTypeUrl = searchParams?.get("eventTypeUrl");
  const startTime = searchParams?.get("startTime");
  const endTime = searchParams?.get("endTime");

  const handleBookAgain = () => {
    if (eventTypeUrl && startTime && endTime) {
      // Redirect to the event type with the same time slot
      const url = `${eventTypeUrl}?startTime=${encodeURIComponent(startTime)}&endTime=${encodeURIComponent(
        endTime
      )}`;
      router.push(url);
    } else if (eventTypeUrl) {
      // Fallback to just the event type page
      router.push(eventTypeUrl);
    } else {
      // Fallback to home page
      router.push("/");
    }
  };

  const getFailureMessage = (reason: string | null | undefined) => {
    if (!reason) return "Payment was not completed successfully.";

    const reasonLower = reason.toLowerCase();
    if (reasonLower.includes("cancelled")) {
      return "Payment was cancelled. You can try booking again.";
    } else if (reasonLower.includes("failed")) {
      return "Payment failed. Please try again with a different payment method.";
    } else if (reasonLower.includes("timeout")) {
      return "Payment timed out. Please try again.";
    } else if (reasonLower.includes("insufficient")) {
      return "Insufficient funds. Please try with a different payment method.";
    }

    return `Payment failed: ${reason}`;
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          {/* Payment Failed Icon */}
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <Icon name="x" className="h-8 w-8 text-red-600" />
          </div>

          <h2 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">Payment Failed</h2>

          <p className="mt-2 text-sm text-gray-600">{getFailureMessage(reason)}</p>
        </div>

        <div className="mt-8 space-y-4">
          {/* Book Again Button */}
          <Button
            onClick={handleBookAgain}
            className="w-full justify-center bg-blue-600 hover:bg-blue-700 focus:ring-blue-500"
            size="lg">
            <Icon name="calendar" className="mr-2 h-4 w-4" />
            Book Appointment Again
          </Button>

          {/* Alternative Actions */}
          <div className="text-center">
            <p className="text-sm text-gray-500">
              Or{" "}
              <button
                onClick={() => router.push("/")}
                className="font-medium text-blue-600 hover:text-blue-500">
                go back to home
              </button>
            </p>
          </div>
        </div>

        {/* Additional Help */}
        <div className="mt-8 rounded-lg bg-gray-50 p-4">
          <h3 className="text-sm font-medium text-gray-900">Need Help?</h3>
          <p className="mt-1 text-sm text-gray-600">
            If you continue to experience issues, please contact support or try using a different payment
            method.
          </p>
        </div>
      </div>
    </div>
  );
}
