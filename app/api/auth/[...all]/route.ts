import { getAuth } from "@/lib/auth/server";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const auth = getAuth();
  return auth
    ? auth.handler(request)
    : Response.json(
        { error: "Authentication is not configured" },
        { status: 503 },
      );
}
export const POST = GET;
