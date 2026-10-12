"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Reminders } from "../device-settings";
import type { Phase } from "./core";
export const reminderText = (phase: Phase) =>
  phase === "break"
    ? {
        title: "Work interval complete",
        body: "Time for a break. Step away and take a breath.",
      }
    : {
        title: "Break interval complete",
        body: "Ready for your next focus interval?",
      };
export function useReminders(options: Reminders) {
  const [reminder, setReminder] = useState<Phase | null>(null);
  const audio = useRef<AudioContext | null>(null);
  useEffect(
    () => () => {
      void audio.current?.close();
    },
    [],
  );
  const arm = useCallback(
    (force = false) => {
      if (!options.sound && !force) return;
      try {
        audio.current ??= new AudioContext();
        void audio.current.resume().catch(() => {});
      } catch {}
    },
    [options.sound],
  );
  const signal = useCallback(
    (phase: Phase, settings = options) => {
      if (settings.popup) setReminder(phase);
      if (settings.vibration && "vibrate" in navigator) {
        try {
          navigator.vibrate([200, 100, 200]);
        } catch {}
      }
      if (settings.sound) {
        try {
          const context = audio.current;
          if (context?.state === "running") {
            for (let n = 0; n < 3; n++) {
              const osc = context.createOscillator(),
                gain = context.createGain(),
                at = context.currentTime + n * 0.28;
              osc.frequency.value = phase === "break" ? 660 : 880;
              gain.gain.setValueAtTime(0, at);
              gain.gain.linearRampToValueAtTime(
                settings.volume * 0.2,
                at + 0.02,
              );
              gain.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
              osc.connect(gain);
              gain.connect(context.destination);
              osc.start(at);
              osc.stop(at + 0.25);
            }
          }
        } catch {}
      }
      if (
        settings.notifications &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        const { title, body } = reminderText(phase);
        void (async () => {
          try {
            const registration =
              "serviceWorker" in navigator
                ? await navigator.serviceWorker.getRegistration()
                : undefined;
            if (registration)
              await registration.showNotification(title, {
                body,
                tag: "cadence-transition",
                data: { url: location.href },
              });
            else new Notification(title, { body, tag: "cadence-transition" });
          } catch {}
        })();
      }
    },
    [options],
  );
  return {
    reminder,
    dismissReminder: () => setReminder(null),
    arm,
    signal,
    testReminder: (phase: Phase, settings = options) => {
      arm(true);
      setTimeout(() => signal(phase, settings), 150);
    },
  };
}
export async function enableNotifications() {
  if (!("Notification" in window))
    return "Browser notifications aren’t supported here. In-app reminders still work.";
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    return "Notifications are blocked. You can allow them in browser settings; in-app reminders still work.";
  if ("serviceWorker" in navigator) {
    await navigator.serviceWorker.register("/reminders-sw.js");
    await navigator.serviceWorker.ready;
  }
  return "Browser notifications enabled on this device.";
}
