import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyFocus, filterTasks } from "../lib/focus-plan";
import type { LogIndex, Task } from "../lib/planner";
const task = (id: string, updates: Partial<Task> = {}): Task => ({
  id,
  name: id,
  category: "",
  notes: "",
  priority: "normal",
  targetMin: 30,
  workMin: 25,
  breakMin: 5,
  days: [0, 1, 2, 3, 4],
  fields: [],
  archived: false,
  createdAt: "",
  updatedAt: "",
  ...updates,
});
const logs = (tasks: LogIndex["tasks"] = {}): LogIndex => ({
  tasks,
  totals: {},
  extra: {},
  sessions: {},
  entries: {},
});
test("daily agenda hides archived and unscheduled tasks and prioritizes unfinished high priority work", () => {
  const items = dailyFocus(
    [
      task("normal"),
      task("finished", { priority: "high" }),
      task("high", { priority: "high" }),
      task("archived", { archived: true }),
      task("weekend", { days: [5, 6] }),
    ],
    "2026-11-25",
    {},
    logs({ finished: { "2026-11-25": 1800 } }),
  );
  assert.deepEqual(
    items.map((i) => i.task.id),
    ["high", "normal", "finished"],
  );
  assert.equal(items[2].goalMet, true);
  assert.equal(items[2].percent, 100);
});
test("manual completion stays distinct from logged minutes and over-target progress is capped", () => {
  const items = dailyFocus(
    [task("checked"), task("extra")],
    "2026-11-25",
    { "2026-11-25:checked": "timestamp" },
    logs({ extra: { "2026-11-25": 2400 } }),
  );
  assert.equal(items[0].checked, true);
  assert.equal(items[0].goalMet, false);
  assert.equal(items[0].seconds, 0);
  assert.equal(items[1].percent, 100);
  assert.equal(items[1].seconds, 2400);
});
test("task search matches every word across name, category and notes without mutating the plan", () => {
  const tasks = [
    task("Study", { category: "Language", notes: "German practice" }),
    task("Client work"),
  ];
  assert.deepEqual(
    filterTasks(tasks, "  GERMAN language  ").map((t) => t.id),
    ["Study"],
  );
  assert.equal(filterTasks(tasks, "missing").length, 0);
  assert.equal(filterTasks(tasks, "  ").length, 2);
  assert.equal(tasks.length, 2);
  assert.equal(
    dailyFocus([task("weekend", { days: [6] })], "2026-11-29", {}, logs())
      .length,
    1,
  );
});
