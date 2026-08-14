import { useEffect, useState } from "preact/hooks";
import type { Dictionary } from "../i18n/i18n.ts";
import { formatCountdown, nextAgentRunMs } from "../lib/api/agentSchedule.ts";

const TICK_MS = 60_000;

export interface TodayEmptyStateProps {
  dict: Dictionary;
  agentHourUtc: number | null;
  agentHourUtc2: number | null;
  onReadYesterday: () => void;
}

// Rendered in place of Today's normal (hidden-when-empty) section body —
// see Feed.tsx — when the browser-local "today" bucket has zero articles.
// Ticks its own countdown every minute rather than relying on a parent
// re-render; agentHourUtc/agentHourUtc2 are fetched once by App.tsx (see
// lib/api/agentSchedule.ts's loadAgentSchedule) and passed straight through.
export function TodayEmptyState(
  { dict, agentHourUtc, agentHourUtc2, onReadYesterday }: TodayEmptyStateProps,
) {
  const [now, setNow] = useState(() => Date.now());
  const configuredHours = [agentHourUtc, agentHourUtc2].filter((hour): hour is number =>
    hour !== null
  );

  useEffect(() => {
    if (configuredHours.length === 0) return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [agentHourUtc, agentHourUtc2]);

  return (
    <div class="today-empty-state">
      <p class="today-empty-message">{dict.todayEmptyMessage}</p>
      {configuredHours.length === 0
        ? <p class="today-empty-countdown">{dict.todayAgentDisabled}</p>
        : (() => {
          const remainingMs = nextAgentRunMs(configuredHours, new Date(now)) - now;
          const countdown = formatCountdown(remainingMs);
          return (
            <p class="today-empty-countdown">
              {countdown.lessThanMinute
                ? dict.todayCountdownLessThanMinute
                : `${dict.todayCountdownPrefix} ${countdown.hours}${dict.todayCountdownHoursUnit} ${countdown.minutes}${dict.todayCountdownMinutesUnit}`}
            </p>
          );
        })()}
      <button type="button" class="today-empty-yesterday-link" onClick={onReadYesterday}>
        {dict.todayReadYesterdayLink}
      </button>
    </div>
  );
}
