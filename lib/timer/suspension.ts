import { act, type Timer } from "./core";

// Background tabs can be throttled to one tick per minute. A longer gap
// indicates suspension; do not invent work/break cycles during that gap.
export const SUSPENSION_GAP_MS = 90_000;
export type Heartbeat = { sessionId: string; at: number; wall: number };
export function pauseAfterInterruption(
  timer: Timer,
  heartbeat: Heartbeat | undefined,
  wall: number,
  id: () => string,
): Timer {
  if (!timer.running || timer.status) return timer;
  const known = heartbeat?.sessionId === timer.id ? heartbeat : undefined;
  if (known && wall - known.wall <= SUSPENSION_GAP_MS && wall >= known.wall)
    return timer;
  return act(
    timer,
    "pause",
    Math.max(timer.anchor, known?.at ?? timer.anchor),
    id,
  );
}
