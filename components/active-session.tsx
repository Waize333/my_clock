"use client";
import { useEffect } from "react";
import Link from "next/link";
import { ArrowUpRight, Coffee, Feather, Pause, Play } from "lucide-react";
import { useApp } from "./provider";

export function ActiveSession({ visible }: { visible: boolean }) {
  const app = useApp();
  const seconds = Math.ceil(app.remaining / 1000);
  const clock = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const phase = app.active?.phase === "break" ? "Break" : "Focus";
  useEffect(() => {
    if (!app.active) return;
    const original = document.title;
    document.title = `${app.active.running ? "" : "Paused · "}${clock} · ${phase} · Cadence`;
    return () => {
      document.title = original;
    };
  }, [app.active, clock, phase]);
  if (!app.active || !visible) return null;
  return (
    <aside className="active-session-bar" aria-label="Current timer session">
      <span className="active-session-symbol" aria-hidden="true">
        {phase === "Break" ? <Coffee size={20} /> : <Feather size={20} />}
      </span>
      <div className="active-session-copy">
        <strong>{app.active.task_name || "Your focus session"}</strong>
        <span>
          {app.active.running ? `${phase} in progress` : `${phase} paused`}
        </span>
      </div>
      <span className="active-session-clock" aria-label={`${clock} remaining`}>
        {clock}
      </span>
      <button
        type="button"
        className="icon-button"
        disabled={app.readOnly || !app.ready}
        onClick={() => app.action(app.active!.running ? "pause" : "resume")}
        aria-label={
          app.active.running
            ? "Pause current session"
            : "Resume current session"
        }
      >
        {app.active.running ? <Pause size={19} /> : <Play size={19} />}
      </button>
      <Link
        className="active-session-open"
        href={`/dashboard/${app.profile.id}/timer`}
      >
        Open timer <ArrowUpRight size={17} aria-hidden="true" />
      </Link>
    </aside>
  );
}
