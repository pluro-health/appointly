import { useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import type { UseFormGetValues, UseFormSetValue, Control, FormState } from "react-hook-form";

import { useIsPlatform } from "@calcom/atoms/hooks/useIsPlatform";
import useLockedFieldsManager from "@calcom/features/ee/managed-event-types/hooks/useLockedFieldsManager";
import type { LocationCustomClassNames } from "@calcom/features/eventtypes/components/Locations";
import Locations from "@calcom/features/eventtypes/components/Locations";
import type {
  EventTypeSetupProps,
  InputClassNames,
  SelectClassNames,
  SettingsToggleClassNames,
} from "@calcom/features/eventtypes/lib/types";
import type { FormValues, LocationFormValues } from "@calcom/features/eventtypes/lib/types";
import { MAX_EVENT_DURATION_MINUTES, MIN_EVENT_DURATION_MINUTES } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { md } from "@calcom/lib/markdownIt";
import { slugify } from "@calcom/lib/slugify";
import turndown from "@calcom/lib/turndownService";
import classNames from "@calcom/ui/classNames";
import { Editor } from "@calcom/ui/components/editor";
import { TextAreaField } from "@calcom/ui/components/form";
import { Label } from "@calcom/ui/components/form";
import { TextField } from "@calcom/ui/components/form";
import { Select } from "@calcom/ui/components/form";
import { Skeleton } from "@calcom/ui/components/skeleton";

export type EventSetupTabCustomClassNames = {
  wrapper?: string;
  titleSection?: {
    container?: string;
    titleInput?: InputClassNames;
    urlInput?: InputClassNames;
    descriptionInput?: Pick<InputClassNames, "input" | "label">;
  };
  durationSection?: {
    container?: string;
    singleDurationInput?: InputClassNames;
    multipleDuration?: {
      container?: string;
      availableDurationsSelect?: SelectClassNames;
      defaultDurationSelect?: SelectClassNames;
    };
    selectDurationToggle?: SettingsToggleClassNames;
  };
  locationSection?: LocationCustomClassNames & {
    container?: string;
    label?: string;
  };
};

export type EventSetupTabProps = Pick<
  EventTypeSetupProps,
  "eventType" | "locationOptions" | "team" | "teamMembers" | "destinationCalendar"
> & {
  customClassNames?: EventSetupTabCustomClassNames;
};
export const EventSetupTab = (
  props: EventSetupTabProps & {
    urlPrefix: string;
    hasOrgBranding: boolean;
    orgId?: number;
    localeOptions?: { value: string; label: string }[];
  }
) => {
  const { t } = useLocale();
  const isPlatform = useIsPlatform();
  const formMethods = useFormContext<FormValues>();
  const { eventType, team, urlPrefix, hasOrgBranding, customClassNames } = props;

  const interfaceLanguageOptions =
    props.localeOptions && props.localeOptions.length > 0
      ? [{ label: t("visitors_browser_language"), value: "" }, ...props.localeOptions]
      : [];

  const [firstRender, setFirstRender] = useState(true);

  const { isChildrenManagedEventType, isManagedEventType, shouldLockIndicator, shouldLockDisableProps } =
    useLockedFieldsManager({ eventType, translate: t, formMethods });

  const lengthLockedProps = shouldLockDisableProps("length");
  const descriptionLockedProps = shouldLockDisableProps("description");
  const urlLockedProps = shouldLockDisableProps("slug");
  const titleLockedProps = shouldLockDisableProps("title");

  return (
    <div>
      <div className={classNames("space-y-4", customClassNames?.wrapper)}>
        <div
          className={classNames(
            "border-subtle space-y-6 rounded-lg border p-6",
            customClassNames?.titleSection?.container
          )}>
          <TextField
            required
            containerClassName={classNames(customClassNames?.titleSection?.titleInput?.container)}
            labelClassName={classNames(customClassNames?.titleSection?.titleInput?.label)}
            className={classNames(customClassNames?.titleSection?.titleInput?.input)}
            label={t("title")}
            {...(isManagedEventType || isChildrenManagedEventType ? titleLockedProps : {})}
            defaultValue={eventType.title}
            data-testid="event-title"
            {...formMethods.register("title")}
          />
          <div>
            {isPlatform ? (
              <TextAreaField
                {...formMethods.register("description", {
                  disabled: descriptionLockedProps.disabled,
                })}
                placeholder={t("quick_video_meeting")}
                className={customClassNames?.titleSection?.descriptionInput?.input}
                labelProps={{
                  className: customClassNames?.titleSection?.descriptionInput?.label,
                }}
              />
            ) : (
              <>
                <Label htmlFor="editor">
                  {t("description")}
                  {(isManagedEventType || isChildrenManagedEventType) && shouldLockIndicator("description")}
                </Label>
                <Editor
                  getText={() => md.render(formMethods.getValues("description") || "")}
                  setText={(value: string) =>
                    formMethods.setValue("description", turndown(value), { shouldDirty: true })
                  }
                  excludedToolbarItems={["blockType"]}
                  placeholder={t("quick_video_meeting")}
                  editable={!descriptionLockedProps.disabled}
                  firstRender={firstRender}
                  setFirstRender={setFirstRender}
                />
              </>
            )}
          </div>
          {!isPlatform && interfaceLanguageOptions.length > 0 && (
            <div>
              <Skeleton
                as={Label}
                loadingClassName="w-16"
                htmlFor="interfaceLanguage"
                className={customClassNames?.locationSection?.label}>
                {t("interface_language")}
                {shouldLockIndicator("interfaceLanguage")}
              </Skeleton>
              <Controller
                name="interfaceLanguage"
                control={formMethods.control}
                defaultValue={eventType.interfaceLanguage ?? ""}
                render={({ field: { value, onChange } }) => (
                  <Select<{ label: string; value: string }>
                    data-testid="event-interface-language"
                    className="capitalize"
                    options={interfaceLanguageOptions}
                    onChange={(option) => {
                      onChange(option?.value);
                    }}
                    value={interfaceLanguageOptions.find((option) => option.value === value)}
                  />
                )}
              />
            </div>
          )}
          <TextField
            required
            label={isPlatform ? "Slug" : t("URL")}
            {...(isManagedEventType || isChildrenManagedEventType ? urlLockedProps : {})}
            defaultValue={eventType.slug}
            data-testid="event-slug"
            containerClassName={classNames(
              "[&>div]:gap-0",
              customClassNames?.titleSection?.urlInput?.container
            )}
            labelClassName={classNames(customClassNames?.titleSection?.urlInput?.label)}
            className={classNames("pl-0", customClassNames?.titleSection?.urlInput?.input)}
            addOnLeading={
              isPlatform ? undefined : (
                <>
                  {urlPrefix}/
                  {!isManagedEventType
                    ? team
                      ? (hasOrgBranding ? "" : "team/") + team.slug
                      : formMethods.getValues("users")[0].username
                    : t("username_placeholder")}
                  /
                </>
              )
            }
            {...formMethods.register("slug", {
              setValueAs: (v) => slugify(v),
            })}
          />
        </div>
        <div
          className={classNames(
            "border-subtle rounded-lg border p-6",
            customClassNames?.durationSection?.container
          )}>
          <TextField
            required
            type="number"
            containerClassName={classNames(customClassNames?.durationSection?.singleDurationInput?.container)}
            labelClassName={classNames(customClassNames?.durationSection?.singleDurationInput?.label)}
            className={classNames(customClassNames?.durationSection?.singleDurationInput?.input)}
            data-testid="duration"
            {...(isManagedEventType || isChildrenManagedEventType ? lengthLockedProps : {})}
            label={t("duration")}
            defaultValue={formMethods.getValues("length") ?? 15}
            {...formMethods.register("length", {
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
            addOnSuffix={<>{t("minutes")}</>}
            min={MIN_EVENT_DURATION_MINUTES}
            max={MAX_EVENT_DURATION_MINUTES}
          />
        </div>
        <div
          className={classNames(
            "border-subtle rounded-lg border p-6",
            customClassNames?.locationSection?.container
          )}>
          <div>
            <Skeleton
              as={Label}
              loadingClassName="w-16"
              htmlFor="locations"
              className={customClassNames?.locationSection?.label}>
              {t("location")}
              {/*improve shouldLockIndicator function to also accept eventType and then conditionally render
              based on Managed Event type or not.*/}
              {shouldLockIndicator("locations")}
            </Skeleton>
            <Controller
              name="locations"
              control={formMethods.control}
              defaultValue={eventType.locations || []}
              render={() => (
                <Locations
                  showAppStoreLink={false}
                  isChildrenManagedEventType={isChildrenManagedEventType}
                  isManagedEventType={isManagedEventType}
                  disableLocationProp={shouldLockDisableProps("locations").disabled}
                  getValues={formMethods.getValues as unknown as UseFormGetValues<LocationFormValues>}
                  setValue={formMethods.setValue as unknown as UseFormSetValue<LocationFormValues>}
                  control={formMethods.control as unknown as Control<LocationFormValues>}
                  formState={formMethods.formState as unknown as FormState<LocationFormValues>}
                  {...props}
                  customClassNames={customClassNames?.locationSection}
                />
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
