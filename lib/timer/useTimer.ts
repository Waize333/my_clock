"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  act,
  advance,
  begin,
  remaining,
  snapshot,
  type Timer,
  type Phase,
} from "./core";
import { api } from "@/lib/api";
import { useClock } from "@/lib/useClock";
import type { Task } from "@/lib/planner";
const uuid = () => crypto.randomUUID();
type Cache = {
  sessions: Timer[];
  revisions: Record<string, number>;
  pending: Record<string, Timer>;
};
function signal(phase: Phase) {
  try {
    const context = new AudioContext();
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.frequency.value = phase === "break" ? 528 : 660;
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(0.12, context.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.7);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start();
    osc.stop(context.currentTime + 0.8);
    osc.onended = () => {
      void context.close();
    };
  } catch {}
  if (
    (document.hidden || !document.hasFocus()) &&
    "Notification" in window &&
    Notification.permission === "granted"
  )
    new Notification(phase === "break" ? "Break time" : "Back to work", {
      body:
        phase === "break"
          ? "Step away. Take a breath."
          : "A little space for your next focus.",
      tag: "cadence-transition",
    });
}
export function useTimer(owner: string | null) {
  const { clockNow, clockReady, clockSynced } = useClock();
  const [sessions, setSessions] = useState<Timer[]>([]);
  const cache = useRef<Cache>({ sessions: [], revisions: {}, pending: {} });
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [hasConflict, setHasConflict] = useState(false);
  const syncing = useRef(false);
  const epoch = useRef(0);
  const conflict = useRef(false);
  const persist = useCallback(() => {
    try {
      localStorage.setItem(
        `cadence:cache:${owner}`,
        JSON.stringify(cache.current),
      );
    } catch {
      setError(
        "Browser storage is full or unavailable. Keep this tab open to preserve your session.",
      );
    }
  }, [owner]);
  const flush = useCallback(async () => {
    if (!owner || owner === "local" || syncing.current || conflict.current)
      return;
    syncing.current = true;
    const generation = epoch.current;
    try {
      while (
        Object.keys(cache.current.pending).length &&
        generation === epoch.current
      ) {
        const timer = Object.values(cache.current.pending)[0];
        const expectedRevision = cache.current.revisions[timer.id] ?? 0;
        const result = await api<{ revision: number }>("/api/sessions", {
          method: "POST",
          body: JSON.stringify({
            timer: snapshot(timer, clockNow()),
            expectedRevision,
          }),
        });
        if (generation !== epoch.current) return;
        cache.current.revisions[timer.id] = result.revision;
        if (cache.current.pending[timer.id] === timer)
          delete cache.current.pending[timer.id];
        persist();
        setError("");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Connection lost";
      if (message.includes("conflict")) {
        conflict.current = true;
        setHasConflict(true);
        setReadOnly(true);
        setError(
          "Another device changed this session. Your unsynced browser copy is preserved. Reload to reconcile before continuing.",
        );
      } else
        setError(
          `${message} Your changes are saved in this browser and will retry when connected.`,
        );
    } finally {
      syncing.current = false;
    }
  }, [owner, persist, clockNow]);
  const save = useCallback(
    (timer: Timer) => {
      cache.current.sessions = [
        timer,
        ...cache.current.sessions.filter((s) => s.id !== timer.id),
      ];
      if (owner !== "local") cache.current.pending[timer.id] = timer;
      setSessions(cache.current.sessions);
      persist();
      void flush();
    },
    [owner, persist, flush],
  );
  useEffect(() => {
    epoch.current++;
    conflict.current = false;
    setHasConflict(false);
    setReady(false);
    setReadOnly(false);
    setError("");
    cache.current = { sessions: [], revisions: {}, pending: {} };
    setSessions([]);
    if (!owner) return;
    let disposed = false;
    let release: (() => void) | undefined;
    async function load(viewOnly = false) {
      try {
        const stored = JSON.parse(
          localStorage.getItem(`cadence:cache:${owner}`) || "null",
        );
        if (stored?.sessions && stored?.revisions && stored?.pending)
          cache.current = stored;
      } catch {
        setError("Could not restore browser storage.");
      }
      if (owner !== "local") {
        try {
          const remote: Timer[] = [];
          const revisions: Record<string, number> = {};
          for (let offset = 0; ; offset += 500) {
            const data = await api<{ timer_state: Timer; revision: number }[]>(
              `/api/sessions?offset=${offset}`,
            );
            if (disposed) return;
            for (const row of data) {
              remote.push(row.timer_state);
              revisions[row.timer_state.id] = Number(row.revision);
            }
            if (data.length < 500) break;
          }
          const pending = cache.current.pending;
          for (const timer of Object.values(pending)) {
            if (
              (revisions[timer.id] ?? 0) !==
              (cache.current.revisions[timer.id] ?? 0)
            ) {
              conflict.current = true;
              setHasConflict(true);
              setReadOnly(true);
              setError(
                "This device has unsynced edits and the server has newer data. Your local copy is preserved; export it before clearing browser data.",
              );
            }
          }
          cache.current.sessions = [
            ...Object.values(pending),
            ...remote.filter((t) => !pending[t.id]),
          ];
          cache.current.revisions = {
            ...revisions,
            ...Object.fromEntries(
              Object.keys(pending).map((id) => [
                id,
                cache.current.revisions[id] ?? 0,
              ]),
            ),
          };
        } catch {
          if (!cache.current.sessions.length) {
            setError("Could not load your account. Reconnect and reload.");
            setReadOnly(true);
            return;
          }
          setError(
            "Offline. Showing your saved browser copy; changes will sync when connected.",
          );
        }
      }
      if (disposed) return;
      setSessions(cache.current.sessions);
      setReady(true);
      persist();
      if (!viewOnly) void flush();
    }
    if (navigator.locks)
      void navigator.locks.request(
        `cadence:timer:${owner}`,
        { ifAvailable: true },
        async (lock) => {
          if (disposed) return;
          if (!lock) {
            setReadOnly(true);
            setError(
              "Timer is open in another tab. You can view your planner here; close the other tab and reload to control the timer.",
            );
            void load(true);
            return;
          }
          void load();
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        },
      );
    else void load();
    return () => {
      disposed = true;
      release?.();
    };
  }, [owner, persist, flush]);
  useEffect(() => {
    if (!clockReady) return;
    const tick = () => {
      const time = clockNow();
      setNow((previous) =>
        Math.floor(previous / 1000) === Math.floor(time / 1000)
          ? previous
          : time,
      );
      if (!ready || readOnly) return;
      const active = cache.current.sessions.find((s) => !s.status);
      if (!active?.running) return;
      if (time < active.anchor + active.remainingMs) return;
      const result = advance(active, time, uuid);
      if (result.transitions.length) {
        save(result.timer);
        const phase = result.transitions[result.transitions.length - 1];
        setNotice(
          phase === "break"
            ? "Break time. A moment to breathe."
            : "Back to work. One thing at a time.",
        );
        signal(phase);
      }
    };
    tick();
    const timer = setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [ready, readOnly, save, clockNow, clockReady]);
  useEffect(() => {
    const retry = () => {
      void flush();
    };
    window.addEventListener("online", retry);
    const timer = setInterval(retry, 15000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", retry);
    };
  }, [flush]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  const active = sessions.find((s) => !s.status) ?? null;
  return {
    sessions,
    active,
    ready: ready && clockReady,
    clockSynced,
    now,
    notice,
    error,
    readOnly,
    hasConflict,
    exportBackup: () => {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(cache.current, null, 2)], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "cadence-session-backup.json";
      a.click();
      URL.revokeObjectURL(url);
    },
    useCloudVersion: () => {
      if (
        conflict.current &&
        window.confirm(
          "Discard unsynced edits on this browser and load the account version? Download a copy first if you need to keep them.",
        )
      ) {
        localStorage.removeItem(`cadence:cache:${owner}`);
        location.reload();
      }
    },
    remaining: active ? remaining(active, now) : 0,
    start: (work: number, rest: number, task?: Task) => {
      if (
        !ready ||
        !clockReady ||
        readOnly ||
        cache.current.sessions.some((s) => !s.status)
      )
        return false;
      const timer = begin(work, rest, clockNow(), uuid);
      if (task) {
        timer.task_id = task.id;
        timer.task_name = task.name;
        timer.task_target_min = task.targetMin;
      }
      save(timer);
      return true;
    },
    action: (action: Parameters<typeof act>[1]) => {
      const timer = cache.current.sessions.find((s) => !s.status);
      if (timer && !readOnly) {
        const next = act(timer, action, clockNow(), uuid);
        save(next);
        if (action === "skip") {
          signal(next.phase);
          setNotice(
            next.phase === "break"
              ? "Break time. A moment to breathe."
              : "Back to work. One thing at a time.",
          );
        }
      }
    },
  };
}
