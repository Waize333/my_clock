import { test } from "node:test";
import assert from "node:assert/strict";
import {
  begin,
  advance,
  act,
  remaining,
  snapshot,
  extendWork,
} from "../lib/timer/core";
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

test("focus extensions preserve actual time and delay the break without changing presets", () => {
  const original = begin(10, 3, 0, id);
  const extended = extendWork(original, 2, 4 * 60000);
  assert.equal(remaining(extended, 4 * 60000), 8 * 60000);
  assert.equal(snapshot(extended, 4 * 60000).intervals[0].duration_sec, 240);
  assert.equal(original.intervals[0].planned_duration_sec, 600);
  assert.equal(advance(extended, 10 * 60000, id).transitions.length, 0);
  const result = advance(extended, 12 * 60000, id);
  assert.deepEqual(result.transitions, ["break"]);
  assert.equal(result.timer.intervals[0].duration_sec, 720);
  assert.equal(remaining(result.timer, 12 * 60000), 3 * 60000);
  const next = advance(result.timer, 15 * 60000, id).timer;
  assert.equal(next.phase, "work");
  assert.equal(next.intervals.at(-1)!.planned_duration_sec, 600);
});
test("paused extensions survive refresh, repeated extensions, resume and partial reset", () => {
  const paused = act(begin(10, 3, 0, id), "pause", 60000, id);
  const extended = extendWork(extendWork(paused, 2, 600000), 5, 900000);
  const restored = JSON.parse(JSON.stringify(extended));
  assert.equal(restored.running, false);
  assert.equal(remaining(restored, 900000), 16 * 60000);
  assert.equal(snapshot(restored, 900000).intervals[0].duration_sec, 60);
  const resumed = act(restored, "resume", 900000, id);
  assert.equal(
    act(resumed, "reset", 960000, id).intervals[0].duration_sec,
    120,
  );
});
test("extension cannot revive expired or finished work, extend breaks, or exceed limits", () => {
  const t = begin(1, 1, 0, id);
  assert.equal(extendWork(t, 2, 60000), t);
  const rest = advance(t, 60000, id).timer;
  assert.equal(extendWork(rest, 5, 60000), rest);
  const done = act(t, "finish", 30000, id);
  assert.equal(extendWork(done, 2, 30000), done);
  const max = begin(179, 1, 0, id);
  assert.equal(extendWork(max, 2, 1000), max);
  assert.equal(
    extendWork(begin(178, 1, 0, id), 2, 0).intervals[0].planned_duration_sec,
    10800,
  );
});

test("extending older saved timers preserves their original elapsed spans", () => {
  const t = begin(10, 3, 0, id);
  delete t.intervals[0].spans;
  t.remainingMs = 9 * 60000;
  t.anchor = 60000;
  const extended = extendWork(t, 2, 120000);
  assert.equal(extended.intervals[0].legacy_duration_sec, 60);
  assert.equal(
    extended.intervals[0].spans![0].started_at,
    new Date(60000).toISOString(),
  );
  assert.equal(snapshot(extended, 120000).intervals[0].duration_sec, 120);
});
