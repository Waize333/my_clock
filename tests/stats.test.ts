import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { begin, act } from "../lib/timer/core";
import {
  buildLogIndex,
  emptyPlanner,
  weekSummary,
  type ManualEntry,
} from "../lib/planner";
import {
  buildDailyIndex,
  daySeries,
  dailyStats,
  extraStats,
} from "../lib/stats";

test("shared indexes retain partial work, midnight allocations and manual entries", () => {
  const start = Date.parse("2026-09-22T23:50:00Z");
  const end = start + 20 * 60000;
  const session = act(
    begin(50, 10, start, randomUUID),
    "reset",
    end,
    randomUUID,
  );
  session.task_id = "coursework";
  const entry: ManualEntry = {
    id: randomUUID(),
    taskId: null,
    taskName: "Extra reading",
    notes: "",
    startedAt: "2026-09-23T10:00:00Z",
    endedAt: "2026-09-23T10:30:00Z",
    createdAt: "2026-09-23T10:30:00Z",
    updatedAt: "2026-09-23T10:30:00Z",
  };
  const now = Date.parse(entry.endedAt);
  const planner = { ...emptyPlanner("UTC"), entries: [entry] };
  const logs = buildLogIndex([session], [entry], "UTC", now);
  assert.deepEqual(logs.totals, { "2026-09-22": 600, "2026-09-23": 2400 });
  assert.deepEqual(logs.tasks.coursework, {
    "2026-09-22": 600,
    "2026-09-23": 600,
  });
  assert.deepEqual(logs.extra, { "2026-09-23": 1800 });
  assert.equal(
    weekSummary(planner, "2026-09-21", [session], now, logs).total,
    3000,
  );
  const daily = buildDailyIndex([session], [entry], "UTC", now);
  assert.equal(
    dailyStats([session], new Date(now), "UTC", [entry], now, daily).minutes,
    40,
  );
  assert.equal(
    dailyStats([session], new Date(now), "UTC", [entry], now, daily).completed,
    0,
  );
  assert.deepEqual(
    daySeries([session], 2, new Date(now), "UTC", [entry], daily).map(
      (d) => d.minutes,
    ),
    [10, 40],
  );
  assert.equal(
    extraStats([session], new Date(now), "UTC", [entry], daily).totalMinutes,
    50,
  );
});

test("completed spans are not truncated by a rounded analytics clock", () => {
  const start = Date.parse("2026-09-22T12:00:00Z");
  const session = act(
    begin(25, 5, start, randomUUID),
    "finish",
    start + 45000,
    randomUUID,
  );
  assert.equal(
    buildLogIndex([session], [], "UTC", start).totals["2026-09-22"],
    45,
  );
});
