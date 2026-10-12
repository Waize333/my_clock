import { authorize, apiError } from "@/lib/auth/authorize";
import { withUser } from "@/lib/db/server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await authorize(request);
    const offset = Math.max(
      0,
      Number(new URL(request.url).searchParams.get("offset")) || 0,
    );
    const result = await withUser(user.id, (db) =>
      db.query(
        `SELECT s.timer_state, s.revision FROM cadence.sessions s WHERE s.user_id=$1 ORDER BY s.started_at DESC LIMIT 500 OFFSET $2`,
        [user.id, offset],
      ),
    );
    return Response.json(result.rows);
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    const user = await authorize(request, true);
    const body = await request.json();
    if (
      !body.timer ||
      (body.timer.device_id !== undefined &&
        (typeof body.timer.device_id !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            body.timer.device_id,
          ))) ||
      !Array.isArray(body.timer.intervals) ||
      !Number.isInteger(body.expectedRevision) ||
      body.expectedRevision < 0
    )
      return Response.json({ error: "Invalid timer data" }, { status: 400 });
    const result = await withUser(user.id, async (db) => {
      const current = await db.query(
        "SELECT timer_state->>'device_id' AS device_id FROM cadence.sessions WHERE user_id=$1 AND id=$2 FOR UPDATE",
        [user.id, body.timer.id],
      );
      if (
        current.rowCount &&
        current.rows[0].device_id !== (body.timer.device_id ?? null)
      )
        throw new Error(
          "Session conflict: the recording device cannot be changed",
        );
      return db.query(
        "SELECT cadence.save_timer($1::jsonb,$2::bigint) AS revision",
        [JSON.stringify(body.timer), body.expectedRevision],
      );
    });
    return Response.json({ revision: Number(result.rows[0].revision) });
  } catch (e) {
    return apiError(e);
  }
}
