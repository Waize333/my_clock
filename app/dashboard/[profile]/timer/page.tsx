"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { formatStamp } from "@/lib/planner";
import { snapshot } from "@/lib/timer/core";
import {
  ArrowRight,
  Bell,
  Check,
  Pencil,
  Coffee,
  Feather,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
} from "lucide-react";
import { useApp } from "@/components/provider";
import { DurationEditor } from "@/components/duration-editor";
import { dailyStats } from "@/lib/stats";
export default function TimerPage() {
  const app = useApp();
  const [work, setWork] = useState(50);
  const [rest, setRest] = useState(10);
  const [editing, setEditing] = useState(false);
  const [notification, setNotification] = useState("");
  const [resetConfirm, setResetConfirm] = useState(false);
  useEffect(() => {
    setWork(app.profile.default_work_min);
    setRest(app.profile.default_break_min);
  }, [app.profile.default_work_min, app.profile.default_break_min]);
  const active = app.active;
  const isBreak = active?.phase === "break";
  const seconds = Math.ceil(active ? app.remaining / 1000 : work * 60);
  const minutes = Math.floor(seconds / 60);
  const progress = active
    ? 1 -
      app.remaining /
        ((isBreak ? active.planned_break_min : active.planned_work_min) * 60000)
    : 0;
  const stats = dailyStats(
    app.sessions,
    new Date(app.now),
    app.planner.timezone,
    app.planner.entries,
    app.now,
  );
  const disabled =
    !app.ready ||
    app.readOnly ||
    (!active &&
      (!Number.isInteger(work) ||
        work < 1 ||
        work > 180 ||
        !Number.isInteger(rest) ||
        rest < 1 ||
        rest > 60));
  async function notifications() {
    if (!("Notification" in window)) {
      setNotification("This browser does not support notifications.");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotification(
      permission === "granted"
        ? "Notifications are on. We’ll let you know when it’s time."
        : "Notifications are off. Transition banners will still appear here.",
    );
  }
  return (
    <div className="timer-page">
      <div className="page-intro">
        <div className="eyebrow">
          <span className="status-dot" />
          MAKE ROOM FOR WHAT MATTERS
        </div>
        <h1>Find your rhythm.</h1>
        <p>Time to focus. Space to breathe.</p>
      </div>
      <div className="timer-task-context">
        {active?.task_id ? (
          <>
            <strong>{active.task_name}</strong>
            <span>
              {Math.round(
                snapshot(active, app.now)
                  .intervals.filter((i) => i.type === "work")
                  .reduce((n, i) => n + i.duration_sec, 0) / 60,
              )}{" "}
              min this session · {active.task_target_min} min daily target
            </span>
            <span>
              Started {formatStamp(active.started_at, app.planner.timezone)}
            </span>
          </>
        ) : (
          <Link href={`/dashboard/${app.profile.id}/planner`}>
            Choose a task from your planner <ArrowRight size={13} />
          </Link>
        )}
      </div>
      <section className="timer-card" aria-label="Focus timer">
        <div className="timer-card-top">
          <span className="small-label">YOUR SESSION</span>
          <span className="session-state">
            <span className={`status-dot ${active?.running ? "pulse" : ""}`} />
            {active
              ? active.running
                ? "In progress"
                : "Paused"
              : "A fresh start"}
          </span>
        </div>
        <div className="phase-tabs">
          <span className={!isBreak ? "phase active" : "phase"}>
            <Feather size={15} />
            Focus
          </span>
          <span className={isBreak ? "phase active" : "phase"}>
            <Coffee size={16} />
            Break
          </span>
        </div>
        <div className="clock-wrap">
          <svg
            className="progress-ring"
            viewBox="0 0 320 320"
            aria-hidden="true"
          >
            <circle className="ring-track" cx="160" cy="160" r="150" />
            <circle
              className="ring-value"
              cx="160"
              cy="160"
              r="150"
              strokeDasharray={942.48}
              strokeDashoffset={942.48 * (1 - progress)}
              transform="rotate(-90 160 160)"
            />
          </svg>
          <div className="clock-face">
            <span
              className="clock"
              role="timer"
              aria-label={`${minutes} minutes ${seconds % 60} seconds remaining`}
            >
              {String(minutes).padStart(2, "0")}
              <span className="colon">:</span>
              {String(seconds % 60).padStart(2, "0")}
            </span>
            <span className="clock-caption">
              {active
                ? active.running
                  ? isBreak
                    ? "Let your mind wander."
                    : "One thing at a time."
                  : "Take the time you need."
                : "Nothing else, just this."}
            </span>
          </div>
        </div>
        <div className="timer-controls">
          <button
            className="icon-button secondary-control"
            title="Reset session"
            aria-label="Reset session"
            disabled={!active || disabled}
            onClick={() => setResetConfirm(true)}
          >
            <RotateCcw size={19} />
          </button>
          <button
            className="primary-button start-button"
            disabled={disabled}
            onClick={() =>
              active
                ? app.action(active.running ? "pause" : "resume")
                : app.start(work, rest)
            }
          >
            {active?.running ? (
              <Pause size={17} fill="currentColor" />
            ) : (
              <Play size={16} fill="currentColor" />
            )}
            {active
              ? active.running
                ? isBreak
                  ? "Pause break"
                  : "Pause focus"
                : "Resume session"
              : "Start focusing"}
          </button>
          <button
            className="icon-button secondary-control"
            title="Skip interval"
            aria-label="Skip interval"
            disabled={!active || disabled}
            onClick={() => app.action("skip")}
          >
            <SkipForward size={20} />
          </button>
        </div>
        {active && (
          <button
            className="text-button finish-button"
            onClick={() => app.action("finish")}
            disabled={disabled}
          >
            <Check size={14} />
            Finish session
          </button>
        )}
        <div className="duration-row duration-tiles">
          <button
            className={`duration-tile ${editing ? "editing" : ""}`}
            disabled={!!active}
            onClick={() => setEditing(!editing)}
          >
            <Feather size={14} />
            <span>
              Focus
              <strong>
                {active?.planned_work_min ?? work}
                <small> min</small>
              </strong>
            </span>
            {!active && <Pencil size={12} />}
          </button>
          <button
            className={`duration-tile ${editing ? "editing" : ""}`}
            disabled={!!active}
            onClick={() => setEditing(!editing)}
          >
            <Coffee size={15} />
            <span>
              Break
              <strong>
                {active?.planned_break_min ?? rest}
                <small> min</small>
              </strong>
            </span>
            {!active && <Pencil size={12} />}
          </button>
        </div>
        {editing && !active && (
          <DurationEditor
            work={work}
            rest={rest}
            setWork={setWork}
            setRest={setRest}
            onClose={() => setEditing(false)}
          />
        )}
      </section>
      <section className="today-card" aria-label="Today’s overview">
        <div className="today-heading">
          <span className="small-label">A LITTLE PROGRESS, TODAY</span>
          <a
            href={`/dashboard/${app.profile.id}/stats`}
            aria-label="View insights"
          >
            <ArrowRight size={17} />
          </a>
        </div>
        <div className="today-metrics">
          <div>
            <strong>
              {stats.minutes}
              <span> min</span>
            </strong>
            <span>Focused time</span>
          </div>
          <div>
            <strong>
              {stats.completed}
              <span> intervals</span>
            </strong>
            <span>Focus intervals completed</span>
          </div>
          <div>
            <strong>{stats.started ? `${stats.rate}%` : "—"}</strong>
            <span>Completion rate</span>
          </div>
        </div>
      </section>
      <div className="gentle-note">
        <Feather size={16} />
        <p>Good work starts with a little breathing room.</p>
      </div>
      <button className="notification-button" onClick={notifications}>
        <Bell size={13} />
        Enable gentle reminders
      </button>
      {notification && (
        <p className="notification-feedback" role="status">
          {notification}
        </p>
      )}
      {resetConfirm && (
        <div className="modal-backdrop">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
          >
            <h2 id="reset-title">Start with a clean slate?</h2>
            <p>
              This session will be marked abandoned. Your focused time will
              still count.
            </p>
            <div className="modal-actions">
              <button
                className="small-button"
                onClick={() => setResetConfirm(false)}
              >
                Keep going
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  app.action("reset");
                  setResetConfirm(false);
                }}
              >
                Reset session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
