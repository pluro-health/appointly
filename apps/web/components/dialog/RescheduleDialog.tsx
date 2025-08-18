import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";

import { Dialog } from "@calcom/features/components/controlled-dialog";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { DialogContent, DialogFooter, DialogClose } from "@calcom/ui/components/dialog";
import { Label, TextArea } from "@calcom/ui/components/form";
import { Icon } from "@calcom/ui/components/icon";
import { showToast } from "@calcom/ui/components/toast";

interface IRescheduleDialog {
  isOpenDialog: boolean;
  setIsOpenDialog: Dispatch<SetStateAction<boolean>>;
  bookingUId: string;
}

export const RescheduleDialog = (props: IRescheduleDialog) => {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const { isOpenDialog, setIsOpenDialog, bookingUId: bookingId } = props;
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [showPolicy, setShowPolicy] = useState(false);

  const { mutate: rescheduleApi, isPending } = trpc.viewer.bookings.requestReschedule.useMutation({
    async onSuccess() {
      showToast(t("reschedule_request_sent"), "success");
      setIsOpenDialog(false);
      await utils.viewer.bookings.invalidate();
    },
    onError() {
      showToast(t("unexpected_error_try_again"), "error");
    },
  });

  return (
    <Dialog open={isOpenDialog} onOpenChange={setIsOpenDialog}>
      <DialogContent enableOverflow>
        {/* Header */}
        <div className="border-b border-slate-200 px-7 pb-4 pt-7">
          <div className="flex items-center gap-3">
            <div className="bg-subtle flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full">
              <Icon name="calendar" className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">
              {t("send_reschedule_request")}
            </h2>
          </div>
        </div>

        <div className="space-y-7 p-7">
          {/* Collapsible: Reschedule & Refund Policy */}
          <div className="rounded-xl border border-slate-200 bg-white/95">
            <button
              type="button"
              onClick={() => setShowPolicy((s) => !s)}
              className="flex w-full items-center justify-between gap-3 rounded-t-xl px-4 py-3 text-left hover:bg-slate-50"
              aria-expanded={showPolicy}
              aria-controls="appointly-reschedule-policy">
              <div className="flex items-center gap-2">
                <Icon name="shield-check" className="h-5 w-5 text-slate-700" />
                <span className="text-sm font-medium text-slate-800">Reschedule & Refund Policy</span>
              </div>
              <Icon name={showPolicy ? "chevron-up" : "chevron-down"} className="h-5 w-5 text-slate-600" />
            </button>

            {showPolicy && (
              <div
                id="appointly-reschedule-policy"
                className="space-y-3 border-t border-slate-200 px-4 py-4 text-sm text-slate-700">
                <ul className="list-disc space-y-2 pl-5">
                  <li>The current booking will be cancelled.</li>
                  <li>
                    An email with a reschedule link will be sent to select a new time (subject to
                    availability). Rescheduling must be completed via the emailed link.
                  </li>
                  <li>A full refund will be issued to the original payment method.</li>
                  <li>Refunds are typically processed within 5–7 working days.</li>
                </ul>
                <p className="text-[12px] text-slate-500">
                  Note: The new slot is confirmed only after the reschedule is completed using the emailed
                  link.
                </p>
              </div>
            )}
          </div>

          {/* Optional reason */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="reschedule-reason" className="font-medium text-gray-800">
              {t("reason_for_reschedule_request")}
              <span className="text-subtle font-normal"> (Optional)</span>
            </Label>
            <TextArea
              id="reschedule-reason"
              data-testid="reschedule_reason"
              name={t("reason_for_reschedule")}
              value={rescheduleReason}
              onChange={(e) => setRescheduleReason(e.target.value)}
              placeholder="Please provide a reason for rescheduling..."
              rows={3}
              className="mb-5 sm:mb-6"
            />
          </div>
        </div>

        <DialogFooter className="flex justify-center gap-3 rounded-b-2xl border-t border-slate-200 bg-slate-50 px-7 py-4">
          <DialogClose color="secondary" onClick={() => setIsOpenDialog(false)}>
            {t("cancel")}
          </DialogClose>
          <Button
            color="primary"
            data-testid="send_request"
            disabled={isPending}
            className="flex h-10 min-w-[160px] items-center justify-center rounded-md text-sm font-medium"
            onClick={() => {
              rescheduleApi({
                bookingId,
                rescheduleReason,
              });
            }}>
            {t("send_reschedule_request")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
