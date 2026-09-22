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
assert.equal(history.data.length, 1);
assert.equal(history.data[0].timer_state.intervals.length, 1);
assert.equal(history.data[0].timer_state.intervals[0].duration_sec, 2);
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
const signedOut = await request("/api/auth/sign-out", "POST", {}, a.cookie);
assert.equal(signedOut.response.status, 200);
assert.equal(
  (await request("/api/sessions", "GET", undefined, a.cookie)).response.status,
  401,
);
console.log(
  "PASS: signup/profile trigger, signin, signout, protected API, interval persistence, revision conflicts, account isolation, preferences.",
);
