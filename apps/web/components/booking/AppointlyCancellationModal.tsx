import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatToLocalizedDate, formatToLocalizedTime } from "@calcom/lib/dayjs";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { BookingStatus } from "@calcom/prisma/client";
import { Badge } from "@calcom/ui/components/badge";
import { Button } from "@calcom/ui/components/button";
import { Dialog, DialogContent, DialogFooter } from "@calcom/ui/components/dialog";
import { Select, Label, Checkbox } from "@calcom/ui/components/form";
import { Icon } from "@calcom/ui/components/icon";
import { showToast } from "@calcom/ui/components/toast";

interface CancellationModalProps {
  isOpen: boolean;
  onClose: () => void;
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
    refundEligible: boolean;
    refundPercentage: number;
    refundAmount?: number;
  };
  isWithin24Hours: boolean;
  userEmail?: string;
}

const CANCELLATION_REASONS = [
  { value: "personal_emergency", label: "Personal emergency" },
  { value: "schedule_conflict", label: "Schedule conflict" },
  { value: "no_longer_needed", label: "No longer needed" },
  { value: "other", label: "Other" },
];

export default function AppointlyCancellationModal({
  isOpen,
  onClose,
  booking,
  cancellationInfo,
  isWithin24Hours,
  userEmail,
}: CancellationModalProps) {
  const { t } = useLocale();
  const router = useRouter();

  const [selectedReason, setSelectedReason] = useState<string>("");
  const [confirmed, setConfirmed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);

  const formatCurrency = (amount?: number) => `₹${(amount ?? 0).toFixed(2)}`;

  const getRefundMessage = () => {
    if (!cancellationInfo.refundEligible) {
      return isWithin24Hours
        ? "You are cancelling within 24 hours — no refund will be provided."
        : "This booking will be cancelled without a refund.";
    }
    return `You will receive a ${cancellationInfo.refundPercentage}% refund (${formatCurrency(
      cancellationInfo.refundAmount
    )}).`;
  };

  const handleCancel = async () => {
    if (!selectedReason) {
      showToast("Please select a cancellation reason.", "error");
      return;
    }
    if (!confirmed) {
      showToast("Please confirm you understand the refund policy.", "error");
      return;
    }

    setIsLoading(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (userEmail) headers["x-user-email"] = userEmail;

      const response = await fetch(`/api/appointly/cancel/${booking.id}`, {
        method: "POST",
        headers,
        body: JSON.stringify({ reason: selectedReason, cancelledBy: "BOOKER" }),
      });
      const result = await response.json();

      if (!response.ok) throw new Error(result.error || "Failed to cancel booking.");

      const refundMsg = result.refundInfo?.refundEligible
        ? `Refund of ${formatCurrency(result.refundInfo.refundAmount)} will be processed in 5–7 days.`
        : "";

      showToast(`Booking cancelled successfully. ${refundMsg}`, "success");
      onClose();
      router.refresh();
    } catch (error: any) {
      console.error("Cancellation error:", error);
      showToast(error.message || "Failed to cancel booking. Please try again.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const isCancelDisabled = !selectedReason || !confirmed || isLoading;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent enableOverflow>
        <div className="border-b border-slate-200 px-7 pb-4 pt-7">
          <div className="flex items-center gap-3">
            <div className="bg-subtle flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full">
              <Icon name="circle-x" className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">{t("cancel_booking")}</h2>
          </div>
        </div>

        <div className="space-y-7 p-7">
          {/* Booking summary */}
          <div className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-white/95 p-5 shadow-sm">
            <h4 className="text-lg font-medium text-slate-800">{booking.title}</h4>
            <div className="flex flex-col gap-0.5 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <Icon name="calendar" className="h-4 w-4" />
                <span>{formatToLocalizedDate(new Date(booking.startTime), "en")}</span>
              </div>
              <div className="flex items-center gap-2">
                <Icon name="clock" className="h-4 w-4" />
                <span>
                  {formatToLocalizedTime({ date: new Date(booking.startTime), locale: "en" })} –{" "}
                  {formatToLocalizedTime({ date: new Date(booking.endTime), locale: "en" })}
                </span>
              </div>
            </div>
          </div>

          {/* Refund summary */}
          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/80 p-4">
            <Icon name="info" className="mt-0.5 h-5 w-5 text-blue-500" />
            <div>
              <p className="text-sm text-blue-800">{getRefundMessage()}</p>
              {isWithin24Hours && (
                <Badge variant="orange" className="mt-2 text-xs">
                  Within 24-hour cancellation period
                </Badge>
              )}
            </div>
          </div>

          {/* NEW: Cancellation & Refund Policy (collapsible) */}
          <div className="rounded-xl border border-slate-200 bg-white/95">
            <button
              type="button"
              onClick={() => setShowPolicy((s) => !s)}
              className="flex w-full items-center justify-between gap-3 rounded-t-xl px-4 py-3 text-left hover:bg-slate-50"
              aria-expanded={showPolicy}
              aria-controls="appointly-policy">
              <div className="flex items-center gap-2">
                <Icon name="shield-check" className="h-5 w-5 text-slate-700" />
                <span className="text-sm font-medium text-slate-800">Cancellation & Refund Policy</span>
              </div>
              <Icon name={showPolicy ? "chevron-up" : "chevron-down"} className="h-5 w-5 text-slate-600" />
            </button>

            {showPolicy && (
              <div
                id="appointly-policy"
                className="space-y-3 border-t border-slate-200 px-4 py-4 text-sm text-slate-700">
                <ul className="list-disc space-y-2 pl-5">
                  <li>
                    Cancellations made 24 hours or more before the appointment:{" "}
                    {cancellationInfo.refundPercentage}% refund.
                  </li>
                  <li>Cancellations made less than 24 hours before the appointment: No refund.</li>
                </ul>

                {/* Contextual highlight for this booking */}
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="flex items-start gap-2">
                    <Icon name="info" className="mt-0.5 h-4 w-4" />
                    <p className="text-[13px] leading-relaxed">
                      For this booking:{" "}
                      {isWithin24Hours ? (
                        <>
                          you are within 24 hours of the start time, so{" "}
                          <span className="font-semibold">no refund</span> applies on cancellation.
                        </>
                      ) : cancellationInfo.refundEligible ? (
                        <>
                          you are outside 24 hours; an{" "}
                          <span className="font-semibold">{cancellationInfo.refundPercentage}%</span> refund
                          applies (estimated {formatCurrency(cancellationInfo.refundAmount)}).
                        </>
                      ) : (
                        <>refunds are not applicable.</>
                      )}
                    </p>
                  </div>
                </div>

                <p className="text-[12px] text-slate-500">
                  Note: Refunds, where applicable, are typically processed back to the original payment method
                  in 5–7 business days.
                </p>
              </div>
            )}
          </div>

          {/* Reason selector */}
          <div className="flex flex-col gap-1">
            <Label htmlFor="reason-select" className="font-medium text-gray-800">
              Cancellation Reason <span className="text-red-400">*</span>
            </Label>
            <Select
              id="reason-select"
              options={CANCELLATION_REASONS}
              value={CANCELLATION_REASONS.find((r) => r.value === selectedReason) || null}
              onChange={(option) => setSelectedReason(option?.value || "")}
              placeholder="Choose a reason…"
              className="w-full rounded-md border transition-all duration-150 focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {/* Acknowledgement */}
          <div className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-100 p-3">
            <Checkbox
              id="confirm-cancel"
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(Boolean(checked))}
            />
            <Label htmlFor="confirm-cancel" className="cursor-pointer text-sm text-slate-700">
              I understand the refund policy and wish to cancel this appointment.
            </Label>
          </div>
        </div>

        <DialogFooter className="flex justify-center gap-3 rounded-b-2xl border-t border-slate-200 bg-slate-50 px-7 py-4">
          <Button
            color="secondary"
            onClick={onClose}
            disabled={isLoading}
            className="flex h-10 min-w-[130px] items-center justify-center rounded-md text-sm font-medium">
            Keep Booking
          </Button>
          <Button
            onClick={handleCancel}
            loading={isLoading}
            disabled={isCancelDisabled}
            className="flex h-10 min-w-[130px] items-center justify-center rounded-md text-sm font-medium"
            style={
              isCancelDisabled ? { opacity: 0.65, cursor: "not-allowed", filter: "grayscale(0.2)" } : {}
            }>
            Cancel Booking
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
