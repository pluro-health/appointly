import type { User as UserAuth } from "next-auth";

import { useHasActiveTeamPlan } from "@calcom/lib/hooks/useHasPaidPlan";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { showToast } from "@calcom/ui/components/toast";

import { type NavigationItemType } from "./navigation/NavigationItem";

type BottomNavItemsProps = {
  publicPageUrl: string;
  isAdmin: boolean;
  user: UserAuth | null | undefined;
};

export function useBottomNavItems({
  publicPageUrl,
  isAdmin,
  user,
}: BottomNavItemsProps): NavigationItemType[] {
  const { t } = useLocale();
  const { isTrial } = useHasActiveTeamPlan();
  const utils = trpc.useUtils();

  const skipTeamTrialsMutation = trpc.viewer.teams.skipTeamTrials.useMutation({
    onSuccess: () => {
      utils.viewer.teams.hasActiveTeamPlan.invalidate();
      showToast(t("team_trials_skipped_successfully"), "success");
    },
    onError: () => {
      showToast(t("something_went_wrong"), "error");
    },
  });

  return [
    // Render above to prevent layout shift as much as possible
    {
      name: "view_public_page",
      href: publicPageUrl,
      icon: "external-link",
      target: "__blank",
    },
    {
      name: "copy_public_page_link",
      href: "",
      onClick: (e: { preventDefault: () => void }) => {
        e.preventDefault();
        navigator.clipboard.writeText(publicPageUrl);
        showToast(t("link_copied"), "success");
      },
      icon: "copy",
    },
  ].filter(Boolean) as NavigationItemType[];
}
