import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { begin, act, advance, snapshot } from "../lib/timer/core";
import {
  emptyPlanner,
  dayKey,
  splitDays,
  fromLocalInput,
  weekKey,
  weekSummary,
  loggedDays,
  tasksForWeek,
  setWeekTasks,
  validPlanner,
  type Task,
} from "../lib/planner";
const id = () => randomUUID();
const ms = (s: string) => Date.parse(s);
const task = (): Task => ({
  id: id(),
  name: "Coursework",
  targetMin: 120,
  workMin: 25,
  breakMin: 5,
  days: [0, 1, 2, 3, 4],
  category: "Study",
  priority: "normal",
  notes: "Read chapter 1",
  fields: [{ label: "Module", value: "Biology" }],
  archived: false,
  createdAt: "2026-09-22T10:00:00.000Z",
  updatedAt: "2026-09-22T10:00:00.000Z",
});
test("real UTC timestamps allocate across local midnight and preserve partial resets", () => {
  const start = ms("2026-09-22T18:50:00Z"),
    stop = ms("2026-09-22T19:10:00Z");
  const t = act(begin(50, 10, start, id), "reset", stop, id);
  assert.deepEqual(loggedDays([t], [], "Asia/Karachi", stop), {
    "2026-09-22": 600,
    "2026-09-23": 600,
  });
  assert.equal(dayKey(start, "Asia/Karachi"), "2026-09-22");
});
test("pauses spanning midnight do not count and resumed work belongs to its actual day", () => {
  let t = begin(50, 10, ms("2026-09-22T18:40:00Z"), id);
  t = act(t, "pause", ms("2026-09-22T18:50:00Z"), id);
  t = act(t, "resume", ms("2026-09-23T05:00:00Z"), id);
  t = act(t, "finish", ms("2026-09-23T05:05:00Z"), id);
  assert.deepEqual(
    loggedDays(
      [JSON.parse(JSON.stringify(t))],
      [],
      "Asia/Karachi",
      ms(t.ended_at!),
    ),
    { "2026-09-22": 600, "2026-09-23": 300 },
  );
  assert.equal(t.intervals[0].spans?.length, 2);
  assert.equal(t.intervals[0].duration_sec, 900);
});
test("automatic transitions and skipping while paused retain accurate active ranges", () => {
  const start = ms("2026-09-22T10:00:00Z");
  let t = advance(begin(1, 1, start, id), start + 150000, id).timer;
  assert.equal(loggedDays([t], [], "UTC", start + 150000)["2026-09-22"], 90);
  t = act(t, "pause", start + 150000, id);
  t = act(t, "skip", start + 300000, id);
  assert.equal(t.running, false);
  assert.deepEqual(t.intervals.at(-1)?.spans, []);
  t = act(t, "resume", start + 600000, id);
  t = act(t, "finish", start + 630000, id);
  assert.equal(loggedDays([t], [], "UTC", start + 630000)["2026-09-22"], 90);
});
test("day boundaries handle both 23-hour and 25-hour daylight-saving days", () => {
  assert.equal(
    splitDays(
      ms("2026-03-08T05:00:00Z"),
      ms("2026-03-09T04:00:00Z"),
      "America/New_York",
    )["2026-03-08"],
    23 * 3600,
  );
  assert.equal(
    splitDays(
      ms("2026-11-01T04:00:00Z"),
      ms("2026-11-02T05:00:00Z"),
      "America/New_York",
    )["2026-11-01"],
    25 * 3600,
  );
  assert.equal(
    fromLocalInput("2026-09-22T23:30", "Asia/Karachi"),
    "2026-09-22T18:30:00.000Z",
  );
  assert.throws(
    () => fromLocalInput("2026-03-08T02:30", "America/New_York"),
    /does not exist/,
  );
  assert.throws(
    () => fromLocalInput("2026-11-01T01:30", "America/New_York"),
    /occurs twice/,
  );
});
test("schedule edits and archives apply from their week and never rewrite earlier plans", () => {
  const t = task();
  let p = setWeekTasks(emptyPlanner("UTC"), "2026-09-21", [t]);
  p = setWeekTasks(p, "2026-09-28", [{ ...t, targetMin: 60 }]);
  p = setWeekTasks(p, "2026-10-05", [{ ...t, archived: true }]);
  assert.equal(tasksForWeek(p, "2026-09-21")[0].targetMin, 120);
  assert.equal(tasksForWeek(p, "2026-09-28")[0].targetMin, 60);
  assert.equal(tasksForWeek(p, "2026-10-12")[0].archived, true);
  assert.equal(weekKey("2026-10-04"), "2026-09-28");
  assert.equal(weekSummary(p, "2026-09-21", [], Date.now()).target, 10 * 3600);
});
test("completion checkmarks add no time; manual entries split by date and extra time counts once", () => {
  const t = task();
  const p = setWeekTasks(emptyPlanner("UTC"), "2026-09-21", [t]);
  p.checks[`2026-09-22:${t.id}`] = "2026-09-22T10:00:00.000Z";
  assert.equal(weekSummary(p, "2026-09-21", [], Date.now()).total, 0);
  p.entries.push({
    id: id(),
    taskId: null,
    taskName: "Extra",
    startedAt: "2026-09-22T23:30:00.000Z",
    endedAt: "2026-09-23T00:30:00.000Z",
    createdAt: "2026-09-23T00:30:00.000Z",
    updatedAt: "2026-09-23T00:30:00.000Z",
    notes: "",
  });
  const s = weekSummary(p, "2026-09-21", [], Date.now());
  assert.equal(s.total, 3600);
  assert.equal(s.extra, 3600);
  assert.equal(s.actual[1], 1800);
  assert.equal(s.actual[2], 1800);
  assert.equal(s.percent, 10);
  assert.equal(validPlanner(p), true);
});
test("planner rejects invalid zones, dates, durations, duplicate task IDs and malformed fields", () => {
  const t = task();
  const p = setWeekTasks(emptyPlanner("UTC"), "2026-09-21", [t]);
  assert.equal(validPlanner(p), true);
  assert.equal(validPlanner({ ...p, timezone: "Nowhere/Fiction" }), false);
  assert.equal(validPlanner({ ...p, plans: { "2026-09-22": [t] } }), false);
  assert.equal(validPlanner({ ...p, plans: { "2026-09-21": [t, t] } }), false);
  assert.equal(
    validPlanner({ ...p, plans: { "2026-09-21": [{ ...t, workMin: 0 }] } }),
    false,
  );
  assert.equal(
    validPlanner({ ...p, plans: { "2026-09-21": [{ ...t, fields: [null] }] } }),
    false,
  );
});
test("live snapshot counts only elapsed focus", () => {
  const start = ms("2026-09-22T10:00:00Z"),
    t = begin(25, 5, start, id);
  assert.equal(snapshot(t, start + 90000).intervals[0].duration_sec, 90);
  assert.equal(loggedDays([t], [], "UTC", start + 90000)["2026-09-22"], 90);
});
