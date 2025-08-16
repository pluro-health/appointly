import { useEffect, useState } from "react";

import { useLocale } from "@calcom/lib/hooks/useLocale";
import { Badge } from "@calcom/ui/components/badge";
import { Icon } from "@calcom/ui/components/icon";

interface CountdownProps {
  startTime: string;
  onTimeUpdate?: (info: {
    hoursRemaining: number;
    minutesRemaining: number;
    isWithin24Hours: boolean;
    hasTimeElapsed: boolean;
  }) => void;
}

export default function AppointlyCancellationCountdown({ startTime, onTimeUpdate }: CountdownProps) {
  const { t } = useLocale();
  const [timeInfo, setTimeInfo] = useState({
    hoursRemaining: 0,
    minutesRemaining: 0,
    isWithin24Hours: false,
    hasTimeElapsed: false,
  });

  useEffect(() => {
    const calculateCountdown = () => {
      const now = new Date();
      const appointmentTime = new Date(startTime);
      const timeUntilAppointment = appointmentTime.getTime() - now.getTime();

      if (timeUntilAppointment <= 0) {
        const info = {
          hoursRemaining: 0,
          minutesRemaining: 0,
          isWithin24Hours: true,
          hasTimeElapsed: true,
        };
        setTimeInfo(info);
        onTimeUpdate?.(info);
        return;
      }

      const hoursRemaining = Math.floor(timeUntilAppointment / (1000 * 60 * 60));
      const minutesRemaining = Math.floor((timeUntilAppointment % (1000 * 60 * 60)) / (1000 * 60));
      const isWithin24Hours = hoursRemaining < 24;

      const info = {
        hoursRemaining,
        minutesRemaining,
        isWithin24Hours,
        hasTimeElapsed: false,
      };

      setTimeInfo(info);
      onTimeUpdate?.(info);
    };

    calculateCountdown();
    const interval = setInterval(calculateCountdown, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [startTime, onTimeUpdate]);

  if (timeInfo.hasTimeElapsed) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Icon name="clock" className="h-4 w-4" />
        <span>Appointment time has passed</span>
      </div>
    );
  }

  const displayTime = () => {
    if (timeInfo.hoursRemaining >= 24) {
      const days = Math.floor(timeInfo.hoursRemaining / 24);
      const remainingHours = timeInfo.hoursRemaining % 24;
      return `${days}d ${remainingHours}h`;
    } else if (timeInfo.hoursRemaining > 0) {
      return `${timeInfo.hoursRemaining}h ${timeInfo.minutesRemaining}m`;
    } else {
      return `${timeInfo.minutesRemaining}m`;
    }
  };

  const getBadgeVariant = () => {
    if (timeInfo.isWithin24Hours) {
      if (timeInfo.hoursRemaining < 2) return "error";
      return "warning";
    }
    return "success";
  };

  const getTimeMessage = () => {
    if (timeInfo.isWithin24Hours) {
      return "until 24-hour refund cutoff";
    }
    return "until appointment";
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon name="clock" className="h-4 w-4 text-gray-500" />
      <Badge variant={getBadgeVariant()}>
        {displayTime()} {getTimeMessage()}
      </Badge>
      {timeInfo.isWithin24Hours && <span className="text-xs text-orange-600">No refund available</span>}
    </div>
  );
}
