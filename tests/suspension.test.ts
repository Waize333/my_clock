import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { begin, act } from "../lib/timer/core";
import { pauseAfterInterruption } from "../lib/timer/suspension";
const start = Date.parse("2026-09-28T10:00:00Z");
test("sleep pauses at the last heartbeat without creating hours of extra intervals", () => {
  const timer = begin(25, 5, start, randomUUID);
  const heartbeat = {
    sessionId: timer.id,
    at: start + 60000,
    wall: start + 60000,
  };
  const paused = pauseAfterInterruption(
    timer,
    heartbeat,
    start + 8 * 3600000,
    randomUUID,
  );
  assert.equal(paused.running, false);
  assert.equal(paused.intervals.length, 1);
  assert.equal(paused.intervals[0].duration_sec, 60);
  assert.equal(paused.remainingMs, 24 * 60000);
  const resumed = act(paused, "resume", start + 8 * 3600000, randomUUID);
  const finished = act(
    resumed,
    "finish",
    start + 8 * 3600000 + 60000,
    randomUUID,
  );
  assert.equal(finished.intervals[0].duration_sec, 120);
});
test("ordinary background throttling does not pause a timer", () => {
  const timer = begin(25, 5, start, randomUUID);
  assert.equal(
    pauseAfterInterruption(
      timer,
      { sessionId: timer.id, at: start, wall: start },
      start + 60000,
      randomUUID,
    ),
    timer,
  );
});
test("restored sessions with missing or unrelated heartbeats pause conservatively", () => {
  const timer = begin(25, 5, start, randomUUID);
  for (const heartbeat of [
    undefined,
    { sessionId: "other", at: start + 60000, wall: start + 60000 },
  ]) {
    const result = pauseAfterInterruption(
      timer,
      heartbeat,
      start + 3600000,
      randomUUID,
    );
    assert.equal(result.running, false);
    assert.equal(result.intervals[0].duration_sec, 0);
  }
});
test("paused sessions remain unchanged after sleep", () => {
  const paused = act(
    begin(25, 5, start, randomUUID),
    "pause",
    start + 60000,
    randomUUID,
  );
  assert.equal(
    pauseAfterInterruption(paused, undefined, start + 3600000, randomUUID),
    paused,
  );
});
