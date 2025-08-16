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
        <div className="border-b border-slate-200 px-7 pb-4 pt-7">
          <div className="flex items-center gap-3">
            <div className="bg-subtle flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full">
              <Icon name="circle-x" className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">
              {t("send_reschedule_request")}
            </h2>
          </div>
        </div>

        <div className="space-y-7 p-7">
          {/* Refund Warning */}
          <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-4 shadow-sm">
            <Icon name="triangle-alert" className="mt-0.5 h-5 w-5 text-yellow-500" />
            <div>
              <h3 className="text-sm font-medium text-yellow-800">{t("full_refund_processing")}</h3>
              <p className="mt-1 text-sm text-yellow-700">{t("reschedule_modal_description")}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cancel-reason" className="font-medium text-gray-800">
              {t("reason_for_reschedule_request")}
              <span className="text-subtle font-normal"> (Optional)</span>
            </Label>
            <TextArea
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
            color="destructive"
            data-testid="send_request"
            disabled={isPending}
            className="flex h-10 min-w-[130px] items-center justify-center rounded-md text-sm font-medium"
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
