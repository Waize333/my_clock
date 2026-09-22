import "server-only";
import { Pool, type PoolClient } from "pg";
import { attachDatabasePool } from "@vercel/functions";
let pool: Pool | undefined;
export function database() {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is not configured");
  if (!pool) {
    const connection = new URL(process.env.DATABASE_URL);
    if (
      ["require", "prefer", "verify-ca"].includes(
        connection.searchParams.get("sslmode") || "",
      )
    )
      connection.searchParams.set("sslmode", "verify-full");
    pool = new Pool({
      connectionString: connection.toString(),
      max: 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
    });
    attachDatabasePool(pool);
  }
  return pool;
}
export async function withUser<T>(
  userId: string,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE cadence_authenticated");
    await client.query("SELECT set_config('cadence.user_id', $1, true)", [
      userId,
    ]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
