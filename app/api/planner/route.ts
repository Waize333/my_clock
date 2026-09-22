import { authorize, apiError } from "@/lib/auth/authorize";
import { withUser } from "@/lib/db/server";
import { validPlanner } from "@/lib/planner";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await authorize(request);
    const result = await withUser(user.id, (db) =>
      db.query(
        "SELECT data, revision, updated_at FROM cadence.planners WHERE user_id=$1",
        [user.id],
      ),
    );
    const row = result.rows[0];
    return Response.json(
      row
        ? { ...row, revision: Number(row.revision) }
        : { data: null, revision: 0 },
    );
  } catch (e) {
    return apiError(e);
  }
}
export async function PUT(request: Request) {
  try {
    const user = await authorize(request, true);
    const raw = await request.text();
    if (raw.length > 2_000_000)
      return Response.json(
        {
          error:
            "Planner is too large. Export a backup before adding more history.",
        },
        { status: 413 },
      );
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (
      !validPlanner(body?.data) ||
      !Number.isSafeInteger(body?.revision) ||
      body.revision < 0
    )
      return Response.json({ error: "Invalid planner data" }, { status: 400 });
    const result = await withUser(user.id, (db) =>
      body.revision === 0
        ? db.query(
            "INSERT INTO cadence.planners(user_id,data) VALUES($1,$2::jsonb) ON CONFLICT DO NOTHING RETURNING revision, updated_at",
            [user.id, JSON.stringify(body.data)],
          )
        : db.query(
            "UPDATE cadence.planners SET data=$2::jsonb,revision=revision+1,updated_at=now() WHERE user_id=$1 AND revision=$3 RETURNING revision, updated_at",
            [user.id, JSON.stringify(body.data), body.revision],
          ),
    );
    if (!result.rowCount)
      return Response.json(
        {
          error:
            "Planner conflict: another tab or device changed your planner. Reload the planner before retrying.",
        },
        { status: 409 },
      );
    return Response.json({
      revision: Number(result.rows[0].revision),
      updated_at: result.rows[0].updated_at,
    });
  } catch (e) {
    return apiError(e);
  }
}
