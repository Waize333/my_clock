import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Provider } from "@/components/provider";
import { Shell } from "@/components/shell";
import { getAuth, backendConfigured } from "@/lib/auth/server";
export const dynamic = "force-dynamic";
export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ profile: string }>;
}) {
  const { profile } = await params;
  const connected = profile !== "local" && backendConfigured();
  const auth = connected ? getAuth() : null;
  if (auth) {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) redirect("/login");
  }
  return (
    <Provider connected={connected}>
      <Shell>{children}</Shell>
    </Provider>
  );
}
