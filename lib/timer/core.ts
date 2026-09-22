export type Phase = "work" | "break";
export type Interval = {
  id: string;
  session_id: string;
  type: Phase;
  started_at: string;
  ended_at: string | null;
  duration_sec: number;
  planned_duration_sec: number;
  completed: boolean;
  spans?: { started_at: string; ended_at: string | null }[];
  legacy_duration_sec?: number;
};
export type Timer = {
  id: string;
  task_id?: string;
  task_name?: string;
  task_target_min?: number;
  started_at: string;
  ended_at: string | null;
  planned_work_min: number;
  planned_break_min: number;
  status: "completed" | "abandoned" | null;
  phase: Phase;
  running: boolean;
  remainingMs: number;
  anchor: number;
  intervals: Interval[];
  revision: number;
};
const iso = (n: number) => new Date(n).toISOString();
export function begin(
  work: number,
  rest: number,
  now: number,
  id: () => string,
): Timer {
  if (
    !Number.isInteger(work) ||
    work < 1 ||
    work > 180 ||
    !Number.isInteger(rest) ||
    rest < 1 ||
    rest > 60
  )
    throw new Error("Invalid timer duration");
  const sessionId = id();
  return {
    id: sessionId,
    started_at: iso(now),
    ended_at: null,
    planned_work_min: work,
    planned_break_min: rest,
    status: null,
    phase: "work",
    running: true,
    remainingMs: work * 60000,
    anchor: now,
    revision: 0,
    intervals: [
      {
        id: id(),
        session_id: sessionId,
        type: "work",
        started_at: iso(now),
        ended_at: null,
        duration_sec: 0,
        planned_duration_sec: work * 60,
        completed: false,
        spans: [{ started_at: iso(now), ended_at: null }],
      },
    ],
  };
}
export function remaining(t: Timer, now: number) {
  return Math.max(
    0,
    t.remainingMs - (t.running ? Math.max(0, now - t.anchor) : 0),
  );
}
export function advance(
  timer: Timer,
  now: number,
  id: () => string,
): { timer: Timer; transitions: Phase[] } {
  let t = structuredClone(timer);
  const transitions: Phase[] = [];
  if (!t.running || t.status) return { timer: t, transitions };
  while (now >= t.anchor + t.remainingMs) {
    const boundary = t.anchor + t.remainingMs;
    const last = t.intervals[t.intervals.length - 1];
    closeSpan(last, boundary);
    last.ended_at = iso(boundary);
    last.completed = true;
    last.duration_sec = last.planned_duration_sec;
    const phase = t.phase === "work" ? "break" : "work";
    const seconds =
      (phase === "work" ? t.planned_work_min : t.planned_break_min) * 60;
    t = { ...t, phase, anchor: boundary, remainingMs: seconds * 1000 };
    t.intervals.push({
      id: id(),
      session_id: t.id,
      type: phase,
      started_at: iso(boundary),
      ended_at: null,
      duration_sec: 0,
      planned_duration_sec: seconds,
      completed: false,
      spans: [{ started_at: iso(boundary), ended_at: null }],
    });
    transitions.push(phase);
  }
  return { timer: t, transitions };
}
export function act(
  timer: Timer,
  action: "pause" | "resume" | "skip" | "finish" | "reset",
  now: number,
  id: () => string,
): Timer {
  const t = advance(timer, now, id).timer;
  if (t.status) return t;
  const left = remaining(t, now);
  const current = t.intervals[t.intervals.length - 1];
  if (!current.spans) {
    current.legacy_duration_sec = Math.max(
      0,
      current.planned_duration_sec - t.remainingMs / 1000,
    );
    current.spans = t.running
      ? [{ started_at: iso(t.anchor), ended_at: null }]
      : [];
  }
  current.duration_sec = Math.max(
    0,
    current.planned_duration_sec - left / 1000,
  );
  if (action === "pause") {
    closeSpan(current, now);
    return { ...t, remainingMs: left, anchor: now, running: false };
  }
  if (action === "resume") {
    if (!t.running)
      current.spans.push({ started_at: iso(now), ended_at: null });
    return { ...t, remainingMs: left, anchor: now, running: true };
  }
  closeSpan(current, now);
  current.ended_at = iso(now);
  if (action === "finish" || action === "reset")
    return {
      ...t,
      running: false,
      remainingMs: left,
      anchor: now,
      ended_at: iso(now),
      status: action === "finish" ? "completed" : "abandoned",
    };
  const phase = t.phase === "work" ? "break" : "work";
  const seconds =
    (phase === "work" ? t.planned_work_min : t.planned_break_min) * 60;
  t.intervals.push({
    id: id(),
    session_id: t.id,
    type: phase,
    started_at: iso(now),
    ended_at: null,
    duration_sec: 0,
    planned_duration_sec: seconds,
    completed: false,
    spans: t.running ? [{ started_at: iso(now), ended_at: null }] : [],
  });
  return { ...t, phase, remainingMs: seconds * 1000, anchor: now };
}
function closeSpan(interval: Interval, now: number) {
  const span = interval.spans?.at(-1);
  if (span && !span.ended_at) span.ended_at = iso(now);
}
export function snapshot(t: Timer, now: number): Timer {
  const copy = structuredClone(t);
  if (!copy.status) {
    const last = copy.intervals[copy.intervals.length - 1];
    last.duration_sec = Math.max(
      0,
      last.planned_duration_sec - remaining(copy, now) / 1000,
    );
  }
  return copy;
}
