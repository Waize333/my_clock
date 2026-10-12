"use client";
import { useEffect, useRef, useState } from "react";
import {
  normalizeDeviceSettings,
  type DeviceSettings,
} from "./device-settings";
export function useDeviceSettings(
  owner: string | null,
  defaults: Partial<DeviceSettings>,
) {
  const { default_work_min, default_break_min, theme_pref } = defaults;
  const [id, setId] = useState<string | null>(null);
  const [settings, setSettings] = useState(normalizeDeviceSettings(null));
  const currentSettings = useRef(normalizeDeviceSettings(null));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!owner) return;
    let deviceId = localStorage.getItem("cadence:device-id");
    if (!deviceId || !/^[0-9a-f-]{36}$/i.test(deviceId)) {
      deviceId = crypto.randomUUID();
      localStorage.setItem("cadence:device-id", deviceId);
    }
    setId(deviceId);
    let saved = null;
    try {
      saved = JSON.parse(
        localStorage.getItem(`cadence:device-settings:${owner}`) || "null",
      );
    } catch {}
    const value = normalizeDeviceSettings(saved, {
      default_work_min,
      default_break_min,
      theme_pref,
    });
    currentSettings.current = value;
    setSettings(value);
    setReady(true);
  }, [owner, default_work_min, default_break_min, theme_pref]);
  function update(next: Partial<DeviceSettings>) {
    if (!owner || !ready)
      throw new Error("Please wait for device settings to load.");
    const value = normalizeDeviceSettings({
      ...currentSettings.current,
      ...next,
    });
    localStorage.setItem(
      `cadence:device-settings:${owner}`,
      JSON.stringify(value),
    );
    currentSettings.current = value;
    setSettings(value);
  }
  return { id, settings, ready, update };
}
