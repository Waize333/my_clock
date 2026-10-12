import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { begin, act } from "../lib/timer/core";
import {
  mergeSessionUpdates,
  reconcileSessionWrite,
  sameSavedWrite,
  selectAccountVersion,
} from "../lib/timer/sync";
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

test("lost save responses are acknowledged after refresh without duplicating progress", () => {
  const pending = begin(25, 5, 0, randomUUID);
  pending.sync_write_id = randomUUID();
  const attempt = { timer: structuredClone(pending), expectedRevision: 1 };
  const remote = {
    timer_state: JSON.parse(JSON.stringify(attempt.timer)),
    revision: 2,
  };
  assert.deepEqual(reconcileSessionWrite(pending, 1, attempt, remote), {
    kind: "acknowledged",
    revision: 2,
    clearPending: true,
  });
  const edited = act(pending, "pause", 10000, randomUUID);
  edited.sync_write_id = randomUUID();
  assert.deepEqual(reconcileSessionWrite(edited, 1, attempt, remote), {
    kind: "acknowledged",
    revision: 2,
    clearPending: false,
  });
  assert.deepEqual(reconcileSessionWrite(edited, 2, undefined, remote), {
    kind: "retry",
    revision: 2,
  });
});
test("genuine concurrent edits stay protected instead of being silently rebased", () => {
  const pending = begin(25, 5, 0, randomUUID);
  pending.sync_write_id = randomUUID();
  const attempt = { timer: structuredClone(pending), expectedRevision: 1 };
  const different = act(pending, "pause", 30000, randomUUID);
  different.sync_write_id = randomUUID();
  assert.equal(
    reconcileSessionWrite(pending, 1, attempt, {
      timer_state: different,
      revision: 2,
    }).kind,
    "conflict",
  );
  assert.equal(
    reconcileSessionWrite(pending, 1, attempt, {
      timer_state: pending,
      revision: 3,
    }).kind,
    "conflict",
  );
  assert.equal(
    reconcileSessionWrite(pending, 1, attempt, undefined).kind,
    "conflict",
  );
});
test("old cached saves reconcile only identical logical state regardless of JSON key order", () => {
  const pending = begin(25, 5, 0, randomUUID);
  const remote = Object.fromEntries(
    Object.entries(structuredClone(pending)).reverse(),
  ) as typeof pending;
  remote.intervals[0].duration_sec = 12;
  assert.deepEqual(
    reconcileSessionWrite(pending, 0, undefined, {
      timer_state: remote,
      revision: 1,
    }),
    { kind: "acknowledged", revision: 1, clearPending: true },
  );
  const changed = act(pending, "pause", 20000, randomUUID);
  assert.equal(
    reconcileSessionWrite(changed, 0, undefined, {
      timer_state: remote,
      revision: 1,
    }).kind,
    "conflict",
  );
  assert.equal(sameSavedWrite(pending, structuredClone(pending)), true);
  assert.equal(sameSavedWrite(pending, remote), false);
});

test("choosing the account version keeps unrelated pending progress and leaves the backup intact", () => {
  const a = begin(25, 5, 0, randomUUID),
    b = begin(50, 10, 0, randomUUID);
  const cache = {
    sessions: [a, b],
    pending: { [a.id]: a, [b.id]: b },
    revisions: { [a.id]: 1, [b.id]: 2 },
    attempts: {
      [a.id]: { timer: a, expectedRevision: 1 },
      [b.id]: { timer: b, expectedRevision: 2 },
    },
    heartbeat: { sessionId: b.id },
  };
  const resolved = selectAccountVersion(cache, new Set([a.id]));
  assert.equal(resolved.sessions.length, 1);
  assert.equal(resolved.sessions[0].id, b.id);
  assert.equal(resolved.pending[b.id].id, b.id);
  assert.equal(resolved.revisions[b.id], 2);
  assert.equal(resolved.attempts[b.id].expectedRevision, 2);
  assert.equal(resolved.heartbeat.sessionId, b.id);
  assert.equal(resolved.pending[a.id], undefined);
  assert.equal(cache.pending[a.id], a);
  assert.equal(cache.sessions.length, 2);
});
