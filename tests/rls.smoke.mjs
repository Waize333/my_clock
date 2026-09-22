import { Pool } from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
if (process.env.NEON_BRANCH !== "cadence-validation-20260922")
  throw new Error("Use only the temporary validation branch.");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL_UNPOOLED,
  max: 1,
});
const client = await pool.connect();
try {
  const owned = (await client.query("select * from cadence.sessions limit 1"))
    .rows[0];
  assert.ok(owned);
  const other = (
    await client.query("select id from cadence.profiles where id<>$1 limit 1", [
      owned.user_id,
    ])
  ).rows[0];
  assert.ok(other);
  await client.query("begin");
  await client.query("set local role cadence_authenticated");
  await client.query("select set_config('cadence.user_id',$1,true)", [
    other.id,
  ]);
  assert.equal(
    (
      await client.query(
        "select rolbypassrls from pg_roles where rolname=current_user",
      )
    ).rows[0].rolbypassrls,
    false,
  );
  assert.equal(
    (
      await client.query("select * from cadence.sessions where id=$1", [
        owned.id,
      ])
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await client.query(
        "select * from cadence.intervals where session_id=$1",
        [owned.id],
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await client.query(
        "update cadence.profiles set display_name=$1 where id=$2",
        ["forbidden", owned.user_id],
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await client.query("SELECT * FROM cadence.planners WHERE user_id=$1", [
        owned.user_id,
      ])
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await client.query(
        "UPDATE cadence.planners SET data='{}'::jsonb WHERE user_id=$1",
        [owned.user_id],
      )
    ).rowCount,
    0,
  );
  await client.query("savepoint planner_write");
  let plannerDenied = false;
  try {
    await client.query(
      "INSERT INTO cadence.planners(user_id,data) VALUES($1,'{}'::jsonb)",
      [owned.user_id],
    );
  } catch (e) {
    plannerDenied = e.code === "42501";
  }
  await client.query("rollback to savepoint planner_write");
  assert.equal(plannerDenied, true);
  await client.query("savepoint invalid_write");
  let denied = false;
  try {
    await client.query(
      "insert into cadence.sessions(id,user_id,started_at,planned_work_min,planned_break_min,timer_state) values($1,$2,now(),50,10,$3)",
      [randomUUID(), owned.user_id, {}],
    );
  } catch (e) {
    denied = e.code === "42501";
  }
  await client.query("rollback to savepoint invalid_write");
  assert.equal(denied, true);
  console.log(
    "PASS: non-bypass role, session/interval read isolation, profile/planner update isolation, cross-account inserts blocked by RLS.",
  );
} finally {
  await client.query("rollback");
  client.release();
  await pool.end();
}
