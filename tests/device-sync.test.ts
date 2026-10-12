import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { begin, act } from "../lib/timer/core";
import { mergeSessionUpdates } from "../lib/timer/sync";
import { normalizeDeviceSettings } from "../lib/device-settings";
import { buildLogIndex } from "../lib/planner";
test("two device sessions contribute to one history without duplicates", () => {
  const now = Date.parse("2026-10-12T10:00Z");
  const a = act(
    begin(25, 5, now, randomUUID),
    "finish",
    now + 60000,
    randomUUID,
  );
  const b = act(
    begin(50, 10, now, randomUUID),
    "finish",
    now + 120000,
    randomUUID,
  );
  a.device_id = randomUUID();
  b.device_id = randomUUID();
  const updates = [
    { timer_state: a, revision: 2 },
    { timer_state: b, revision: 2 },
  ];
  const merged = mergeSessionUpdates([a], { [a.id]: 2 }, {}, updates);
  const again = mergeSessionUpdates(
    merged.sessions,
    merged.revisions,
    {},
    updates,
  );
  assert.equal(again.sessions.length, 2);
  assert.equal(
    buildLogIndex(again.sessions, [], "UTC", now + 120000).totals["2026-10-12"],
    180,
  );
});
test("incoming progress cannot overwrite pending edits or a newer revision", () => {
  const local = begin(25, 5, 0, randomUUID),
    remote = act(local, "pause", 60000, randomUUID);
  const pending = mergeSessionUpdates(
    [local],
    { [local.id]: 1 },
    { [local.id]: local },
    [{ timer_state: remote, revision: 2 }],
  );
  assert.equal(pending.sessions[0], local);
  assert.equal(pending.revisions[local.id], 1);
  const stale = mergeSessionUpdates([remote], { [local.id]: 3 }, {}, [
    { timer_state: local, revision: 2 },
  ]);
  assert.equal(stale.sessions[0], remote);
});
test("device defaults and reminders can differ without changing each other", () => {
  const laptop = normalizeDeviceSettings({
    default_work_min: 50,
    theme_pref: "dark",
    reminders: {
      sound: true,
      popup: true,
      vibration: false,
      notifications: false,
      volume: 0.7,
    },
  });
  const phone = normalizeDeviceSettings({
    default_work_min: 25,
    theme_pref: "light",
    reminders: {
      sound: false,
      popup: true,
      vibration: true,
      notifications: false,
      volume: 0.2,
    },
  });
  assert.equal(laptop.default_work_min, 50);
  assert.equal(phone.default_work_min, 25);
  assert.equal(laptop.reminders.sound, true);
  assert.equal(phone.reminders.sound, false);
  assert.equal(
    normalizeDeviceSettings({ ...phone, default_work_min: 0 }).default_work_min,
    50,
  );
});
