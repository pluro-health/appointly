"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";

import { useCompatSearchParams } from "@calcom/embed-core/src/useCompatSearchParams";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { ToggleGroup } from "@calcom/ui/components/form";

export enum OutOfOfficeTab {
  MINE = "mine",
}

export const OutOfOfficeToggleGroup = () => {
  const { t } = useLocale();
  const searchParams = useCompatSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Always enforce ?type=mine
  useEffect(() => {
    const current = searchParams?.get("type");
    if (current !== OutOfOfficeTab.MINE) {
      const params = new URLSearchParams(searchParams ?? undefined);
      params.set("type", OutOfOfficeTab.MINE);
      router.replace(`${pathname}?${params.toString()}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const selectedTab = OutOfOfficeTab.MINE;

  const toggleGroupOptions = useMemo(() => [{ value: OutOfOfficeTab.MINE, label: t("my_ooo") }], [t]);

  return (
    <ToggleGroup
      className="hidden md:block"
      // Single option; value change is a no-op
      defaultValue={selectedTab}
      onValueChange={() => {}}
      options={toggleGroupOptions}
    />
  );
};
