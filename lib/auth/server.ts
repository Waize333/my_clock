import "server-only";
import { betterAuth } from "better-auth";
import { database } from "@/lib/db/server";
export const backendConfigured = () =>
  Boolean(
    process.env.DATABASE_URL &&
    process.env.BETTER_AUTH_SECRET &&
    process.env.BETTER_AUTH_URL,
  );
let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  if (!backendConfigured()) return null;
  return (instance ??= createAuth());
}
function createAuth() {
  return betterAuth({
    database: database(),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    socialProviders:
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: process.env.GOOGLE_CLIENT_ID,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {},
    user: { modelName: "cadence_user" },
    session: { modelName: "cadence_auth_session" },
    account: { modelName: "cadence_account" },
    verification: { modelName: "cadence_verification" },
    advanced: { database: { generateId: () => crypto.randomUUID() } },
  });
}
