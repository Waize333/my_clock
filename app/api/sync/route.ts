import { authorize, apiError } from "@/lib/auth/authorize";
import { withUser } from "@/lib/db/server";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const user = await authorize(request, true);
    const raw = await request.text();
    if (raw.length > 2_000_000)
      return Response.json(
        { error: "Sync request is too large" },
        { status: 413 },
      );
    const { revisions } = JSON.parse(raw);
    if (
      !revisions ||
      typeof revisions !== "object" ||
      Array.isArray(revisions) ||
      Object.keys(revisions).length > 20000 ||
      !Object.entries(revisions).every(
        ([key, value]) =>
          /^[0-9a-f-]{36}$/i.test(key) &&
          Number.isSafeInteger(value) &&
          Number(value) >= 0,
      )
    )
      return Response.json(
        { error: "Invalid sync revisions" },
        { status: 400 },
      );
    const result = await withUser(user.id, (db) =>
      db.query(
        "SELECT timer_state, revision FROM cadence.sessions WHERE user_id=$1 AND revision > coalesce(($2::jsonb ->> id::text)::bigint,-1) ORDER BY started_at DESC,id LIMIT 500",
        [user.id, JSON.stringify(revisions)],
      ),
    );
    return Response.json(result.rows);
  } catch (error) {
    return apiError(error);
  }
}
