"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  act,
  advance,
  begin,
  extendWork,
  remaining,
  snapshot,
  type Timer,
} from "./core";
import { api } from "@/lib/api";
import { useClock } from "@/lib/useClock";
import type { Task } from "@/lib/planner";
import { pauseAfterInterruption, type Heartbeat } from "./suspension";
import type { Reminders } from "../device-settings";
import { useReminders } from "./reminders";
import {
  mergeSessionUpdates,
  reconcileSessionWrite,
  selectAccountVersion,
  type SessionRow,
  type SessionWrite,
} from "./sync";
const uuid = () => crypto.randomUUID();
type Cache = {
  heartbeat?: Heartbeat;
  sessions: Timer[];
  revisions: Record<string, number>;
  pending: Record<string, Timer>;
  attempts?: Record<string, SessionWrite>;
};
export function useTimer(
  owner: string | null,
  deviceId: string | null,
  reminders: Reminders,
) {
  const alerts = useReminders(reminders);
  const { signal, arm } = alerts;
  const legacyIds = useRef(new Set<string>());
  const [legacySessions, setLegacySessions] = useState<string[]>([]);
  const owns = useCallback(
    (s: Timer) =>
      s.device_id === deviceId || (!s.device_id && legacyIds.current.has(s.id)),
    [deviceId],
  );
  const [syncStatus, setSyncStatus] = useState("Loading saved progress…");
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  const pulling = useRef(false);
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
  const writeAccess = useRef(true);
  const epoch = useRef(0);
  const conflict = useRef(false);
  const conflictingIds = useRef(new Set<string>());
  const persist = useCallback(() => {
    if (!writeAccess.current) return;
    try {
      localStorage.setItem(
        `cadence:cache:${owner}`,
        JSON.stringify({ ...cache.current, legacyIds: [...legacyIds.current] }),
      );
    } catch {
      setError(
        "Browser storage is full or unavailable. Keep this tab open to preserve your session.",
      );
    }
  }, [owner]);
  const flush = useCallback(async () => {
    if (
      !owner ||
      owner === "local" ||
      syncing.current ||
      conflict.current ||
      !writeAccess.current
    )
      return;
    syncing.current = true;
    const generation = epoch.current;
    try {
      while (
        Object.keys(cache.current.pending).length &&
        generation === epoch.current
      ) {
        const timer = Object.values(cache.current.pending)[0];
        const attempts = (cache.current.attempts ??= {});
        // Persist the exact request before sending it, even if newer edits replace the outbox entry.
        const attempt = (attempts[timer.id] ??= {
          timer: snapshot(timer, clockNow()),
          expectedRevision: cache.current.revisions[timer.id] ?? 0,
        });
        persist();
        let revision: number;
        try {
          const result = await api<{ revision: number }>("/api/sessions", {
            method: "POST",
            body: JSON.stringify(attempt),
          });
          revision = result.revision;
        } catch (e) {
          if (generation !== epoch.current) return;
          if (!(e instanceof Error) || !e.message.includes("conflict")) throw e;
          const rows = await api<SessionRow[]>(`/api/sessions?id=${timer.id}`);
          if (generation !== epoch.current) return;
          const current = cache.current.pending[timer.id];
          const reconciled = reconcileSessionWrite(
            current,
            attempt.expectedRevision,
            attempt,
            rows[0],
          );
          if (reconciled.kind !== "acknowledged") {
            conflictingIds.current.add(timer.id);
            throw e;
          }
          revision = reconciled.revision;
        }
        if (generation !== epoch.current) return;
        cache.current.revisions[timer.id] = revision;
        const pending = cache.current.pending[timer.id];
        if (
          (pending === timer && !timer.sync_write_id) ||
          (pending?.sync_write_id &&
            pending.sync_write_id === attempt.timer.sync_write_id)
        )
          delete cache.current.pending[timer.id];
        delete attempts[timer.id];
        persist();
        setError("");
      }
    } catch (e) {
      if (generation !== epoch.current) return;
      const message = e instanceof Error ? e.message : "Connection lost";
      if (message.includes("conflict")) {
        conflict.current = true;
        setHasConflict(true);
        setSyncStatus("Sync needs attention");
        setReadOnly(true);
        setError(
          "This session has different saved changes. Your browser copy is safe. Retry sync, or use the account version while keeping a backup.",
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
    (value: Timer) => {
      const timer =
        owner === "local" ? value : { ...value, sync_write_id: uuid() };
      cache.current.heartbeat = {
        sessionId: timer.id,
        at: clockNow(),
        wall: Date.now(),
        mono: performance.now(),
      };
      cache.current.sessions = [
        timer,
        ...cache.current.sessions.filter((s) => s.id !== timer.id),
      ];
      if (owner !== "local") cache.current.pending[timer.id] = timer;
      setSessions(cache.current.sessions);
      persist();
      void flush();
    },
    [owner, persist, flush, clockNow],
  );
  useEffect(() => {
    epoch.current++;
    writeAccess.current = true;
    legacyIds.current = new Set();
    conflict.current = false;
    conflictingIds.current.clear();
    setHasConflict(false);
    setReady(false);
    setReadOnly(false);
    setError("");
    cache.current = { sessions: [], revisions: {}, pending: {} };
    setSessions([]);
    if (!owner || !deviceId) return;
    let disposed = false;
    let release: (() => void) | undefined;
    async function load(viewOnly = false) {
      let loadedFromServer = owner === "local";
      try {
        const stored = JSON.parse(
          localStorage.getItem(`cadence:cache:${owner}`) || "null",
        );
        if (stored?.sessions && stored?.revisions && stored?.pending) {
          cache.current = stored;
          legacyIds.current = new Set<string>(
            stored.legacyIds ??
              stored.sessions
                .filter((s: Timer) => !s.device_id)
                .map((s: Timer) => s.id),
          );
        }
      } catch {
        setError("Could not restore browser storage.");
      }
      if (viewOnly) cache.current.pending = {};
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
          loadedFromServer = true;
          const pending = cache.current.pending;
          for (const timer of Object.values(pending)) {
            const row = remote.find((s) => s.id === timer.id);
            const reconciled = reconcileSessionWrite(
              timer,
              cache.current.revisions[timer.id] ?? 0,
              cache.current.attempts?.[timer.id],
              row
                ? { timer_state: row, revision: revisions[timer.id] }
                : undefined,
            );
            if (reconciled.kind === "acknowledged") {
              cache.current.revisions[timer.id] = reconciled.revision;
              if (reconciled.clearPending) delete pending[timer.id];
              if (cache.current.attempts)
                delete cache.current.attempts[timer.id];
            } else if (reconciled.kind === "conflict") {
              conflictingIds.current.add(timer.id);
              conflict.current = true;
              setHasConflict(true);
              setReadOnly(true);
              setError(
                "This session has different saved changes. Your browser copy is safe. Retry sync, or use the account version while keeping a backup.",
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
      if (!viewOnly && !conflict.current) {
        const active = cache.current.sessions.find((s) => !s.status && owns(s));
        if (active?.running) {
          const recovered = pauseAfterInterruption(
            active,
            cache.current.heartbeat,
            Date.now(),
            uuid,
          );
          if (recovered !== active) {
            if (owner !== "local") recovered.sync_write_id = uuid();
            cache.current.sessions = cache.current.sessions.map((s) =>
              s.id === active.id ? recovered : s,
            );
            if (owner !== "local") cache.current.pending[active.id] = recovered;
            setNotice(
              "Timer paused after an interruption. Resume when you’re ready.",
            );
          }
        }
      }
      if (cache.current.heartbeat) {
        const beat = cache.current.heartbeat;
        beat.mono = performance.now() - Math.max(0, Date.now() - beat.wall);
      }
      setLegacySessions([...legacyIds.current]);
      setSessions(cache.current.sessions);
      setReady(true);
      setSyncStatus(
        owner === "local"
          ? "Saved in this browser"
          : conflict.current
            ? "Sync needs attention"
            : loadedFromServer
              ? "Progress synced"
              : "Offline browser copy",
      );
      if (loadedFromServer) setLastSynced(Date.now());
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
            writeAccess.current = false;
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
  }, [owner, deviceId, owns, persist, flush]);
  useEffect(() => {
    if (!clockReady) return;
    let lastPersist = 0;
    const tick = () => {
      const time = clockNow();
      setNow((previous) =>
        Math.floor(previous / 1000) === Math.floor(time / 1000)
          ? previous
          : time,
      );
      if (!ready || readOnly) return;
      const active = cache.current.sessions.find((s) => !s.status && owns(s));
      if (!active?.running) return;
      const recovered = pauseAfterInterruption(
        active,
        cache.current.heartbeat,
        Date.now(),
        uuid,
        performance.now(),
      );
      if (recovered !== active) {
        save(recovered);
        setNotice(
          "Timer paused after an interruption. Resume when you’re ready.",
        );
        return;
      }
      cache.current.heartbeat = {
        sessionId: active.id,
        at: time,
        wall: Date.now(),
        mono: performance.now(),
      };
      if (Date.now() - lastPersist >= 5000) {
        persist();
        lastPersist = Date.now();
      }
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
    const pauseOnExit = () => {
      if (!ready || readOnly) return;
      const active = cache.current.sessions.find((s) => !s.status && owns(s));
      if (active?.running) {
        const recovered = pauseAfterInterruption(
          active,
          cache.current.heartbeat,
          Date.now(),
          uuid,
          performance.now(),
        );
        save(
          recovered === active
            ? act(active, "pause", clockNow(), uuid)
            : recovered,
        );
      }
    };
    window.addEventListener("pagehide", pauseOnExit);
    tick();
    const timer = setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", pauseOnExit);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [ready, readOnly, save, clockNow, clockReady, persist, owns, signal]);
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
  const refreshProgress = useCallback(async () => {
    if (
      !owner ||
      owner === "local" ||
      !ready ||
      pulling.current ||
      syncing.current ||
      conflict.current
    )
      return;
    pulling.current = true;
    const generation = epoch.current;
    try {
      await flush();
      if (Object.keys(cache.current.pending).length) {
        setSyncStatus("Offline changes waiting to sync");
        return;
      }
      const rows = await api<SessionRow[]>("/api/sync", {
        method: "POST",
        body: JSON.stringify({ revisions: cache.current.revisions }),
      });
      if (
        generation !== epoch.current ||
        syncing.current ||
        Object.keys(cache.current.pending).length
      )
        return;
      const merged = mergeSessionUpdates(
        cache.current.sessions,
        cache.current.revisions,
        cache.current.pending,
        rows,
      );
      cache.current.sessions = merged.sessions;
      cache.current.revisions = merged.revisions;
      if (rows.length) {
        setSessions(merged.sessions);
        persist();
      }
      setLastSynced(Date.now());
      setSyncStatus("Progress synced");
      const active = cache.current.sessions.find((s) => !s.status && owns(s));
      if (active?.running && !readOnly) save(snapshot(active, clockNow()));
    } catch {
      setSyncStatus("Could not refresh. Retrying automatically.");
    } finally {
      pulling.current = false;
    }
  }, [owner, ready, flush, persist, owns, readOnly, save, clockNow]);
  useEffect(() => {
    if (!ready || owner === "local") return;
    const visible = () => {
      if (!document.hidden) void refreshProgress();
    };
    const timer = setInterval(visible, 15000);
    window.addEventListener("online", visible);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    void refreshProgress();
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", visible);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [ready, owner, refreshProgress]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  const active =
    sessions.find(
      (s) =>
        !s.status &&
        (s.device_id === deviceId ||
          (!s.device_id && legacySessions.includes(s.id))),
    ) ?? null;
  return {
    sessions,
    active,
    ready: ready && clockReady,
    clockSynced,
    now,
    notice,
    reminder: alerts.reminder,
    dismissReminder: alerts.dismissReminder,
    testReminder: alerts.testReminder,
    syncStatus,
    lastSynced,
    refreshProgress,
    error,
    readOnly,
    hasConflict,
    pauseAndSync: async () => {
      if (hasConflict)
        throw new Error(
          "Close the other timer tab and resolve any sync conflict before switching profiles.",
        );
      const active = cache.current.sessions.find((s) => !s.status && owns(s));
      if (active?.running && !readOnly) {
        const recovered = pauseAfterInterruption(
          active,
          cache.current.heartbeat,
          Date.now(),
          uuid,
          performance.now(),
        );
        save(
          recovered === active
            ? act(active, "pause", clockNow(), uuid)
            : recovered,
        );
      }
      const deadline = Date.now() + 32000;
      await flush();
      while (syncing.current && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 100));
      if (Object.keys(cache.current.pending).length)
        throw new Error(
          "Your timer is paused on this device. Reconnect and try again to save it before logging out.",
        );
    },
    exportBackup: () => {
      const archivedCopies: unknown[] = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith(`cadence:conflict-backup:${owner}:`))
            archivedCopies.push(JSON.parse(localStorage.getItem(key)!));
        }
      } catch {}
      const url = URL.createObjectURL(
        new Blob(
          [JSON.stringify({ ...cache.current, archivedCopies }, null, 2)],
          {
            type: "application/json",
          },
        ),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "cadence-session-backup.json";
      a.click();
      URL.revokeObjectURL(url);
    },
    retrySync: () => location.reload(),
    useCloudVersion: () => {
      if (
        conflict.current &&
        window.confirm(
          "Use the saved account version for the conflicting sessions? Your browser copy will be kept as a backup, and other unsynced sessions will still sync.",
        )
      ) {
        try {
          localStorage.setItem(
            `cadence:conflict-backup:${owner}:${Date.now()}`,
            JSON.stringify(cache.current),
          );
          const next = selectAccountVersion(
            cache.current,
            conflictingIds.current,
          );
          localStorage.setItem(
            `cadence:cache:${owner}`,
            JSON.stringify({ ...next, legacyIds: [...legacyIds.current] }),
          );
          location.reload();
        } catch {
          setError(
            "Could not save a safety backup. Download your browser copy before trying again.",
          );
        }
      }
    },
    remaining: active ? remaining(active, now) : 0,
    start: (work: number, rest: number, task?: Task) => {
      if (
        !ready ||
        !clockReady ||
        readOnly ||
        cache.current.sessions.some((s) => !s.status && owns(s))
      )
        return false;
      arm();
      const timer = begin(work, rest, clockNow(), uuid);
      timer.device_id = deviceId!;
      if (task) {
        timer.task_id = task.id;
        timer.task_name = task.name;
        timer.task_target_min = task.targetMin;
      }
      save(timer);
      return true;
    },
    extendWork: (minutes: 2 | 5) => {
      const timer = cache.current.sessions.find((s) => !s.status && owns(s));
      if (!timer || !ready || !clockReady || readOnly) return false;
      const recovered = pauseAfterInterruption(
        timer,
        cache.current.heartbeat,
        Date.now(),
        uuid,
        performance.now(),
      );
      const next = extendWork(recovered, minutes, clockNow());
      if (next === recovered) {
        if (recovered !== timer) save(recovered);
        return false;
      }
      save(next);
      setNotice(`Added ${minutes} minutes to this focus interval.`);
      return true;
    },
    action: (action: Parameters<typeof act>[1]) => {
      const timer = cache.current.sessions.find((s) => !s.status && owns(s));
      if (timer && !readOnly) {
        if (action === "resume") arm();
        const recovered = pauseAfterInterruption(
          timer,
          cache.current.heartbeat,
          Date.now(),
          uuid,
          performance.now(),
        );
        const next = act(recovered, action, clockNow(), uuid);
        save(next);
        if (action === "skip") {
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
