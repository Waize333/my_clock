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
