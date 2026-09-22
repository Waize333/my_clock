import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
import { Pool } from "pg";
import { readdir, readFile } from "node:fs/promises";
loadEnvConfig(process.cwd());
const connectionString = process.env.DATABASE_URL_UNPOOLED;
if (!connectionString)
  throw new Error(
    "Set DATABASE_URL_UNPOOLED to the direct Neon connection string.",
  );
if (new URL(connectionString).hostname.includes("-pooler"))
  throw new Error("Migrations require a direct, unpooled connection.");
const pool = new Pool({ connectionString, max: 1 });
const client = await pool.connect();
try {
  await client.query("select pg_advisory_lock(7306210922)");
  await client.query(
    "create table if not exists public.cadence_migrations(name text primary key, applied_at timestamptz not null default now())",
  );
  const applied = await client.query(
    "select name from public.cadence_migrations",
  );
  for (const file of (await readdir("db/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (applied.rows.some((r) => r.name === file)) continue;
    const sql = await readFile(`db/migrations/${file}`, "utf8");
    await client.query("begin");
    try {
      await client.query(
        sql.replace(/^begin;\s*$/gim, "").replace(/^commit;\s*$/gim, ""),
      );
      await client.query(
        "insert into public.cadence_migrations(name) values($1)",
        [file],
      );
      await client.query("commit");
      console.log(`Applied ${file}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
} finally {
  await client.query("select pg_advisory_unlock(7306210922)");
  client.release();
  await pool.end();
}
