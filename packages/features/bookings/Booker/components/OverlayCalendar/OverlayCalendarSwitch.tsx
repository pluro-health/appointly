import { useEffect } from "react";

import classNames from "@calcom/ui/classNames";

import { useBookerStore } from "../../store";
import { useOverlayCalendarStore } from "./store";

interface OverlayCalendarSwitchProps {
  enabled?: boolean;
  hasSession: boolean;
  onStateChange: (state: boolean) => void;
}

export function OverlayCalendarSwitch({ enabled, hasSession, onStateChange }: OverlayCalendarSwitchProps) {
  const setContinueWithProvider = useOverlayCalendarStore((state) => state.setContinueWithProviderModal);
  const layout = useBookerStore((state) => state.layout);
  const switchEnabled = enabled;

  /**
   * If a user is not logged in and the overlay calendar query param is true,
   * show the continue modal so they can login / create an account
   */
  useEffect(() => {
    if (!hasSession && switchEnabled) {
      onStateChange(false);
      setContinueWithProvider(true);
    }
  }, [hasSession, switchEnabled, setContinueWithProvider, onStateChange]);

  return (
    <div
      className={classNames(
        "hidden gap-2",
        layout === "week_view" || layout === "column_view" ? "xl:flex" : "md:flex"
      )}></div>
  );
}
