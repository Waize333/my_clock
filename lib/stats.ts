import { snapshot, type Timer } from "./timer/core";
export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function dailyStats(sessions: Timer[], date: Date) {
  const work = sessions
    .map((s) => snapshot(s, Date.now()))
    .flatMap((s) => s.intervals)
    .filter(
      (i) =>
        i.type === "work" && dateKey(new Date(i.started_at)) === dateKey(date),
    );
  const completed = work.filter((i) => i.completed).length;
  const totalSeconds = work.reduce((n, i) => n + i.duration_sec, 0);
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
export function daySeries(sessions: Timer[], count: number, now = new Date()) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - count + index + 1);
    return {
      date: dateKey(date),
      label: date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      ...dailyStats(sessions, date),
    };
  });
}
export function longestStreak(sessions: Timer[]) {
  const dates = [
    ...new Set(
      sessions
        .flatMap((s) => s.intervals)
        .filter((i) => i.type === "work" && i.completed)
        .map((i) => dateKey(new Date(i.started_at))),
    ),
  ].sort();
  let longest = 0,
    current = 0,
    last = 0;
  for (const key of dates) {
    const day = Date.parse(`${key}T00:00:00Z`) / 86400000;
    current = day === last + 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
    last = day;
  }
  return longest;
}

export function extraStats(sessions: Timer[], now = new Date()) {
  const all = sessions
    .map((s) => snapshot(s, now.getTime()))
    .flatMap((s) => s.intervals);
  const work = all.filter((i) => i.type === "work");
  const breaks = all.filter((i) => i.type === "break");
  const seconds = work.reduce((n, i) => n + i.duration_sec, 0);
  const days = new Set(
    work
      .filter((i) => i.duration_sec > 0)
      .map((i) => dateKey(new Date(i.started_at))),
  ).size;
  const fourteen = daySeries(sessions, 14, now);
  const thisWeek = fourteen.slice(7).reduce((n, d) => n + d.minutes, 0);
  const lastWeek = fourteen.slice(0, 7).reduce((n, d) => n + d.minutes, 0);
  return {
    totalMinutes: Math.round(seconds / 60),
    activeDays: days,
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
