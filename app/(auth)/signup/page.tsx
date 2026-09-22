import { AuthForm } from "@/components/auth-form";
import { backendConfigured } from "@/lib/auth/server";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <AuthForm
      signup
      connected={backendConfigured()}
      googleEnabled={Boolean(
        process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
      )}
    />
  );
}
