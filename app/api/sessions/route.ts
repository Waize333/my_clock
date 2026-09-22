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
        `SELECT jsonb_set(s.timer_state, '{intervals}', COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.started_at, i.id) FROM cadence.intervals i WHERE i.session_id=s.id), '[]'::jsonb)) AS timer_state, s.revision FROM cadence.sessions s WHERE s.user_id=$1 ORDER BY s.started_at DESC LIMIT 500 OFFSET $2`,
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
      !Array.isArray(body.timer.intervals) ||
      !Number.isInteger(body.expectedRevision) ||
      body.expectedRevision < 0
    )
      return Response.json({ error: "Invalid timer data" }, { status: 400 });
    const result = await withUser(user.id, (db) =>
      db.query("SELECT cadence.save_timer($1::jsonb,$2::bigint) AS revision", [
        JSON.stringify(body.timer),
        body.expectedRevision,
      ]),
    );
    return Response.json({ revision: Number(result.rows[0].revision) });
  } catch (e) {
    return apiError(e);
  }
}
