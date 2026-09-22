import { ProfileChooser } from "@/components/profile-chooser";
import { backendConfigured } from "@/lib/auth/server";
export const dynamic = "force-dynamic";
export default function Home() {
  return <ProfileChooser connected={backendConfigured()} />;
}
