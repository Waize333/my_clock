import { test } from "node:test";
import assert from "node:assert/strict";
import { begin, advance, act, remaining, snapshot } from "../lib/timer/core";
import { dailyStats, longestStreak } from "../lib/stats";
let counter = 0;
const id = () => `id-${counter++}`;
test("recovers multiple background boundaries without clock drift", () => {
  const t = begin(50, 10, 0, id);
  const result = advance(t, 125 * 60000, id);
  assert.deepEqual(result.transitions, ["break", "work", "break", "work"]);
  assert.equal(remaining(result.timer, 125 * 60000), 45 * 60000);
  assert.equal(result.timer.intervals.length, 5);
  assert.equal(new Set(result.timer.intervals.map((i) => i.id)).size, 5);
  assert.equal(advance(result.timer, 125 * 60000, id).transitions.length, 0);
});
test("pause excludes idle wall time and resumes at the exact remainder", () => {
  const t = act(begin(50, 10, 0, id), "pause", 5 * 60000, id);
  assert.equal(remaining(t, 500 * 60000), 45 * 60000);
  const resumed = act(t, "resume", 500 * 60000, id);
  const done = advance(resumed, 545 * 60000, id).timer;
  assert.equal(done.phase, "break");
  assert.equal(done.intervals[0].duration_sec, 3000);
});
test("skip records partial work and does not mark it complete", () => {
  const t = act(begin(50, 10, 0, id), "skip", 120000, id);
  assert.equal(t.intervals[0].duration_sec, 120);
  assert.equal(t.intervals[0].completed, false);
  assert.equal(t.phase, "break");
});
test("finish and reset have distinct status and preserve actual duration", () => {
  for (const action of ["finish", "reset"] as const) {
    const t = act(begin(50, 10, 0, id), action, 90000, id);
    assert.equal(t.status, action === "finish" ? "completed" : "abandoned");
    assert.equal(t.intervals[0].duration_sec, 90);
    assert.equal(t.running, false);
    assert.equal(advance(t, 99999999, id).transitions.length, 0);
  }
});
test("serialized state recovers; snapshot does not mutate live state", () => {
  const t = begin(50, 10, 10000, id);
  assert.equal(snapshot(t, 70000).intervals[0].duration_sec, 60);
  assert.equal(t.intervals[0].duration_sec, 0);
  const loaded = JSON.parse(JSON.stringify(t));
  assert.equal(remaining(advance(loaded, 3010000, id).timer, 3010000), 600000);
});
test("stats count completed intervals, actual minutes, adherence, and consecutive days", () => {
  const start = new Date(2026, 8, 20, 12).getTime();
  const first = act(
    advance(begin(1, 1, start, id), start + 60000, id).timer,
    "finish",
    start + 60000,
    id,
  );
  const second = act(
    begin(1, 1, start + 120000, id),
    "finish",
    start + 150000,
    id,
  );
  const stats = dailyStats([first, second], new Date(start));
  assert.equal(stats.minutes, 1.5);
  assert.equal(stats.completed, 1);
  assert.equal(stats.rate, 50);
  assert.equal(stats.score, 38);
  const next = structuredClone(first);
  next.intervals[0].started_at = new Date(2026, 8, 21, 12).toISOString();
  assert.equal(longestStreak([first, next]), 2);
});

test("reset partial focus and live unfinished focus count toward total time", () => {
  const now = Date.now();
  const reset = act(begin(50, 10, now - 120000, id), "reset", now, id);
  const live = begin(50, 10, now - 60000, id);
  const stats = dailyStats([reset, live], new Date(now));
  assert.equal(stats.minutes, 3);
  assert.equal(stats.completed, 0);
});
test("invalid or zero durations cannot start an infinite transition loop", () => {
  assert.throws(() => begin(0, 10, 0, id));
  assert.throws(() => begin(50, 0, 0, id));
  assert.throws(() => begin(NaN, 10, 0, id));
});
