import type { ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";

import { useIsPlatform } from "@calcom/atoms/hooks/useIsPlatform";
import type { CreateEventTypeFormValues } from "@calcom/lib/hooks/useCreateEventType";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import slugify from "@calcom/lib/slugify";
import { SchedulingType } from "@calcom/prisma/enums";
import classNames from "@calcom/ui/classNames";
import { Alert } from "@calcom/ui/components/alert";
import { Form } from "@calcom/ui/components/form";
import { TextField } from "@calcom/ui/components/form";
import { Switch } from "@calcom/ui/components/form";
import { Select } from "@calcom/ui/components/form";
import { Label } from "@calcom/ui/components/form";
import { Icon } from "@calcom/ui/components/icon";
import { RadioAreaGroup as RadioArea } from "@calcom/ui/components/radio";
import { Tooltip } from "@calcom/ui/components/tooltip";

type props = {
  isTeamAdminOrOwner: boolean;
  teamSlug?: string | null;
  teamId: number;
  isPending: boolean;
  urlPrefix?: string;
  form: UseFormReturn<CreateEventTypeFormValues>;
  handleSubmit: (values: CreateEventTypeFormValues) => void;
  isManagedEventType: boolean;
  SubmitButton: (isPending: boolean) => ReactNode;
};
export const TeamEventTypeForm = ({
  isTeamAdminOrOwner,
  teamSlug,
  teamId,
  form,
  urlPrefix,
  isPending,
  handleSubmit,
  isManagedEventType,
  SubmitButton,
}: props) => {
  const isPlatform = useIsPlatform();

  const { t } = useLocale();

  const { register, setValue, formState, watch } = form;
  const requiresPayment = watch("requiresPayment");

  const currencyOptions = [{ value: "INR", label: "₹ INR - Indian Rupee" }];

  return (
    <Form form={form} handleSubmit={handleSubmit}>
      <div className="mt-3 space-y-6 pb-11">
        <TextField
          type="hidden"
          labelProps={{ style: { display: "none" } }}
          {...register("teamId", { valueAsNumber: true })}
          value={teamId}
        />
        <TextField
          label={t("title")}
          placeholder={t("quick_chat")}
          data-testid="event-type-quick-chat"
          {...register("title")}
          onChange={(e) => {
            form.setValue("title", e?.target.value);
            if (formState.touchedFields["slug"] === undefined) {
              form.setValue("slug", slugify(e?.target.value));
            }
          }}
        />
        {urlPrefix && urlPrefix.length >= 21 ? (
          <div>
            <TextField
              label={isPlatform ? "Slug" : `${t("url")}: ${urlPrefix}`}
              required
              addOnLeading={
                !isPlatform ? (
                  <Tooltip content={!isManagedEventType ? `team/${teamSlug}` : t("username_placeholder")}>
                    <span className="max-w-24 md:max-w-56">
                      /{!isManagedEventType ? `team/${teamSlug}` : t("username_placeholder")}/
                    </span>
                  </Tooltip>
                ) : undefined
              }
              {...register("slug")}
              onChange={(e) => {
                form.setValue("slug", slugify(e?.target.value), { shouldTouch: true });
              }}
            />

            {isManagedEventType && !isPlatform && (
              <p className="mt-2 text-sm text-gray-600">{t("managed_event_url_clarification")}</p>
            )}
          </div>
        ) : (
          <div>
            <TextField
              label={isPlatform ? "Slug" : t("url")}
              required
              addOnLeading={
                !isPlatform ? (
                  <Tooltip
                    content={`${urlPrefix}/${
                      !isManagedEventType ? `team/${teamSlug}` : t("username_placeholder")
                    }/`}>
                    <span className="max-w-24 md:max-w-56">
                      {urlPrefix}/{!isManagedEventType ? `team/${teamSlug}` : t("username_placeholder")}/
                    </span>
                  </Tooltip>
                ) : undefined
              }
              {...register("slug")}
              onChange={(e) => {
                form.setValue("slug", slugify(e?.target.value), { shouldTouch: true });
              }}
            />
            {isManagedEventType && !isPlatform && (
              <p className="mt-2 text-sm text-gray-600">{t("managed_event_url_clarification")}</p>
            )}
          </div>
        )}
        <div className="mb-4">
          <label htmlFor="schedulingType" className="text-default block text-sm font-bold">
            {t("assignment")}
          </label>
          {formState.errors.schedulingType && (
            <Alert className="mt-1" severity="error" message={formState.errors.schedulingType.message} />
          )}
          <RadioArea.Group
            onValueChange={(val: SchedulingType) => {
              setValue("schedulingType", val);
            }}
            className={classNames("mt-1 flex gap-4", isTeamAdminOrOwner && "flex-col")}>
            <RadioArea.Item
              {...register("schedulingType")}
              value={SchedulingType.COLLECTIVE}
              className={classNames("w-full text-sm", !isTeamAdminOrOwner && "w-1/2")}
              classNames={{ container: classNames(isTeamAdminOrOwner && "w-full") }}>
              <strong className="mb-1 block">{t("collective")}</strong>
              <p>{t("collective_description")}</p>
            </RadioArea.Item>
            <RadioArea.Item
              {...register("schedulingType")}
              value={SchedulingType.ROUND_ROBIN}
              className={classNames("text-sm", !isTeamAdminOrOwner && "w-1/2")}
              classNames={{ container: classNames(isTeamAdminOrOwner && "w-full") }}>
              <strong className="mb-1 block">{t("round_robin")}</strong>
              <p>{t("round_robin_description")}</p>
            </RadioArea.Item>
            {isTeamAdminOrOwner && (
              <RadioArea.Item
                {...register("schedulingType")}
                value={SchedulingType.MANAGED}
                className={classNames("text-sm", !isTeamAdminOrOwner && "w-1/2")}
                classNames={{ container: classNames(isTeamAdminOrOwner && "w-full") }}
                data-testid="managed-event-type">
                <strong className="mb-1 block">{t("managed_event")}</strong>
                <p>{t("managed_event_description")}</p>
              </RadioArea.Item>
            )}
          </RadioArea.Group>
        </div>

        {/* Payment Configuration Section */}
        <div className="border-subtle space-y-6 rounded-lg border p-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Label className="text-base font-medium">{t("payment_settings")}</Label>
                <Tooltip content={t("payment_settings_tooltip")}>
                  <Icon name="info" className="h-4 w-4 text-gray-400" />
                </Tooltip>
              </div>
              <Switch
                checked={requiresPayment}
                onCheckedChange={(checked) => {
                  setValue("requiresPayment", checked, { shouldDirty: true });
                  if (!checked) {
                    setValue("consultationPrice", null, { shouldDirty: true });
                  } else {
                    // When enabling payment, check if consultation price is set
                    const currentPrice = watch("consultationPrice");
                    if (!currentPrice || currentPrice <= 0) {
                      // Trigger validation on the consultation price field
                      form.trigger("consultationPrice");
                    }
                  }
                }}
              />
            </div>

            <p className="text-sm text-gray-500">{t("payment_settings_description")}</p>

            {requiresPayment && (
              <div className="space-y-4 border-l-2 border-blue-200 pl-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <TextField
                      type="number"
                      step="0.01"
                      min="0"
                      max="999999.99"
                      label={t("consultation_price")}
                      placeholder="500.00"
                      {...register("consultationPrice", {
                        valueAsNumber: true,
                        required: requiresPayment ? t("consultation_price_required") : false,
                        min: {
                          value: 0.01,
                          message: t("consultation_price_min_error"),
                        },
                        max: {
                          value: 999999.99,
                          message: t("consultation_price_max_error"),
                        },
                      })}
                    />
                  </div>

                  <div>
                    <Label>{t("currency")}</Label>
                    <Select
                      options={currencyOptions}
                      value={
                        currencyOptions.find((option) => option.value === watch("paymentCurrency")) ||
                        currencyOptions[0]
                      }
                      onChange={(selectedOption) => {
                        setValue("paymentCurrency", selectedOption?.value || "INR", {
                          shouldDirty: true,
                        });
                      }}
                      placeholder={t("select_currency")}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {SubmitButton(isPending)}
    </Form>
  );
};
