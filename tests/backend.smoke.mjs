import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.env.TEST_BASE_URL || "http://localhost:3001";
if (new URL(base).port !== "3001")
  throw new Error(
    "This smoke test is restricted to the disposable validation app on port 3001.",
  );
async function request(path, method = "GET", body, cookie) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: base,
      ...(cookie ? { cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON ${response.status}: ${text.slice(0, 200)}`);
  }
  return { response, data };
}
async function signup() {
  const email = `cadence-test-${randomUUID()}@example.com`;
  const password = `Test-${randomUUID()}!`;
  const { response, data } = await request("/api/auth/sign-up/email", "POST", {
    email,
    password,
    name: "Validation account",
  });
  assert.equal(response.status, 200, JSON.stringify(data));
  const cookie = response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  assert.ok(cookie);
  return { cookie, user: data.user, email, password };
}
assert.equal((await request("/api/sessions")).response.status, 401);
const a = await signup(),
  b = await signup();
const profile = await request("/api/profile", "GET", undefined, a.cookie);
assert.equal(profile.data.id, a.user.id);
const sid = randomUUID(),
  iid = randomUUID(),
  now = new Date().toISOString();
const timer = {
  id: sid,
  device_id: randomUUID(),
  task_id: randomUUID(),
  task_name: "Coursework",
  started_at: now,
  ended_at: null,
  planned_work_min: 50,
  planned_break_min: 10,
  status: null,
  phase: "work",
  running: true,
  remainingMs: 3000000,
  anchor: Date.now(),
  revision: 0,
  intervals: [
    {
      id: iid,
      session_id: sid,
      type: "work",
      started_at: now,
      ended_at: null,
      duration_sec: 0,
      planned_duration_sec: 3000,
      completed: false,
      spans: [{ started_at: now, ended_at: null }],
    },
  ],
};
let saved = await request(
  "/api/sessions",
  "POST",
  { timer, expectedRevision: 0 },
  a.cookie,
);
assert.equal(saved.response.status, 200, JSON.stringify(saved.data));
assert.equal(saved.data.revision, 1);
assert.equal(
  (
    await request(
      "/api/sessions",
      "POST",
      { timer, expectedRevision: 0 },
      a.cookie,
    )
  ).response.status,
  409,
);
assert.equal(
  (await request("/api/sessions", "GET", undefined, b.cookie)).data.length,
  0,
);
assert.notEqual(
  (
    await request(
      "/api/sessions",
      "POST",
      { timer, expectedRevision: 1 },
      b.cookie,
    )
  ).response.status,
  200,
);
// A second login for the same account records independently on another device.
const secondLogin = await request("/api/auth/sign-in/email", "POST", {
  email: a.email,
  password: a.password,
});
assert.equal(secondLogin.response.status, 200);
const secondCookie = secondLogin.response.headers
  .getSetCookie()
  .map((c) => c.split(";")[0])
  .join("; ");
const deviceB = structuredClone(timer);
deviceB.id = randomUUID();
deviceB.device_id = randomUUID();
deviceB.intervals[0].id = randomUUID();
deviceB.intervals[0].session_id = deviceB.id;
assert.equal(
  (
    await request(
      "/api/sessions",
      "POST",
      { timer: deviceB, expectedRevision: 0 },
      secondCookie,
    )
  ).response.status,
  200,
);
const duplicate = structuredClone(timer);
duplicate.id = randomUUID();
duplicate.intervals[0].id = randomUUID();
duplicate.intervals[0].session_id = duplicate.id;
assert.equal(
  (
    await request(
      "/api/sessions",
      "POST",
      { timer: duplicate, expectedRevision: 0 },
      a.cookie,
    )
  ).response.status,
  409,
);
const updates = await request(
  "/api/sync",
  "POST",
  { revisions: { [timer.id]: 1 } },
  a.cookie,
);
assert.equal(updates.response.status, 200);
assert.equal(updates.data.length, 1);
assert.equal(updates.data[0].timer_state.id, deviceB.id);
assert.equal(
  (
    await request(
      "/api/sync",
      "POST",
      { revisions: { [timer.id]: 1, [deviceB.id]: 1 } },
      secondCookie,
    )
  ).data.length,
  0,
);
assert.equal(
  (await request("/api/sync", "POST", { revisions: {} }, b.cookie)).data.length,
  0,
);
const wrongDevice = { ...timer, device_id: randomUUID() };
assert.equal(
  (
    await request(
      "/api/sessions",
      "POST",
      { timer: wrongDevice, expectedRevision: 1 },
      a.cookie,
    )
  ).response.status,
  409,
);
// A saved open interval can be extended and later completed at its new target.
deviceB.intervals[0].planned_duration_sec += 120;
deviceB.remainingMs += 120000;
const extension = await request(
  "/api/sessions",
  "POST",
  { timer: deviceB, expectedRevision: 1 },
  secondCookie,
);
assert.equal(extension.response.status, 200, JSON.stringify(extension.data));
assert.equal(extension.data.revision, 2);
const extendedHistory = await request(
  "/api/sessions",
  "GET",
  undefined,
  a.cookie,
);
assert.equal(
  extendedHistory.data.find((row) => row.timer_state.id === deviceB.id)
    .timer_state.intervals[0].planned_duration_sec,
  3120,
);
deviceB.running = false;
deviceB.status = "completed";
deviceB.ended_at = new Date().toISOString();
deviceB.intervals[0].ended_at = deviceB.ended_at;
deviceB.intervals[0].duration_sec = 3120;
deviceB.intervals[0].completed = true;
assert.equal(
  (
    await request(
      "/api/sessions",
      "POST",
      { timer: deviceB, expectedRevision: 2 },
      secondCookie,
    )
  ).response.status,
  200,
);
assert.equal(
  (
    await request(
      "/api/sync",
      "POST",
      { revisions: { [timer.id]: 1, [deviceB.id]: 1 } },
      a.cookie,
    )
  ).data[0].timer_state.status,
  "completed",
);
console.log(
  "PASS: separate device sessions, second-login shared progress, incremental sync, isolation and recording-device protection.",
);
const end = new Date().toISOString();
timer.status = "completed";
timer.running = false;
timer.ended_at = end;
timer.intervals[0].ended_at = end;
timer.intervals[0].duration_sec = 2;
saved = await request(
  "/api/sessions",
  "POST",
  { timer, expectedRevision: 1 },
  a.cookie,
);
assert.equal(saved.response.status, 200, JSON.stringify(saved.data));
assert.equal(saved.data.revision, 2);
const history = await request("/api/sessions", "GET", undefined, a.cookie);
assert.equal(history.data.length, 2);
const firstHistory = history.data.find(
  (row) => row.timer_state.id === timer.id,
);
assert.equal(firstHistory.timer_state.task_name, "Coursework");
assert.equal(firstHistory.timer_state.intervals[0].spans.length, 1);
assert.equal(firstHistory.timer_state.intervals.length, 1);
assert.equal(firstHistory.timer_state.intervals[0].duration_sec, 2);
const pref = await request(
  "/api/profile",
  "PATCH",
  { ...profile.data, theme_pref: "dark" },
  a.cookie,
);
assert.equal(pref.response.status, 200);
assert.equal(
  (await request("/api/profile", "GET", undefined, a.cookie)).data.theme_pref,
  "dark",
);
const signedIn = await request("/api/auth/sign-in/email", "POST", {
  email: a.email,
  password: a.password,
});
assert.equal(signedIn.response.status, 200);
// Planner data is private, revision-checked, and validated independently of timer state.
assert.equal((await request("/api/planner")).response.status, 401);
assert.equal(
  (await request("/api/planner", "GET", undefined, a.cookie)).data.revision,
  0,
);
const planner = {
  version: 1,
  timezone: "Asia/Karachi",
  plans: {},
  entries: [],
  checks: {},
  notes: {},
};
const firstPlan = await request(
  "/api/planner",
  "PUT",
  { data: planner, revision: 0 },
  a.cookie,
);
assert.equal(firstPlan.response.status, 200);
assert.equal(firstPlan.data.revision, 1);
assert.equal(
  (await request("/api/planner", "GET", undefined, b.cookie)).data.data,
  null,
);
assert.equal(
  (await request("/api/planner", "GET", undefined, a.cookie)).data.data
    .timezone,
  "Asia/Karachi",
);
assert.equal(
  (
    await request(
      "/api/planner",
      "PUT",
      { data: planner, revision: 0 },
      a.cookie,
    )
  ).response.status,
  409,
);
assert.equal(
  (
    await request(
      "/api/planner",
      "PUT",
      { data: { ...planner, timezone: "Bad/Zone" }, revision: 1 },
      a.cookie,
    )
  ).response.status,
  400,
);
assert.equal(
  (
    await request(
      "/api/planner",
      "PUT",
      {
        data: { ...planner, notes: { "2026-09-21": "Saved history" } },
        revision: 1,
      },
      a.cookie,
    )
  ).data.revision,
  2,
);
const clock = await request("/api/time");
assert.equal(clock.response.status, 200);
assert.ok(Math.abs(clock.data.now - Date.now()) < 10000);
console.log(
  "PASS: planner persistence, account isolation, conflict protection, validation and server clock.",
);
// Losing a response must not duplicate a write or turn a safe retry into a conflict.
const retryTimer = structuredClone(timer);
retryTimer.id = randomUUID();
retryTimer.device_id = randomUUID();
retryTimer.sync_write_id = randomUUID();
retryTimer.status = null;
retryTimer.ended_at = null;
retryTimer.running = true;
retryTimer.intervals[0].id = randomUUID();
retryTimer.intervals[0].session_id = retryTimer.id;
retryTimer.intervals[0].ended_at = null;
const firstWrite = { timer: structuredClone(retryTimer), expectedRevision: 0 };
assert.equal(
  (await request("/api/sessions", "POST", firstWrite, a.cookie)).data.revision,
  1,
);
const replay = await request("/api/sessions", "POST", firstWrite, a.cookie);
assert.equal(replay.response.status, 200, JSON.stringify(replay.data));
assert.equal(replay.data.revision, 1);
assert.equal(
  Number(
    (
      await request(
        `/api/sessions?id=${retryTimer.id}`,
        "GET",
        undefined,
        a.cookie,
      )
    ).data[0].revision,
  ),
  1,
);
assert.equal(
  (
    await request(
      `/api/sessions?id=${retryTimer.id}`,
      "GET",
      undefined,
      b.cookie,
    )
  ).data.length,
  0,
);
assert.equal(
  (await request("/api/sessions?id=bad", "GET", undefined, a.cookie)).response
    .status,
  400,
);
const reused = { ...retryTimer, remainingMs: retryTimer.remainingMs + 120000 };
assert.equal(
  (
    await request(
      "/api/sessions",
      "POST",
      { timer: reused, expectedRevision: 1 },
      a.cookie,
    )
  ).response.status,
  409,
);
retryTimer.sync_write_id = randomUUID();
retryTimer.running = false;
const nextWrite = { timer: structuredClone(retryTimer), expectedRevision: 1 };
const concurrent = await Promise.all([
  request("/api/sessions", "POST", nextWrite, a.cookie),
  request("/api/sessions", "POST", nextWrite, secondCookie),
]);
assert.ok(
  concurrent.every(
    (result) => result.response.status === 200 && result.data.revision === 2,
  ),
  JSON.stringify(concurrent.map((r) => r.data)),
);
assert.equal(
  (await request("/api/sessions", "POST", firstWrite, a.cookie)).response
    .status,
  409,
);
retryTimer.sync_write_id = randomUUID();
retryTimer.status = "completed";
retryTimer.ended_at = new Date().toISOString();
retryTimer.intervals[0].ended_at = retryTimer.ended_at;
const finishedWrite = { timer: retryTimer, expectedRevision: 2 };
assert.equal(
  (await request("/api/sessions", "POST", finishedWrite, a.cookie)).data
    .revision,
  3,
);
assert.equal(
  (await request("/api/sessions", "POST", finishedWrite, a.cookie)).data
    .revision,
  3,
);
console.log(
  "PASS: interrupted-response retries, concurrent duplicate requests, completed-session replay, stale-write rejection and private session lookup.",
);
const signedOut = await request("/api/auth/sign-out", "POST", {}, a.cookie);
assert.equal(signedOut.response.status, 200);
assert.equal(
  (await request("/api/sessions", "GET", undefined, a.cookie)).response.status,
  401,
);
console.log(
  "PASS: signup/profile trigger, signin, signout, protected API, interval persistence, revision conflicts, account isolation, preferences.",
);
