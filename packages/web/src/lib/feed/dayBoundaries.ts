// Task 51: computes the two local-calendar-day boundaries GET
// /api/articles/counts (and its admin variant) need — D1 has no timezone
// concept, so the server can only compare `added_at` strings against
// boundaries the CLIENT works out in its own local time. This must partition
// exactly the way dateGrouping.ts's bucketSection does (same local Y/M/D
// comparison, so "today" here means the same thing it means there), or the
// server-provided counts would disagree with which section a given article
// actually renders under.
export interface DayBoundaries {
  todayStart: string;
  yesterdayStart: string;
}

function localMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function computeDayBoundaries(now: Date = new Date()): DayBoundaries {
  const todayMidnight = localMidnight(now);
  const yesterdayMidnight = new Date(todayMidnight);
  yesterdayMidnight.setDate(yesterdayMidnight.getDate() - 1);
  return {
    todayStart: todayMidnight.toISOString(),
    yesterdayStart: yesterdayMidnight.toISOString(),
  };
}
