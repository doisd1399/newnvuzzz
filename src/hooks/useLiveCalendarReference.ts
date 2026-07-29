import { useEffect, useState } from "react";

/**
 * Keeps date-based performance periods aligned with the device calendar.
 * It refreshes on local midnight and whenever the app/tab returns to focus,
 * without polling continuously or forcing ranking recalculations every second.
 */
export function useLiveCalendarReference() {
  const [referenceDate, setReferenceDate] = useState(() => new Date());

  useEffect(() => {
    let midnightTimer: ReturnType<typeof setTimeout> | null = null;

    const refresh = () => setReferenceDate(new Date());
    const scheduleMidnightRefresh = () => {
      if (midnightTimer) clearTimeout(midnightTimer);
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setDate(nextMidnight.getDate() + 1);
      nextMidnight.setHours(0, 0, 1, 0);
      midnightTimer = setTimeout(() => {
        refresh();
        scheduleMidnightRefresh();
      }, Math.max(1_000, nextMidnight.getTime() - now.getTime()));
    };

    const handleVisibility = () => {
      if (!document.hidden) refresh();
    };

    scheduleMidnightRefresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (midnightTimer) clearTimeout(midnightTimer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return referenceDate;
}
