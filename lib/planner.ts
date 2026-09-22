import { snapshot, type Timer, type Interval } from "./timer/core";

export type Task = {
  id: string;
  name: string;
  targetMin: number;
  workMin: number;
  breakMin: number;
  days: number[];
  category: string;
  priority: "low" | "normal" | "high";
  notes: string;
  fields: { label: string; value: string }[];
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};
export type ManualEntry = {
  id: string;
  taskId: string | null;
  taskName: string;
  startedAt: string;
  endedAt: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};
export type Planner = {
  version: 1;
  timezone: string;
  plans: Record<string, Task[]>;
  checks: Record<string, string>;
  entries: ManualEntry[];
  notes: Record<string, string>;
};
export const emptyPlanner = (timezone = "UTC"): Planner => ({
  version: 1,
  timezone,
  plans: {},
  checks: {},
  entries: [],
  notes: {},
});
export const deviceTimezone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
export function validTimezone(zone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format();
    return true;
  } catch {
    return false;
  }
}
const formatters = new Map<string, Intl.DateTimeFormat>();
export function dayKey(time: number | string | Date, zone = deviceTimezone()) {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(zone, f);
  }
  const parts = f.formatToParts(new Date(time));
  return ["year", "month", "day"]
    .map((k) => parts.find((p) => p.type === k)!.value)
    .join("-");
}
export function addDays(day: string, amount: number) {
  return new Date(Date.parse(day + "T12:00:00Z") + amount * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function weekKey(day: string) {
  return addDays(day, -((new Date(day + "T12:00:00Z").getUTCDay() + 6) % 7));
}
export const weekDays = (week: string) =>
  Array.from({ length: 7 }, (_, i) => addDays(week, i));
export function tasksForWeek(p: Planner, week: string): Task[] {
  const key = Object.keys(p.plans)
    .filter((k) => k <= week)
    .sort()
    .at(-1);
  return key ? p.plans[key] : [];
}
export function setWeekTasks(p: Planner, week: string, tasks: Task[]): Planner {
  return { ...p, plans: { ...p.plans, [week]: tasks } };
}
export function formatStamp(time: string | number, zone: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(new Date(time));
}
export function localInput(time: string | number, zone: string) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(time));
  const get = (k: string) => parts.find((p) => p.type === k)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
// Resolve a wall-clock input without relying on the device's timezone. Reject
// nonexistent/ambiguous DST times instead of silently recording the wrong hour.
export function fromLocalInput(value: string, zone: string): string {
  const guess = Date.parse(value + ":00Z");
  if (!Number.isFinite(guess)) throw new Error("Enter a valid date and time.");
  const offsets = new Set<number>();
  for (const shift of [-86400000, 0, 86400000]) {
    const t = guess + shift;
    offsets.add(Date.parse(localInput(t, zone) + ":00Z") - t);
  }
  const matches = [...offsets]
    .map((offset) => guess - offset)
    .filter((t) => localInput(t, zone) === value);
  if (matches.length !== 1)
    throw new Error(
      matches.length
        ? "This time occurs twice during daylight saving. Choose a time outside the repeated hour."
        : "This local time does not exist due to daylight saving. Choose another time.",
    );
  return new Date(matches[0]).toISOString();
}
export function splitDays(
  start: number,
  end: number,
  zone: string,
): Record<string, number> {
  const result: Record<string, number> = {};
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return result;
  while (start < end) {
    const day = dayKey(start, zone);
    let boundary = Math.min(end, start + 36 * 3600000);
    if (dayKey(boundary - 1, zone) !== day) {
      let lo = start,
        hi = boundary;
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (dayKey(mid, zone) === day) lo = mid;
        else hi = mid;
      }
      boundary = hi;
    }
    result[day] = (result[day] || 0) + (boundary - start) / 1000;
    start = boundary;
  }
  return result;
}
export function intervalDays(i: Interval, zone: string, now: number) {
  const result: Record<string, number> = {};
  if (i.spans) {
    let budget = Math.max(0, i.duration_sec - (i.legacy_duration_sec || 0));
    for (const span of i.spans) {
      const start = Date.parse(span.started_at),
        end = Math.min(
          start + budget * 1000,
          Date.parse(
            span.ended_at || i.ended_at || new Date(now).toISOString(),
          ),
        );
      budget -= Math.max(0, end - start) / 1000;
      for (const [day, seconds] of Object.entries(splitDays(start, end, zone)))
        result[day] = (result[day] || 0) + seconds;
    }
    // Older intervals may already contain elapsed focus without timestamped spans.
    if (i.legacy_duration_sec)
      result[dayKey(i.started_at, zone)] =
        (result[dayKey(i.started_at, zone)] || 0) + i.legacy_duration_sec;
  } else result[dayKey(i.started_at, zone)] = i.duration_sec;
  return result;
}
export function loggedDays(
  sessions: Timer[],
  entries: ManualEntry[],
  zone: string,
  now: number,
  taskId?: string,
) {
  const totals: Record<string, number> = {};
  const add = (days: Record<string, number>) => {
    for (const [day, seconds] of Object.entries(days))
      totals[day] = (totals[day] || 0) + seconds;
  };
  for (const raw of sessions) {
    if (taskId !== undefined && raw.task_id !== taskId) continue;
    const s = raw.status ? raw : snapshot(raw, now);
    for (const i of s.intervals)
      if (i.type === "work") add(intervalDays(i, zone, now));
  }
  for (const e of entries)
    if (taskId === undefined || e.taskId === taskId)
      add(splitDays(Date.parse(e.startedAt), Date.parse(e.endedAt), zone));
  return totals;
}
export type LogIndex = {
  totals: Record<string, number>;
  extra: Record<string, number>;
  tasks: Record<string, Record<string, number>>;
  sessions: Record<string, Record<string, number>>;
  entries: Record<string, Record<string, number>>;
};
export function buildLogIndex(
  sessions: Timer[],
  entries: ManualEntry[],
  zone: string,
  now: number,
): LogIndex {
  const index: LogIndex = {
    totals: {},
    extra: {},
    tasks: {},
    sessions: {},
    entries: {},
  };
  const add = (
    target: Record<string, number>,
    days: Record<string, number>,
  ) => {
    for (const [day, seconds] of Object.entries(days))
      target[day] = (target[day] || 0) + seconds;
  };
  for (const raw of sessions) {
    const days: Record<string, number> = {};
    const session = raw.status ? raw : snapshot(raw, now);
    for (const interval of session.intervals)
      if (interval.type === "work")
        add(days, intervalDays(interval, zone, now));
    index.sessions[raw.id] = days;
    add(index.totals, days);
    if (raw.task_id) add((index.tasks[raw.task_id] ??= {}), days);
  }
  for (const entry of entries) {
    const days = splitDays(
      Date.parse(entry.startedAt),
      Date.parse(entry.endedAt),
      zone,
    );
    index.entries[entry.id] = days;
    add(index.totals, days);
    if (entry.taskId) add((index.tasks[entry.taskId] ??= {}), days);
    else add(index.extra, days);
  }
  return index;
}
export function weekSummary(
  p: Planner,
  week: string,
  sessions: Timer[],
  now: number,
  index = buildLogIndex(sessions, p.entries, p.timezone, now),
) {
  const tasks = tasksForWeek(p, week).filter((t) => !t.archived),
    days = weekDays(week);
  const logged = index.totals;
  const planned = days.map((_, i) =>
    tasks
      .filter((t) => t.days.includes(i))
      .reduce((n, t) => n + t.targetMin * 60, 0),
  );
  const actual = days.map((d) => logged[d] || 0);
  const target = planned.reduce((a, b) => a + b, 0),
    total = actual.reduce((a, b) => a + b, 0);
  const extraDays = index.extra;
  return {
    days,
    planned,
    actual,
    target,
    total,
    extra: days.reduce((n, d) => n + (extraDays[d] || 0), 0),
    remaining: Math.max(0, target - total),
    percent: target ? (total / target) * 100 : 0,
  };
}
const uuid = (v: unknown) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
const text = (v: unknown, max: number) =>
  typeof v === "string" && v.length <= max;
const stamp = (v: unknown) =>
  typeof v === "string" &&
  v.length <= 30 &&
  Number.isFinite(Date.parse(v)) &&
  /Z$/.test(v);
const date = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
const integer = (v: unknown, max: number) =>
  Number.isInteger(v) && Number(v) >= 1 && Number(v) <= max;
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
export function validPlanner(input: unknown): input is Planner {
  if (
    !record(input) ||
    input.version !== 1 ||
    typeof input.timezone !== "string" ||
    !validTimezone(input.timezone) ||
    !record(input.plans) ||
    !record(input.checks) ||
    !record(input.notes) ||
    !Array.isArray(input.entries)
  )
    return false;
  if (
    Object.keys(input.plans).length > 1000 ||
    Object.keys(input.checks).length > 50000 ||
    input.entries.length > 10000 ||
    Object.keys(input.notes).length > 1000
  )
    return false;
  for (const [week, tasks] of Object.entries(input.plans)) {
    if (
      !date(week) ||
      weekKey(week) !== week ||
      !Array.isArray(tasks) ||
      tasks.length > 100 ||
      new Set(tasks.map((t) => t?.id)).size !== tasks.length
    )
      return false;
    for (const t of tasks)
      if (
        !record(t) ||
        !uuid(t.id) ||
        !text(t.name, 100) ||
        !t.name ||
        !integer(t.targetMin, 1440) ||
        !integer(t.workMin, 180) ||
        !integer(t.breakMin, 60) ||
        !Array.isArray(t.days) ||
        t.days.length > 7 ||
        new Set(t.days).size !== t.days.length ||
        !t.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) ||
        !text(t.category, 60) ||
        !["low", "normal", "high"].includes(String(t.priority)) ||
        !text(t.notes, 2000) ||
        typeof t.archived !== "boolean" ||
        !stamp(t.createdAt) ||
        !stamp(t.updatedAt) ||
        !Array.isArray(t.fields) ||
        t.fields.length > 12 ||
        !t.fields.every(
          (f) => record(f) && text(f.label, 40) && text(f.value, 200),
        )
      )
        return false;
  }
  for (const [key, value] of Object.entries(input.checks))
    if (
      !date(key.slice(0, 10)) ||
      key[10] !== ":" ||
      !uuid(key.slice(11)) ||
      !stamp(value)
    )
      return false;
  for (const [key, value] of Object.entries(input.notes))
    if (!date(key) || weekKey(key) !== key || !text(value, 2000)) return false;
  if (new Set(input.entries.map((e) => e?.id)).size !== input.entries.length)
    return false;
  for (const e of input.entries)
    if (
      !record(e) ||
      !uuid(e.id) ||
      (e.taskId !== null && !uuid(e.taskId)) ||
      !text(e.taskName, 100) ||
      !text(e.notes, 2000) ||
      !stamp(e.createdAt) ||
      !stamp(e.updatedAt) ||
      !stamp(e.startedAt) ||
      !stamp(e.endedAt) ||
      Date.parse(String(e.endedAt)) <= Date.parse(String(e.startedAt)) ||
      Date.parse(String(e.endedAt)) - Date.parse(String(e.startedAt)) > 86400000
    )
      return false;
  return true;
}
