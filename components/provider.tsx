"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth/client";
import { rememberProfile } from "@/lib/profiles";
import { useTimer } from "@/lib/timer/useTimer";
import { useDeviceSettings } from "@/lib/useDeviceSettings";
import type { DeviceSettings } from "@/lib/device-settings";
import { usePlanner } from "@/lib/usePlanner";
export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  default_work_min: number;
  default_break_min: number;
  theme_pref: "system" | "light" | "dark";
};
const defaults: Profile = {
  id: "local",
  username: "local",
  display_name: "",
  avatar_url: null,
  default_work_min: 50,
  default_break_min: 10,
  theme_pref: "system",
};
type Context = ReturnType<typeof useTimer> &
  ReturnType<typeof usePlanner> & {
    profile: Profile;
    accountReady: boolean;
    updateProfile: (values: Partial<Profile>) => Promise<void>;
    theme: "light" | "dark";
    toggleTheme: () => void;
    accountError: string;
    connected: boolean;
    deviceSettings: DeviceSettings;
    updateDeviceSettings: (values: Partial<DeviceSettings>) => void;
  };
const AppContext = createContext<Context | null>(null);
export function Provider({
  children,
  connected,
}: {
  children: ReactNode;
  connected: boolean;
}) {
  const [profile, setProfile] = useState(defaults);
  const [owner, setOwner] = useState<string | null>(null);
  const [accountReady, setAccountReady] = useState(false);
  const [accountError, setAccountError] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const router = useRouter();
  const device = useDeviceSettings(owner, profile);
  const timer = useTimer(owner, device.id, device.settings.reminders);
  const planner = usePlanner(owner);
  const effectiveProfile = useMemo(
    () => ({ ...profile, ...device.settings }),
    [profile, device.settings],
  );
  useEffect(() => {
    let alive = true;
    if (!connected) {
      try {
        setProfile({
          ...defaults,
          ...JSON.parse(localStorage.getItem("cadence:profile:local") || "{}"),
        });
      } catch {}
      setOwner("local");
      setAccountReady(true);
      return;
    }
    api<Profile>("/api/profile")
      .then((data) => {
        if (!alive) return;
        setProfile(data);
        setOwner(data.id);
        setAccountReady(true);
        void authClient.getSession().then(({ data: session }) => {
          if (session?.user)
            rememberProfile({
              id: session.user.id,
              name: data.display_name || session.user.name,
              email: session.user.email,
            });
        });
      })
      .catch((error) => {
        if (error.message === "Unauthorized") router.replace("/login");
        else setAccountError(error.message);
      });
    return () => {
      alive = false;
    };
  }, [router, connected]);
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) location.reload();
    };
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const value =
        device.settings.theme_pref === "system"
          ? media.matches
            ? "dark"
            : "light"
          : device.settings.theme_pref;
      setTheme(value);
      document.documentElement.dataset.theme = value;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [device.settings.theme_pref]);
  async function updateProfile(values: Partial<Profile>) {
    const next = {
      ...profile,
      username: values.username ?? profile.username,
      display_name: values.display_name ?? profile.display_name,
    };
    if (
      connected &&
      owner &&
      (next.username !== profile.username ||
        next.display_name !== profile.display_name)
    )
      await api("/api/profile", {
        method: "PATCH",
        body: JSON.stringify(next),
      });
    device.update({
      default_work_min:
        values.default_work_min ?? device.settings.default_work_min,
      default_break_min:
        values.default_break_min ?? device.settings.default_break_min,
      theme_pref: values.theme_pref ?? device.settings.theme_pref,
    });
    localStorage.setItem(`cadence:profile:${owner}`, JSON.stringify(next));
    setProfile(next);
  }
  return (
    <AppContext.Provider
      value={{
        ...timer,
        ...planner,
        profile: effectiveProfile,
        deviceSettings: device.settings,
        updateDeviceSettings: device.update,
        accountReady: accountReady && device.ready,
        updateProfile,
        theme,
        toggleTheme: () => {
          try {
            device.update({ theme_pref: theme === "dark" ? "light" : "dark" });
          } catch (e) {
            setAccountError(
              e instanceof Error
                ? e.message
                : "Could not save device settings.",
            );
          }
        },
        accountError,
        connected,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("Missing provider");
  return context;
}
