import { useEffect, useState } from "react";

import { trpc } from "@calcom/trpc/react";

interface CancellationInfo {
  canCancel: boolean;
  reason?: string;
  refundEligible: boolean;
  refundPercentage: number;
  refundAmount?: number;
  timeUntilAppointment?: number; // hours
}

interface CountdownInfo {
  hoursRemaining: number;
  minutesRemaining: number;
  isWithin24Hours: boolean;
  hasTimeElapsed: boolean;
}

export function useAppointlyCancellationInfo(bookingId: number, startTime: string) {
  const [cancellationInfo, setCancellationInfo] = useState<CancellationInfo | null>(null);
  const [countdownInfo, setCountdownInfo] = useState<CountdownInfo>({
    hoursRemaining: 0,
    minutesRemaining: 0,
    isWithin24Hours: false,
    hasTimeElapsed: false,
  });

  // Calculate countdown info
  useEffect(() => {
    const calculateCountdown = () => {
      const now = new Date();
      const appointmentTime = new Date(startTime);
      const timeUntilAppointment = appointmentTime.getTime() - now.getTime();

      if (timeUntilAppointment <= 0) {
        setCountdownInfo({
          hoursRemaining: 0,
          minutesRemaining: 0,
          isWithin24Hours: true,
          hasTimeElapsed: true,
        });
        return;
      }

      const hoursRemaining = Math.floor(timeUntilAppointment / (1000 * 60 * 60));
      const minutesRemaining = Math.floor((timeUntilAppointment % (1000 * 60 * 60)) / (1000 * 60));
      const isWithin24Hours = hoursRemaining < 24;

      setCountdownInfo({
        hoursRemaining,
        minutesRemaining,
        isWithin24Hours,
        hasTimeElapsed: false,
      });
    };

    calculateCountdown();
    const interval = setInterval(calculateCountdown, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [startTime]);

  // Fetch cancellation info from API
  useEffect(() => {
    const fetchCancellationInfo = async () => {
      try {
        const response = await fetch(`/api/appointly/cancellation-info/${bookingId}`);
        if (response.ok) {
          const data = await response.json();
          setCancellationInfo(data);
        } else {
          console.error("Failed to fetch cancellation info:", response.status, response.statusText);
        }
      } catch (error) {
        console.error("Failed to fetch cancellation info:", error);
      }
    };

    if (bookingId && bookingId > 0) {
      fetchCancellationInfo();
    }
  }, [bookingId]);

  return {
    cancellationInfo,
    countdownInfo,
    isLoading: cancellationInfo === null,
  };
}
