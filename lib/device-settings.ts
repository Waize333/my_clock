export type Reminders = {
  sound: boolean;
  vibration: boolean;
  popup: boolean;
  notifications: boolean;
  volume: number;
};
export type DeviceSettings = {
  default_work_min: number;
  default_break_min: number;
  theme_pref: "system" | "light" | "dark";
  reminders: Reminders;
};
export const defaultReminders: Reminders = {
  sound: true,
  vibration: false,
  popup: true,
  notifications: false,
  volume: 0.5,
};
export function normalizeDeviceSettings(
  value: Partial<DeviceSettings> | null,
  fallback: Partial<DeviceSettings> = {},
): DeviceSettings {
  const duration = (v: unknown, max: number, defaultValue: number) =>
    Number.isInteger(v) && Number(v) >= 1 && Number(v) <= max
      ? Number(v)
      : defaultValue;
  const r = value?.reminders;
  return {
    default_work_min: duration(
      value?.default_work_min,
      180,
      fallback.default_work_min || 50,
    ),
    default_break_min: duration(
      value?.default_break_min,
      60,
      fallback.default_break_min || 10,
    ),
    theme_pref: ["light", "dark", "system"].includes(value?.theme_pref || "")
      ? value!.theme_pref!
      : fallback.theme_pref || "system",
    reminders: {
      ...defaultReminders,
      ...Object.fromEntries(
        ["sound", "vibration", "popup", "notifications"]
          .filter((k) => typeof r?.[k as keyof Reminders] === "boolean")
          .map((k) => [k, r![k as keyof Reminders]]),
      ),
      volume:
        typeof r?.volume === "number" && Number.isFinite(r.volume)
          ? Math.min(1, Math.max(0, r.volume))
          : defaultReminders.volume,
    },
  };
}
