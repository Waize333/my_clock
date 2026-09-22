import { snapshot, type Timer } from "./timer/core";
import {
  addDays,
  dayKey,
  deviceTimezone,
  intervalDays,
  loggedDays,
  type ManualEntry,
} from "./planner";
export function dateKey(date: Date, zone = deviceTimezone()) {
  return dayKey(date, zone);
}
type DailyIndex = ReturnType<typeof buildDailyIndex>;
export function buildDailyIndex(
  sessions: Timer[],
  entries: ManualEntry[],
  zone: string,
  now: number,
) {
  const totals = loggedDays(sessions, entries, zone, now);
  const days: Record<
    string,
    { started: number; completed: number; adherence: number }
  > = {};
  for (const raw of sessions) {
    const session = raw.status ? raw : snapshot(raw, now);
    for (const interval of session.intervals) {
      if (interval.type !== "work") continue;
      const allocation = intervalDays(interval, zone, now);
      const keys = new Set([
        dayKey(interval.started_at, zone),
        ...Object.keys(allocation).filter((k) => allocation[k] > 0),
      ]);
      for (const key of keys) {
        const day = (days[key] ??= { started: 0, completed: 0, adherence: 0 });
        day.started++;
        day.adherence += Math.min(
          1,
          interval.duration_sec / interval.planned_duration_sec,
        );
        if (
          interval.completed &&
          dayKey(interval.ended_at || interval.started_at, zone) === key
        )
          day.completed++;
      }
    }
  }
  return { totals, days };
}
function forDay(index: DailyIndex, key: string) {
  const {
    started,
    completed,
    adherence: sum,
  } = index.days[key] || { started: 0, completed: 0, adherence: 0 };
  const seconds = index.totals[key] || 0,
    adherence = started ? sum / started : 0;
  return {
    seconds,
    minutes: Math.round((seconds / 60) * 10) / 10,
    completed,
    started,
    rate: started ? Math.round((completed / started) * 100) : 0,
    score: started ? Math.round((completed / started) * adherence * 100) : 0,
    adherence: Math.round(adherence * 100),
  };
}
export function dailyStats(
  sessions: Timer[],
  date: Date,
  zone = deviceTimezone(),
  entries: ManualEntry[] = [],
  now = Date.now(),
  index = buildDailyIndex(sessions, entries, zone, now),
) {
  return forDay(index, dayKey(date, zone));
}
export function daySeries(
  sessions: Timer[],
  count: number,
  now = new Date(),
  zone = deviceTimezone(),
  entries: ManualEntry[] = [],
  index = buildDailyIndex(sessions, entries, zone, now.getTime()),
) {
  const today = dayKey(now, zone);
  return Array.from({ length: count }, (_, i) => {
    const key = addDays(today, -count + i + 1);
    return {
      date: key,
      label: new Date(key + "T12:00Z").toLocaleDateString(undefined, {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
      }),
      ...forDay(index, key),
    };
  });
}
export function longestStreak(sessions: Timer[], zone = deviceTimezone()) {
  const dates = [
    ...new Set(
      sessions
        .flatMap((s) => s.intervals)
        .filter((i) => i.type === "work" && i.completed)
        .map((i) => dayKey(i.started_at, zone)),
    ),
  ].sort();
  let longest = 0,
    current = 0,
    last = 0;
  for (const key of dates) {
    const day = Date.parse(key + "T00:00Z") / 86400000;
    current = day === last + 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
    last = day;
  }
  return longest;
}
export function extraStats(
  sessions: Timer[],
  now = new Date(),
  zone = deviceTimezone(),
  entries: ManualEntry[] = [],
  index = buildDailyIndex(sessions, entries, zone, now.getTime()),
) {
  const all = sessions
      .map((s) => (s.status ? s : snapshot(s, now.getTime())))
      .flatMap((s) => s.intervals),
    work = all.filter((i) => i.type === "work"),
    breaks = all.filter((i) => i.type === "break");
  const seconds = work.reduce((n, i) => n + i.duration_sec, 0),
    totals = index.totals;
  const fourteen = daySeries(sessions, 14, now, zone, entries, index),
    thisWeek = fourteen.slice(7).reduce((n, d) => n + d.minutes, 0),
    lastWeek = fourteen.slice(0, 7).reduce((n, d) => n + d.minutes, 0);
  return {
    totalMinutes: Math.round(
      Object.values(totals).reduce((a, b) => a + b, 0) / 60,
    ),
    activeDays: Object.values(totals).filter((v) => v > 0).length,
    averageMinutes: work.length ? Math.round(seconds / work.length / 60) : 0,
    longestMinutes: Math.round(
      Math.max(0, ...work.map((i) => i.duration_sec)) / 60,
    ),
    breakMinutes: Math.round(
      breaks.reduce((n, i) => n + i.duration_sec, 0) / 60,
    ),
    completedBreaks: breaks.filter((i) => i.completed).length,
    thisWeek: Math.round(thisWeek),
    weekChange: lastWeek
      ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100)
      : null,
  };
}
