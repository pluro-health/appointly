import { useState, useMemo } from "react";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { BookingStatus } from "@calcom/prisma/client";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { Icon } from "@calcom/ui/components/icon";

import AppointlyCancellationCountdown from "./AppointlyCancellationCountdown";
import AppointlyCancellationModal from "./AppointlyCancellationModal";

interface CancelButtonProps {
  booking: {
    id: number;
    uid: string;
    title: string;
    startTime: string;
    endTime: string;
    status: BookingStatus;
  };
  cancellationInfo: {
    canCancel: boolean;
    reason?: string;
    refundEligible: boolean;
    refundPercentage: number;
    refundAmount?: number;
    timeUntilAppointment?: number;
  } | null;
  userEmail?: string;
  isLoading?: boolean;
  inline?: boolean; // NEW: Enables inline "link style" display
}

export default function AppointlyCancelButton({
  booking,
  cancellationInfo,
  userEmail,
  isLoading = false,
  inline = false,
}: CancelButtonProps) {
  const { t } = useLocale();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isWithin24Hours, setIsWithin24Hours] = useState(false);

  const formatCurrency = (amount?: number) => `₹${(amount || 0).toFixed(2)}`;

  const buttonText = useMemo(() => {
    if (!cancellationInfo) return "";
    if (cancellationInfo.refundEligible && !isWithin24Hours) {
      return `Cancel with ${cancellationInfo.refundPercentage}% refund (${formatCurrency(
        cancellationInfo.refundAmount
      )})`;
    }
    return "Cancel (no refund available)";
  }, [cancellationInfo, isWithin24Hours]);

  const buttonShape: "button" | "icon" | "fab" = "button";
  const buttonColor = isWithin24Hours ? "destructive" : "secondary";

  // =========================
  //  Inline Mode Rendering
  // =========================
  if (inline) {
    if (isLoading || !cancellationInfo) {
      return <span className="animate-pulse text-gray-500">{t("loading")}</span>;
    }

    if (!cancellationInfo.canCancel) {
      return (
        <span className="cursor-not-allowed text-gray-400" title={cancellationInfo.reason}>
          {t("cancel")}
        </span>
      );
    }

    return (
      <>
        <button
          onClick={() => setIsModalOpen(true)}
          className="text-default underline"
          data-testid="cancel-link">
          {t("cancel")}
        </button>

        {/* Inline Modal */}
        <AppointlyCancellationModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          booking={booking}
          cancellationInfo={cancellationInfo}
          isWithin24Hours={isWithin24Hours}
          userEmail={userEmail}
        />
      </>
    );
  }

  // =========================
  //  Default Block Mode Rendering
  // =========================
  if (isLoading || !cancellationInfo) {
    return (
      <div className="flex animate-pulse items-center gap-2 text-sm text-gray-500">
        <Icon name="loader" className="h-4 w-4 animate-spin" aria-label="Loading" />
        <span>Loading cancellation info...</span>
      </div>
    );
  }

  if (!cancellationInfo.canCancel) {
    return (
      <div className="text-sm text-gray-500" title={cancellationInfo.reason}>
        {cancellationInfo.reason || "Cancellation not available"}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Countdown Timer */}
      <AppointlyCancellationCountdown
        startTime={booking.startTime}
        onTimeUpdate={(info) => setIsWithin24Hours(info.isWithin24Hours)}
      />

      {/* Cancel Button & Refund Badge */}
      <div className="flex flex-col gap-2">
        <Button
          variant={buttonShape}
          color={buttonColor}
          onClick={() => setIsModalOpen(true)}
          className="w-full transition-all duration-150"
          size="sm"
          aria-label={buttonText}>
          <Icon name="x" className="mr-2 h-4 w-4" />
          {buttonText}
        </Button>

        {cancellationInfo.refundEligible && (
          <div className="flex justify-center">
            <Badge
              variant={isWithin24Hours ? "error" : "success"}
              className="text-xs transition-all duration-150">
              {isWithin24Hours
                ? "No refund within 24 hours"
                : `${cancellationInfo.refundPercentage}% refund available`}
            </Badge>
          </div>
        )}
      </div>

      {/* Cancellation Modal */}
      <AppointlyCancellationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        booking={booking}
        cancellationInfo={cancellationInfo}
        isWithin24Hours={isWithin24Hours}
        userEmail={userEmail}
      />
    </div>
  );
}
