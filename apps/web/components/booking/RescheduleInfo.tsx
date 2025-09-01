import { useState, useEffect } from "react";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Button } from "@calcom/ui/components/button";
import { Icon } from "@calcom/ui/components/icon";

interface RescheduleInfoProps {
  bookingId: number;
  className?: string;
}

interface RescheduleInfoData {
  canReschedule: boolean;
  reason?: string;
  rescheduleCount: number;
  maxReschedules: number;
  originalBookingDate?: string;
  timeUntilAppointment?: number;
}

export function RescheduleInfo({ bookingId, className }: RescheduleInfoProps) {
  const { t } = useLocale();
  const [rescheduleInfo, setRescheduleInfo] = useState<RescheduleInfoData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRescheduleInfo = async () => {
      try {
        const response = await fetch(`/api/appointly/reschedule/${bookingId}`);
        if (response.ok) {
          const data = await response.json();
          setRescheduleInfo(data.data);
        }
      } catch (error) {
        console.error("Failed to fetch reschedule info:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchRescheduleInfo();
  }, [bookingId]);

  if (loading) {
    return (
      <div className={`flex items-center space-x-2 text-sm text-gray-500 ${className}`}>
        <Icon name="loader" className="h-4 w-4 animate-spin" />
        <span>{t("loading")}</span>
      </div>
    );
  }

  if (!rescheduleInfo) {
    return null;
  }

  const { canReschedule, reason, rescheduleCount, timeUntilAppointment } = rescheduleInfo;

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center space-x-2">
        <Icon name="clock" className="h-4 w-4 text-blue-500" />
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {t("reschedule_information")}
        </span>
      </div>

      <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
        <div>
          <span className="font-medium">{t("reschedules_used")}:</span> {rescheduleCount}
        </div>

        {timeUntilAppointment !== undefined && (
          <div>
            <span className="font-medium">{t("time_until_appointment")}:</span>{" "}
            {Math.floor(timeUntilAppointment)} {t("hours")}
          </div>
        )}

        {canReschedule ? (
          <div className="text-green-600 dark:text-green-400">
            <Icon name="check" className="mr-1 inline h-4 w-4" />
            {t("reschedule_allowed")}
          </div>
        ) : (
          <div className="text-red-600 dark:text-red-400">
            <Icon name="x" className="mr-1 inline h-4 w-4" />
            {reason || t("reschedule_not_allowed")}
          </div>
        )}
      </div>

      <div className="rounded bg-gray-50 p-2 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
        <p>{t("reschedule_policy")}:</p>
        <ul className="mt-1 list-inside list-disc space-y-1">
          <li>{t("reschedule_policy_24_hours")}</li>
          <li>{t("reschedule_policy_unlimited")}</li>
          <li>{t("reschedule_policy_no_payment")}</li>
        </ul>
      </div>
    </div>
  );
}
