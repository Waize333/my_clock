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
function forDay(
  sessions: Timer[],
  key: string,
  zone: string,
  now: number,
  entries: ManualEntry[],
) {
  const work = sessions
    .map((s) => snapshot(s, now))
    .flatMap((s) => s.intervals)
    .filter(
      (i) =>
        i.type === "work" &&
        (dayKey(i.started_at, zone) === key ||
          (intervalDays(i, zone, now)[key] || 0) > 0),
    );
  const completed = work.filter(
    (i) => i.completed && dayKey(i.ended_at || i.started_at, zone) === key,
  ).length;
  const totalSeconds = loggedDays(sessions, entries, zone, now)[key] || 0;
  const adherence = work.length
    ? work.reduce(
        (n, i) => n + Math.min(1, i.duration_sec / i.planned_duration_sec),
        0,
      ) / work.length
    : 0;
  return {
    seconds: totalSeconds,
    minutes: Math.round((totalSeconds / 60) * 10) / 10,
    completed,
    started: work.length,
    rate: work.length ? Math.round((completed / work.length) * 100) : 0,
    score: work.length
      ? Math.round((completed / work.length) * adherence * 100)
      : 0,
    adherence: Math.round(adherence * 100),
  };
}
export function dailyStats(
  sessions: Timer[],
  date: Date,
  zone = deviceTimezone(),
  entries: ManualEntry[] = [],
  now = Date.now(),
) {
  return forDay(sessions, dayKey(date, zone), zone, now, entries);
}
export function daySeries(
  sessions: Timer[],
  count: number,
  now = new Date(),
  zone = deviceTimezone(),
  entries: ManualEntry[] = [],
) {
  return Array.from({ length: count }, (_, i) => {
    const key = addDays(dayKey(now, zone), -count + i + 1);
    return {
      date: key,
      label: new Date(key + "T12:00Z").toLocaleDateString(undefined, {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
      }),
      ...forDay(sessions, key, zone, now.getTime(), entries),
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
) {
  const all = sessions
      .map((s) => snapshot(s, now.getTime()))
      .flatMap((s) => s.intervals),
    work = all.filter((i) => i.type === "work"),
    breaks = all.filter((i) => i.type === "break");
  const seconds = work.reduce((n, i) => n + i.duration_sec, 0),
    totals = loggedDays(sessions, entries, zone, now.getTime());
  const fourteen = daySeries(sessions, 14, now, zone, entries),
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
