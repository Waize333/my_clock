import type { Timer } from "./core";
export type SessionRow = { timer_state: Timer; revision: number };
export function mergeSessionUpdates(
  sessions: Timer[],
  revisions: Record<string, number>,
  pending: Record<string, Timer>,
  rows: SessionRow[],
) {
  const merged = new Map(sessions.map((s) => [s.id, s]));
  const next = { ...revisions };
  for (const row of rows) {
    const id = row.timer_state.id;
    if (pending[id] || Number(row.revision) < (next[id] || 0)) continue;
    merged.set(id, row.timer_state);
    next[id] = Number(row.revision);
  }
  return {
    sessions: [...merged.values()].sort((a, b) =>
      b.started_at.localeCompare(a.started_at),
    ),
    revisions: next,
  };
}

export type SessionWrite = { timer: Timer; expectedRevision: number };

// Postgres JSON object ordering differs from browser serialization.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export function sameSavedWrite(a: Timer, b: Timer) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
function sameLegacyState(a: Timer, b: Timer) {
  const logical = (t: Timer) => {
    const state = structuredClone(t) as Partial<Timer>;
    delete state.revision;
    delete state.sync_write_id;
    state.intervals = t.intervals.map((i) => {
      const interval = { ...i } as Partial<typeof i>;
      if (!i.ended_at) delete interval.duration_sec;
      return interval as typeof i;
    });
    return state;
  };
  return (
    JSON.stringify(canonical(logical(a))) ===
    JSON.stringify(canonical(logical(b)))
  );
}

export function reconcileSessionWrite(
  pending: Timer,
  baseRevision: number,
  attempt: SessionWrite | undefined,
  remote: SessionRow | undefined,
): {
  kind: "retry" | "acknowledged" | "conflict";
  revision: number;
  clearPending?: boolean;
} {
  const revision = Number(remote?.revision ?? 0);
  if (revision === baseRevision) return { kind: "retry", revision };
  if (remote && revision === baseRevision + 1) {
    if (
      attempt &&
      attempt.expectedRevision === baseRevision &&
      sameSavedWrite(attempt.timer, remote.timer_state)
    )
      return {
        kind: "acknowledged",
        revision,
        clearPending: pending.sync_write_id === attempt.timer.sync_write_id,
      };
    // Recover old cached saves without a write ID only when the logical state is identical.
    if (
      !pending.sync_write_id &&
      !attempt &&
      sameLegacyState(pending, remote.timer_state)
    )
      return { kind: "acknowledged", revision, clearPending: true };
  }
  return { kind: "conflict", revision };
}

export function selectAccountVersion<
  T extends {
    sessions: Timer[];
    pending: Record<string, Timer>;
    revisions: Record<string, number>;
    attempts?: Record<string, SessionWrite>;
  },
>(cache: T, conflicts: ReadonlySet<string>): T {
  const next = structuredClone(cache);
  for (const id of conflicts) {
    delete next.pending[id];
    delete next.revisions[id];
    if (next.attempts) delete next.attempts[id];
  }
  next.sessions = next.sessions.filter((s) => !conflicts.has(s.id));
  return next;
}
