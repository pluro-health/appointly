"use client";

// eslint-disable-next-line @calcom/eslint/deprecated-imports-next-router
import type { TFunction } from "i18next";
import { useMemo } from "react";
import type { UseFormReturn } from "react-hook-form";

import useLockedFieldsManager from "@calcom/features/ee/managed-event-types/hooks/useLockedFieldsManager";
import type { Workflow } from "@calcom/features/ee/workflows/lib/types";
import type {
  EventTypeSetupProps,
  AvailabilityOption,
  FormValues,
  EventTypeApps,
} from "@calcom/features/eventtypes/lib/types";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import type { VerticalTabItemProps } from "@calcom/ui/components/navigation";

type Props = {
  formMethods: UseFormReturn<FormValues>;
  eventType: EventTypeSetupProps["eventType"];
  team: EventTypeSetupProps["team"];
  eventTypeApps?: EventTypeApps;
  allActiveWorkflows?: Workflow[];
};
export const useTabsNavigations = ({ formMethods, eventType, team }: Props) => {
  const { t } = useLocale();

  const length = formMethods.watch("length");
  const multipleDuration = formMethods.watch("metadata")?.multipleDuration;

  const watchSchedulingType = formMethods.watch("schedulingType");
  const watchChildrenCount = formMethods.watch("children").length;
  const availability = formMethods.watch("availability");

  const { isManagedEventType, isChildrenManagedEventType } = useLockedFieldsManager({
    eventType,
    translate: t,
    formMethods,
  });

  const EventTypeTabs = useMemo(() => {
    const navigation: VerticalTabItemProps[] = getNavigation({
      t,
      length,
      multipleDuration,
      id: formMethods.getValues("id"),
      // enabledAppsNumber, // No longer passed as Apps tab is hidden
      // installedAppsNumber, // No longer passed as Apps tab is hidden
      // enabledWorkflowsNumber, // No longer passed as Workflows tab is hidden
      availability,
    });

    // Removed the "Recurring" tab
    // if (!requirePayment) {
    //   navigation.splice(3, 0, {
    //     name: t("recurring"),
    //     href: `/event-types/${formMethods.getValues("id")}?tabName=recurring`,
    //     icon: "repeat",
    //     info: t(`recurring_event_tab_description`),
    //     "data-testid": "recurring",
    //   });
    // }

    navigation.splice(1, 0, {
      name: t("availability"),
      href: `/event-types/${formMethods.getValues("id")}?tabName=availability`,
      icon: "calendar",
      info:
        isManagedEventType || isChildrenManagedEventType
          ? formMethods.getValues("schedule") === null
            ? t("members_default_schedule")
            : isChildrenManagedEventType
            ? `${
                formMethods.getValues("scheduleName")
                  ? `${formMethods.getValues("scheduleName")} - ${t("managed")}`
                  : t(`default_schedule_name`)
              }`
            : formMethods.getValues("scheduleName") ?? t(`default_schedule_name`)
          : formMethods.getValues("scheduleName") ?? t(`default_schedule_name`),
      "data-testid": "availability",
    });
    // If there is a team put this navigation item within the tabs
    if (team) {
      navigation.splice(2, 0, {
        name: t("assignment"),
        href: `/event-types/${formMethods.getValues("id")}?tabName=team`,
        icon: "users",
        info: `${t(watchSchedulingType?.toLowerCase() ?? "")}${
          isManagedEventType ? ` - ${t("number_member", { count: watchChildrenCount || 0 })}` : ""
        }`,
        "data-testid": "assignment",
      });
    }
    const showInstant = !(isManagedEventType || isChildrenManagedEventType);
    if (showInstant) {
      if (team) {
        navigation.push({
          name: t("instant_tab_title"),
          href: `/event-types/${eventType.id}?tabName=instant`,
          icon: "phone-call",
          info: t(`instant_event_tab_description`),
          "data-testid": "instant_tab_title",
        });
      }
    }

    const hidden = true;
    if (team && hidden) {
      navigation.push({
        name: "Cal.ai",
        href: `/event-types/${eventType.id}?tabName=ai`,
        icon: "sparkles",
        info: t("cal_ai_event_tab_description"), // todo `cal_ai_event_tab_description`,
        "data-testid": "Cal.ai",
      });
    }
    return navigation;
  }, [
    t,
    availability,
    isManagedEventType,
    isChildrenManagedEventType,
    team,
    length,
    multipleDuration,
    formMethods.getValues("id"),
    watchSchedulingType,
    watchChildrenCount,
  ]);

  return { tabsNavigation: EventTypeTabs };
};

type getNavigationProps = {
  t: TFunction;
  length: number;
  id: number;
  multipleDuration?: EventTypeSetupProps["eventType"]["metadata"]["multipleDuration"];
  availability: AvailabilityOption | undefined;
};

function getNavigation({ length, id, multipleDuration, t }: getNavigationProps) {
  const duration = multipleDuration?.map((duration) => ` ${duration}`) || length;

  return [
    {
      name: t("event_setup_tab_title"),
      href: `/event-types/${id}?tabName=setup`,
      icon: "link",
      info: `${duration} ${t("minute_timeUnit")}`, // TODO: Get this from props
      "data-testid": `event_setup_tab_title`,
    },
    {
      name: t("event_limit_tab_title"),
      href: `/event-types/${id}?tabName=limits`,
      icon: "clock",
      info: t(`event_limit_tab_description`),
      "data-testid": "event_limit_tab_title",
    },
    {
      name: t("event_advanced_tab_title"),
      href: `/event-types/${id}?tabName=advanced`,
      icon: "sliders-vertical",
      info: t(`event_advanced_tab_description`),
      "data-testid": "event_advanced_tab_title",
    },
  ] satisfies VerticalTabItemProps[];
}
