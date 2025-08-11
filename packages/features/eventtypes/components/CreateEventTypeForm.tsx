import type { ReactNode } from "react";
import { useState } from "react";
import type { UseFormReturn } from "react-hook-form";

import { useIsPlatform } from "@calcom/atoms/hooks/useIsPlatform";
import { MAX_EVENT_DURATION_MINUTES, MIN_EVENT_DURATION_MINUTES } from "@calcom/lib/constants";
import type { CreateEventTypeFormValues } from "@calcom/lib/hooks/useCreateEventType";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { md } from "@calcom/lib/markdownIt";
import slugify from "@calcom/lib/slugify";
import turndown from "@calcom/lib/turndownService";
import { Editor } from "@calcom/ui/components/editor";
import { Form } from "@calcom/ui/components/form";
import { TextAreaField } from "@calcom/ui/components/form";
import { TextField } from "@calcom/ui/components/form";
import { Switch } from "@calcom/ui/components/form";
import { Select } from "@calcom/ui/components/form";
import { Label } from "@calcom/ui/components/form";
import { Icon } from "@calcom/ui/components/icon";
import { Tooltip } from "@calcom/ui/components/tooltip";

export default function CreateEventTypeForm({
  form,
  isManagedEventType,
  handleSubmit,
  pageSlug,
  isPending,
  urlPrefix,
  SubmitButton,
}: {
  form: UseFormReturn<CreateEventTypeFormValues>;
  isManagedEventType: boolean;
  handleSubmit: (values: CreateEventTypeFormValues) => void;
  pageSlug?: string;
  isPending: boolean;
  urlPrefix?: string;
  SubmitButton: (isPending: boolean) => ReactNode;
}) {
  const isPlatform = useIsPlatform();
  const { t } = useLocale();
  const [firstRender, setFirstRender] = useState(true);

  const { register, watch, setValue } = form;
  const requiresPayment = watch("requiresPayment");

  const currencyOptions = [{ value: "INR", label: "₹ INR - Indian Rupee" }];
  return (
    <Form
      form={form}
      handleSubmit={(values) => {
        handleSubmit(values);
      }}>
      <div className="mt-3 space-y-6 pb-11">
        <TextField
          label={t("title")}
          placeholder={t("quick_chat")}
          data-testid="event-type-quick-chat"
          {...register("title")}
          onChange={(e) => {
            form.setValue("title", e?.target.value);
            if (form.formState.touchedFields["slug"] === undefined) {
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
                  <Tooltip content={!isManagedEventType ? pageSlug : t("username_placeholder")}>
                    <span className="max-w-24 md:max-w-56">
                      {`/${!isManagedEventType ? pageSlug : t("username_placeholder")}/`}
                    </span>
                  </Tooltip>
                ) : undefined
              }
              containerClassName="[&>div]:gap-0"
              className="pl-0"
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
                    content={`${urlPrefix}/${!isManagedEventType ? pageSlug : t("username_placeholder")}/`}>
                    <span className="max-w-24 md:max-w-56">
                      {`${urlPrefix}/${!isManagedEventType ? pageSlug : t("username_placeholder")}/`}
                    </span>
                  </Tooltip>
                ) : undefined
              }
              containerClassName="[&>div]:gap-0"
              className="pl-0"
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
        <>
          {isPlatform ? (
            <TextAreaField {...register("description")} placeholder={t("quick_video_meeting")} />
          ) : (
            <Editor
              getText={() => md.render(form.getValues("description") || "")}
              setText={(value: string) => form.setValue("description", turndown(value))}
              excludedToolbarItems={["blockType", "link"]}
              placeholder={t("quick_video_meeting")}
              firstRender={firstRender}
              setFirstRender={setFirstRender}
              maxHeight="200px"
            />
          )}

          <div className="relative">
            <TextField
              type="number"
              required
              min={MIN_EVENT_DURATION_MINUTES}
              max={MAX_EVENT_DURATION_MINUTES}
              placeholder="15"
              label={t("duration")}
              className="pr-4"
              {...register("length", {
                valueAsNumber: true,
                min: {
                  value: MIN_EVENT_DURATION_MINUTES,
                  message: t("duration_min_error", { min: MIN_EVENT_DURATION_MINUTES }),
                },
                max: {
                  value: MAX_EVENT_DURATION_MINUTES,
                  message: t("duration_max_error", { max: MAX_EVENT_DURATION_MINUTES }),
                },
              })}
              addOnSuffix={t("minutes")}
            />
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
                      const currentPrice = form.getValues("consultationPrice");
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

                  <div>
                    <p className="text-sm text-gray-600">{t("payment_description_help")}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      </div>
      {SubmitButton(isPending)}
    </Form>
  );
}
