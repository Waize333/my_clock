"use client";
import { useCallback, useEffect, useRef, useState } from "react";
export function useClock() {
  const calibration = useRef<{
    server: number;
    mono: number;
    wall: number;
  } | null>(null);
  const [synced, setSynced] = useState(false);
  const [clockReady, setReady] = useState(false);
  const clockNow = useCallback(() => {
    const c = calibration.current;
    if (!c) return Date.now();
    return c.server + performance.now() - c.mono;
  }, []);
  useEffect(() => {
    let alive = true,
      busy = false;
    async function sync() {
      if (busy) return;
      busy = true;
      const before = performance.now();
      try {
        const response = await fetch("/api/time", {
          cache: "no-store",
          signal: AbortSignal.timeout(4000),
        });
        if (!response.ok) throw new Error("Clock unavailable");
        const data = await response.json();
        if (!Number.isFinite(data.now)) throw new Error("Invalid clock");
        if (alive) {
          calibration.current = {
            server: data.now + (performance.now() - before) / 2,
            mono: performance.now(),
            wall: Date.now(),
          };
          setSynced(true);
        }
      } catch {
        if (alive) {
          const c = calibration.current;
          if (c) {
            const elapsed = Math.max(
              performance.now() - c.mono,
              Date.now() - c.wall,
            );
            calibration.current = {
              server: c.server + Math.max(0, elapsed),
              mono: performance.now(),
              wall: Date.now(),
            };
          }
          setSynced(false);
        }
      } finally {
        busy = false;
        if (alive) setReady(true);
      }
    }
    void sync();
    const interval = setInterval(() => void sync(), 60000);
    const resume = () => {
      if (!document.hidden) void sync();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      alive = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, []);
  return { clockNow, clockReady, clockSynced: synced };
}
