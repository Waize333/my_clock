import { authorize, apiError } from "@/lib/auth/authorize";
import { withUser } from "@/lib/db/server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await authorize(request);
    const profile = await withUser(user.id, async (db) => {
      await db.query(
        "INSERT INTO cadence.profiles(id,username,display_name) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING",
        [
          user.id,
          `user_${user.id.replaceAll("-", "")}`,
          (user.name || "").slice(0, 80),
        ],
      );
      const result = await db.query(
        "SELECT * FROM cadence.profiles WHERE id=$1",
        [user.id],
      );
      return result.rows[0];
    });
    return Response.json(profile);
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(request: Request) {
  try {
    const user = await authorize(request, true);
    const v = await request.json();
    if (
      typeof v.display_name !== "string" ||
      v.display_name.length > 80 ||
      typeof v.username !== "string" ||
      !/^[a-zA-Z0-9_-]{3,40}$/.test(v.username) ||
      !Number.isInteger(v.default_work_min) ||
      v.default_work_min < 1 ||
      v.default_work_min > 180 ||
      !Number.isInteger(v.default_break_min) ||
      v.default_break_min < 1 ||
      v.default_break_min > 60 ||
      !["system", "dark", "light"].includes(v.theme_pref)
    )
      return Response.json({ error: "Invalid preferences" }, { status: 400 });
    await withUser(user.id, (db) =>
      db.query(
        "UPDATE cadence.profiles SET username=$2,display_name=$3,default_work_min=$4,default_break_min=$5,theme_pref=$6 WHERE id=$1",
        [
          user.id,
          v.username,
          v.display_name,
          v.default_work_min,
          v.default_break_min,
          v.theme_pref,
        ],
      ),
    );
    return Response.json({ saved: true });
  } catch (e) {
    return apiError(e);
  }
}
