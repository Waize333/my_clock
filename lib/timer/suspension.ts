import { act, type Timer } from "./core";

// A callback gap alone cannot distinguish minimized tabs from sleep.
// Compare clocks within the same document; use a conservative fallback on restore.
export const SUSPENSION_GAP_MS = 90_000;
export type Heartbeat = {
  sessionId: string;
  at: number;
  wall: number;
  mono?: number;
};
export function pauseAfterInterruption(
  timer: Timer,
  heartbeat: Heartbeat | undefined,
  wall: number,
  id: () => string,
  mono?: number,
): Timer {
  if (!timer.running || timer.status) return timer;
  const known = heartbeat?.sessionId === timer.id ? heartbeat : undefined;
  if (known) {
    const wallGap = wall - known.wall;
    if (mono !== undefined && known.mono !== undefined) {
      // On supported platforms the monotonic clock stops during OS sleep,
      // but keeps advancing when callbacks are throttled in the background.
      const clockStopped = wallGap - (mono - known.mono) > 5000;
      if (!clockStopped && wallGap >= 0) return timer;
    } else if (wallGap <= SUSPENSION_GAP_MS && wallGap >= 0) return timer;
  }
  return act(
    timer,
    "pause",
    Math.max(timer.anchor, known?.at ?? timer.anchor),
    id,
  );
}
