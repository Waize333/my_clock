import { getAuth } from "./server";
export async function authorize(request: Request, mutation = false) {
  if (
    mutation &&
    request.headers.get("origin") !==
      new URL(process.env.BETTER_AUTH_URL || request.url).origin
  )
    throw new Error("Forbidden");
  const auth = getAuth();
  if (!auth) throw new Error("Backend not configured");
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) throw new Error("Unauthorized");
  return session.user;
}
export function apiError(error: unknown) {
  const raw =
    error instanceof Error ? error.message : "Unexpected server error";
  const message = raw.includes("one_active_session_per_user")
    ? "Session conflict: another session is already active"
    : raw;
  const status =
    message === "Unauthorized"
      ? 401
      : message === "Forbidden"
        ? 403
        : message.includes("conflict")
          ? 409
          : 500;
  console.error("Cadence API:", message);
  return Response.json(
    {
      error:
        status === 500
          ? "The database request failed. Check the Neon connection and migration."
          : message,
    },
    { status },
  );
}
