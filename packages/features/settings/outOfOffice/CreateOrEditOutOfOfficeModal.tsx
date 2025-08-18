import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import dayjs from "@calcom/dayjs";
import { Dialog } from "@calcom/features/components/controlled-dialog";
import { useDebounce } from "@calcom/lib/hooks/useDebounce";
import { useInViewObserver } from "@calcom/lib/hooks/useInViewObserver";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import useMeQuery from "@calcom/trpc/react/hooks/useMeQuery";
import { Button } from "@calcom/ui/components/button";
import { DialogContent, DialogFooter, DialogHeader } from "@calcom/ui/components/dialog";
import { DateRangePicker, TextArea, Input } from "@calcom/ui/components/form";
import { Select } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";

export type BookingRedirectForm = {
  dateRange: { startDate: Date; endDate: Date };
  startDateOffset: number;
  endDateOffset: number;
  toTeamUserId: number | null;
  reasonId: number;
  notes?: string;
  uuid?: string | null;
  forUserId: number | null;
  forUserName?: string;
  forUserAvatar?: string;
  toUserName?: string;
};

type Option = { value: number; label: string };

export const CreateOrEditOutOfOfficeEntryModal = ({
  openModal,
  closeModal,
  currentlyEditingOutOfOfficeEntry,
}: {
  openModal: boolean;
  closeModal: () => void;
  currentlyEditingOutOfOfficeEntry: BookingRedirectForm | null;
}) => {
  const { t } = useLocale();
  const utils = trpc.useUtils();
  const me = useMeQuery();

  // Redirect-to user search (for forwarding)
  const [searchRedirectMember, setSearchRedirectMember] = useState("");
  const debouncedSearchRedirect = useDebounce(searchRedirectMember, 500);
  const redirectMembers = trpc.viewer.teams.legacyListMembers.useInfiniteQuery(
    {
      limit: 10,
      searchText: debouncedSearchRedirect,
      adminOrOwnedTeamsOnly: false,
    },
    {
      enabled: true,
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }
  );
  const redirectToMemberListOptions:
    | {
        value: number;
        label: string;
        avatarUrl: string | null;
      }[] =
    redirectMembers?.data?.pages
      .flatMap((page) => page.members)
      // exclude self from redirect targets
      ?.filter((member) => me?.data?.id !== member.id)
      .map((member) => ({
        value: member.id,
        label: member.name || member.username || "",
        avatarUrl: member.avatarUrl,
      })) || [];
  const { ref: observerRefRedirect } = useInViewObserver(() => {
    if (redirectMembers.hasNextPage && !redirectMembers.isFetching) {
      redirectMembers.fetchNextPage();
    }
  }, document.querySelector('[role="dialog"]'));

  const { data: outOfOfficeReasonList, isPending: isReasonListPending } =
    trpc.viewer.ooo.outOfOfficeReasonList.useQuery();
  const reasonList = (outOfOfficeReasonList || []).map((reason) => ({
    label: `${reason.emoji} ${reason.userId === null ? t(reason.reason) : reason.reason}`,
    value: reason.id,
  }));

  const {
    handleSubmit,
    setValue,
    control,
    register,
    watch,
    formState: { isSubmitting },
  } = useForm<BookingRedirectForm>({
    defaultValues: currentlyEditingOutOfOfficeEntry
      ? currentlyEditingOutOfOfficeEntry
      : {
          dateRange: {
            startDate: dayjs().startOf("d").toDate(),
            endDate: dayjs().startOf("d").add(2, "d").toDate(),
          },
          startDateOffset: dayjs().utcOffset(),
          endDateOffset: dayjs().utcOffset(),
          toTeamUserId: null,
          reasonId: 1,
          forUserId: null,
        },
  });

  const createOrEditOutOfOfficeEntry = trpc.viewer.ooo.outOfOfficeCreateOrUpdate.useMutation({
    onSuccess: () => {
      showToast(
        currentlyEditingOutOfOfficeEntry
          ? t("success_edited_entry_out_of_office")
          : t("success_entry_created"),
        "success"
      );
      utils.viewer.ooo.outOfOfficeEntriesList.invalidate();
      closeModal();
    },
    onError: (error) => {
      showToast(t(error.message), "error");
    },
  });

  return (
    <Dialog
      open={openModal}
      onOpenChange={(open) => {
        if (!open) closeModal();
      }}>
      <DialogContent enableOverflow onOpenAutoFocus={(event) => event.preventDefault()}>
        <form
          id="create-or-edit-ooo-form"
          onSubmit={handleSubmit((data) => {
            if (!data.dateRange.endDate) {
              showToast(t("end_date_not_selected"), "error");
            } else {
              createOrEditOutOfOfficeEntry.mutate({
                ...data,
                startDateOffset: -1 * data.dateRange.startDate.getTimezoneOffset(),
                endDateOffset: -1 * data.dateRange.endDate.getTimezoneOffset(),
              });
            }
          })}>
          <div className="h-full px-1">
            <DialogHeader
              title={
                currentlyEditingOutOfOfficeEntry ? t("edit_an_out_of_office") : t("create_an_out_of_office")
              }
            />

            {/* Dates */}
            <div>
              <p className="text-emphasis mb-1 block text-sm font-medium capitalize">{t("dates")}</p>
              <Controller
                name="dateRange"
                control={control}
                render={({ field: { onChange, value } }) => (
                  <DateRangePicker
                    minDate={null}
                    dates={{ startDate: value.startDate, endDate: value.endDate }}
                    onDatesChange={onChange}
                    strictlyBottom
                    allowPastDates
                  />
                )}
              />
            </div>

            {/* Reason */}
            <div className="mt-4 w-full">
              <p className="text-emphasis block text-sm font-medium">{t("reason")}</p>
              <Controller
                control={control}
                name="reasonId"
                render={({ field: { onChange, value } }) => (
                  <Select<Option>
                    className="mb-0 mt-1 text-white"
                    name="reason"
                    data-testid="reason_select"
                    value={reasonList.find((reason) => reason.value === value)}
                    placeholder={t("ooo_select_reason")}
                    options={reasonList}
                    onChange={(selected) => selected?.value && onChange(selected.value)}
                  />
                )}
              />
            </div>

            {/* Notes */}
            <div className="mt-4">
              <p className="text-emphasis block text-sm font-medium">{t("notes")}</p>
              <TextArea
                data-testid="notes_input"
                className="border-subtle mt-1 h-10 w-full rounded-lg border px-2"
                placeholder={t("additional_notes")}
                {...register("notes")}
                onChange={(e) => setValue("notes", e.target.value)}
              />
            </div>
          </div>

          <DialogFooter showDivider noSticky>
            <div className="flex">
              <Button color="minimal" type="button" onClick={closeModal} className="mr-1">
                {t("cancel")}
              </Button>
              <Button
                form="create-or-edit-ooo-form"
                color="primary"
                type="submit"
                disabled={isSubmitting || isReasonListPending}
                data-testid="create-or-edit-entry-ooo-redirect">
                {currentlyEditingOutOfOfficeEntry ? t("save") : t("create")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
