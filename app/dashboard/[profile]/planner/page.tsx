"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Play,
  Pencil,
  Archive,
  Check,
  Clock3,
  CalendarDays,
  X,
  Download,
  RotateCcw,
} from "lucide-react";
import { useApp } from "@/components/provider";
import {
  addDays,
  dayKey,
  weekKey,
  tasksForWeek,
  setWeekTasks,
  loggedDays,
  weekSummary,
  formatStamp,
  localInput,
  fromLocalInput,
  validTimezone,
  type Task,
  type ManualEntry,
} from "@/lib/planner";
import { snapshot } from "@/lib/timer/core";
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hours = (seconds: number) =>
  seconds > 0 && seconds < 60
    ? `${Math.max(1, Math.round(seconds))}s`
    : seconds >= 60 && seconds < 3600
      ? `${(seconds / 60).toFixed(1)}m`
      : `${(seconds / 3600).toFixed(1)}h`;
const labelDate = (day: string) =>
  new Date(day + "T12:00:00Z").toLocaleDateString(undefined, {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      className="planner-dialog"
      ref={ref}
      onCancel={close}
      aria-labelledby={headingId}
    >
      <div className="planner-dialog-heading">
        <div>
          <span className="eyebrow">MAKE IT YOURS</span>
          <h2 id={headingId}>{title}</h2>
        </div>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close editor"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function TaskEditor({
  task,
  week,
  busy,
  close,
  save,
}: {
  task: Task;
  week: string;
  busy: boolean;
  close: () => void;
  save: (task: Task) => Promise<void>;
}) {
  const [draft, setDraft] = useState(task),
    [error, setError] = useState("");
  const update = (v: Partial<Task>) => setDraft({ ...draft, ...v });
  return (
    <Modal
      title={task.name ? "Edit your task" : "A little space for a new task"}
      close={close}
    >
      <form
        className="planner-form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await save({
              ...draft,
              name: draft.name.trim(),
              fields: draft.fields.filter((f) => f.label.trim()),
            });
            close();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not save.");
          }
        }}
      >
        <p className="form-hint">
          Applies from the week of {labelDate(week)}. Earlier weeks stay
          unchanged. Later weeks with their own edits keep those edits.
        </p>
        <label>
          Task name
          <input
            required
            maxLength={100}
            value={draft.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="e.g. Coursework"
            autoFocus
          />
        </label>
        <div className="planner-form-grid">
          <label>
            Daily focus target · minutes
            <input
              type="number"
              min="1"
              max="1440"
              required
              value={draft.targetMin}
              onChange={(e) => update({ targetMin: Number(e.target.value) })}
            />
          </label>
          <label>
            Category
            <input
              maxLength={60}
              value={draft.category}
              onChange={(e) => update({ category: e.target.value })}
              placeholder="Study, work, personal…"
            />
          </label>
        </div>
        <div className="planner-form-grid">
          <label>
            Work interval · minutes
            <input
              type="number"
              min="1"
              max="180"
              required
              value={draft.workMin}
              onChange={(e) => update({ workMin: Number(e.target.value) })}
            />
          </label>
          <label>
            Break interval · minutes
            <input
              type="number"
              min="1"
              max="60"
              required
              value={draft.breakMin}
              onChange={(e) => update({ breakMin: Number(e.target.value) })}
            />
          </label>
        </div>
        <fieldset className="planner-days">
          <legend>Scheduled days</legend>
          {days.map((d, i) => (
            <label key={d}>
              <input
                type="checkbox"
                checked={draft.days.includes(i)}
                onChange={(e) =>
                  update({
                    days: e.target.checked
                      ? [...draft.days, i].sort()
                      : draft.days.filter((n) => n !== i),
                  })
                }
              />
              <span>{d}</span>
            </label>
          ))}
        </fieldset>
        <label>
          Priority
          <select
            value={draft.priority}
            onChange={(e) =>
              update({ priority: e.target.value as Task["priority"] })
            }
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </label>
        <label>
          Notes
          <textarea
            maxLength={2000}
            rows={3}
            value={draft.notes}
            onChange={(e) => update({ notes: e.target.value })}
            placeholder="What would a good session look like?"
          />
        </label>
        <div className="custom-fields-heading">
          <strong>Your custom fields</strong>
          <button
            type="button"
            className="text-button"
            disabled={draft.fields.length >= 12}
            onClick={() =>
              update({ fields: [...draft.fields, { label: "", value: "" }] })
            }
          >
            <Plus size={14} /> Add field
          </button>
        </div>
        {draft.fields.map((field, i) => (
          <div className="custom-field-row" key={i}>
            <input
              aria-label={`Field ${i + 1} name`}
              placeholder="Field name"
              maxLength={40}
              value={field.label}
              onChange={(e) =>
                update({
                  fields: draft.fields.map((f, n) =>
                    n === i ? { ...f, label: e.target.value } : f,
                  ),
                })
              }
            />
            <input
              aria-label={`Field ${i + 1} value`}
              placeholder="Value"
              maxLength={200}
              value={field.value}
              onChange={(e) =>
                update({
                  fields: draft.fields.map((f, n) =>
                    n === i ? { ...f, value: e.target.value } : f,
                  ),
                })
              }
            />
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove field ${i + 1}`}
              onClick={() =>
                update({ fields: draft.fields.filter((_, n) => n !== i) })
              }
            >
              <X size={16} />
            </button>
          </div>
        ))}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="planner-form-footer">
          <button type="button" className="secondary-button" onClick={close}>
            Cancel
          </button>
          <button className="primary-button" disabled={busy}>
            {busy ? "Saving…" : "Save task"}
            <Check size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
function LogEditor({
  entry,
  tasks,
  zone,
  busy,
  now,
  close,
  save,
}: {
  entry: ManualEntry | null;
  tasks: Task[];
  zone: string;
  busy: boolean;
  now: number;
  close: () => void;
  save: (entry: ManualEntry) => Promise<void>;
}) {
  const [taskId, setTask] = useState(entry?.taskId || ""),
    [start, setStart] = useState(
      localInput(entry?.startedAt || now - 3600000, zone),
    ),
    [end, setEnd] = useState(localInput(entry?.endedAt || now, zone)),
    [notes, setNotes] = useState(entry?.notes || ""),
    [error, setError] = useState("");
  return (
    <Modal
      title={entry ? "Edit logged time" : "Log work away from the timer"}
      close={close}
    >
      <form
        className="planner-form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const startedAt = fromLocalInput(start, zone),
              endedAt = fromLocalInput(end, zone);
            const duration = Date.parse(endedAt) - Date.parse(startedAt);
            if (duration <= 0 || duration > 86400000)
              throw new Error(
                "End must follow start, with no more than 24 hours per entry.",
              );
            if (Date.parse(endedAt) > now + 60000)
              throw new Error("Log completed work, not future time.");
            const stamp = new Date(now).toISOString();
            await save({
              id: entry?.id || crypto.randomUUID(),
              taskId: taskId || null,
              taskName:
                tasks.find((t) => t.id === taskId)?.name ||
                entry?.taskName ||
                "Extra / ad-hoc",
              startedAt,
              endedAt,
              notes,
              createdAt: entry?.createdAt || stamp,
              updatedAt: stamp,
            });
            close();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not log time.");
          }
        }}
      >
        <p className="form-hint">
          Times are in {zone}. Log only work that your timer has not already
          recorded. Breaks should not be included.
        </p>
        <label>
          Task
          <select value={taskId} onChange={(e) => setTask(e.target.value)}>
            <option value="">Extra / ad-hoc hours</option>
            {entry?.taskId && !tasks.some((t) => t.id === entry.taskId) && (
              <option value={entry.taskId}>{entry.taskName}</option>
            )}
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Started
          <input
            type="datetime-local"
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label>
          Ended
          <input
            type="datetime-local"
            required
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <label>
          Notes
          <textarea
            rows={3}
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What did you work on?"
          />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="planner-form-footer">
          <button type="button" className="secondary-button" onClick={close}>
            Cancel
          </button>
          <button className="primary-button" disabled={busy}>
            {busy ? "Saving…" : "Save time"}
            <Check size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
export default function PlannerPage() {
  const app = useApp(),
    router = useRouter();
  const p = app.planner,
    today = dayKey(app.now, p.timezone),
    currentWeek = weekKey(today);
  const [chosenWeek, setWeek] = useState<string | null>(null),
    [view, setView] = useState<"week" | "history">("week"),
    [editTask, setEditTask] = useState<Task | null>(null),
    [logEditor, setLogEditor] = useState<ManualEntry | "new" | null>(null),
    [message, setMessage] = useState(""),
    [zone, setZone] = useState(""),
    [archived, setArchived] = useState(false);
  const week = chosenWeek || currentWeek,
    tasks = tasksForWeek(p, week),
    visible = tasks.filter((t) => archived || !t.archived),
    summary = weekSummary(p, week, app.sessions, app.now);
  useEffect(() => {
    setZone(p.timezone);
  }, [p.timezone]);
  const stamp = () => new Date(app.now).toISOString();
  const makeTask = (name = ""): Task => ({
    id: crypto.randomUUID(),
    name,
    targetMin: 120,
    workMin: 25,
    breakMin: 5,
    days: [0, 1, 2, 3, 4],
    category: "",
    priority: "normal",
    notes: "",
    fields: [],
    archived: false,
    createdAt: stamp(),
    updatedAt: stamp(),
  });
  async function storeTasks(next: Task[]) {
    await app.savePlanner(setWeekTasks(p, week, next));
  }
  async function saveTask(task: Task) {
    const next = { ...task, updatedAt: stamp() };
    await storeTasks(
      tasks.some((t) => t.id === next.id)
        ? tasks.map((t) => (t.id === next.id ? next : t))
        : [...tasks, next],
    );
  }
  async function run(action: () => Promise<void>) {
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save.");
    }
  }
  function startTask(task: Task) {
    if (!app.start(task.workMin, task.breakMin, task)) {
      setMessage(
        app.active
          ? "Finish or reset your current timer before starting another task. Its logged time will be kept."
          : "Wait for the timer to load, or close the other timer tab.",
      );
      return;
    }
    router.push(`/dashboard/${app.profile.id}/timer`);
  }
  function exportPlanner() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { planner: p, sessions: app.sessions, exportedAt: stamp() },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `cadence-planner-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const historyStart = Object.keys(p.plans).sort()[0] || currentWeek;
  const historyWeeks = Array.from(
    {
      length: Math.min(
        260,
        Math.max(
          1,
          Math.round(
            (Date.parse(currentWeek) - Date.parse(historyStart)) / 604800000,
          ) + 1,
        ),
      ),
    },
    (_, i) => addDays(currentWeek, -i * 7),
  );
  const weekEntries = p.entries
    .filter((e) =>
      summary.days.some((d) => {
        const byDay = loggedDays([], [e], p.timezone, app.now);
        return (byDay[d] || 0) > 0;
      }),
    )
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const weekSessions = app.sessions.filter(
    (s) =>
      summary.days.some(
        (d) => (loggedDays([s], [], p.timezone, app.now)[d] || 0) > 0,
      ) || summary.days.includes(dayKey(s.started_at, p.timezone)),
  );
  return (
    <div className="planner-page">
      <div className="planner-intro">
        <div>
          <div className="eyebrow">A LITTLE INTENTION, EVERY DAY</div>
          <h1>Your week, in rhythm.</h1>
          <p>Make a plan. Find your focus. See how far you’ve come.</p>
        </div>
        <div className="planner-top-actions">
          <button
            className="secondary-button"
            onClick={() => setLogEditor("new")}
            disabled={!app.plannerReady}
          >
            <Plus size={15} /> Log time
          </button>
          <button
            className="primary-button"
            onClick={() => setEditTask(makeTask())}
            disabled={!app.plannerReady}
          >
            <Plus size={16} /> New task
          </button>
        </div>
      </div>
      <div className="planner-clock">
        <span
          className={`status-dot ${app.clockSynced ? "" : "clock-offline"}`}
        />
        <time dateTime={app.accountReady ? stamp() : undefined}>
          {app.accountReady
            ? formatStamp(app.now, p.timezone)
            : "Synchronizing clock…"}
        </time>
        <span>
          {app.clockSynced ? "Server-synced" : "Offline · clock estimate"}
        </span>
        <details>
          <summary>Timezone</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!validTimezone(zone)) {
                setMessage("Choose a valid timezone, such as Asia/Karachi.");
                return;
              }
              void run(() => app.savePlanner({ ...p, timezone: zone }));
            }}
          >
            <label>
              Timezone
              <input
                list="timezones"
                aria-label="Timezone"
                value={zone}
                onChange={(e) => setZone(e.target.value)}
              />
            </label>
            <datalist id="timezones">
              {[
                "UTC",
                "Asia/Karachi",
                "Asia/Kolkata",
                "Asia/Dubai",
                "Europe/London",
                "Europe/Berlin",
                "America/New_York",
                "America/Los_Angeles",
                "Australia/Sydney",
              ].map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
            <button
              className="small-button"
              disabled={app.plannerBusy || !app.plannerReady}
            >
              Apply
            </button>
          </form>
        </details>
      </div>
      {(app.plannerError || message) && (
        <div role="alert" className="error-banner">
          {message || app.plannerError}
          <button
            className="small-button"
            onClick={() => {
              setMessage("");
              void app.reloadPlanner();
            }}
          >
            Reload planner
          </button>
        </div>
      )}
      {!app.plannerReady ? (
        <div className="planner-empty">
          <Clock3 />
          <h2>
            {app.plannerError
              ? "Your planner could not load"
              : "Opening your planner…"}
          </h2>
          <p>
            {app.plannerError
              ? "Reconnect and reload to access your saved tasks."
              : "Your week is on its way."}
          </p>
        </div>
      ) : (
        <>
          <div className="planner-toolbar">
            <div className="segmented">
              <button
                className={view === "week" ? "active" : ""}
                onClick={() => setView("week")}
              >
                Weekly planner
              </button>
              <button
                className={view === "history" ? "active" : ""}
                onClick={() => setView("history")}
              >
                History & trends
              </button>
            </div>
            <button className="text-button" onClick={exportPlanner}>
              <Download size={14} /> Export backup
            </button>
          </div>
          {view === "week" ? (
            <>
              <div className="week-navigation">
                <button
                  className="icon-button"
                  aria-label="Previous week"
                  onClick={() => setWeek(addDays(week, -7))}
                >
                  <ArrowLeft size={18} />
                </button>
                <div>
                  <strong>
                    {labelDate(week)} — {labelDate(addDays(week, 6))}
                  </strong>
                  <span>
                    {week.slice(0, 4)} ·{" "}
                    {week === currentWeek
                      ? "This week"
                      : week < currentWeek
                        ? "Past week"
                        : "Upcoming week"}
                  </span>
                </div>
                <button
                  className="icon-button"
                  aria-label="Next week"
                  onClick={() => setWeek(addDays(week, 7))}
                >
                  <ArrowRight size={18} />
                </button>
                <button className="small-button" onClick={() => setWeek(null)}>
                  Today
                </button>
              </div>
              <div className="planner-kpis">
                {[
                  {
                    label: "Scheduled focus",
                    value: hours(summary.target),
                    hint: "Your weekly intention",
                  },
                  {
                    label: "Logged focus",
                    value: hours(summary.total),
                    hint: `${hours(summary.extra)} extra / ad-hoc`,
                  },
                  {
                    label: "Of weekly target",
                    value: `${summary.percent.toFixed(1)}%`,
                    hint: "Timer + manual entries",
                  },
                  {
                    label: "Still to go",
                    value: hours(summary.remaining),
                    hint: "One session at a time",
                  },
                ].map((k, i) => (
                  <div
                    key={k.label}
                    className={
                      i === 2 ? "planner-kpi highlighted" : "planner-kpi"
                    }
                  >
                    <span>{k.label}</span>
                    <strong>{k.value}</strong>
                    <small>{k.hint}</small>
                    {i === 2 && (
                      <div className="planner-meter">
                        <i
                          style={{
                            width: `${Math.min(100, summary.percent)}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <section className="planner-grid-panel">
                <div className="planner-panel-title">
                  <div>
                    <h2>The weekly split</h2>
                    <p>
                      Check off completion. Your timer takes care of the hours.
                    </p>
                  </div>
                  <label className="archive-toggle">
                    <input
                      type="checkbox"
                      checked={archived}
                      onChange={(e) => setArchived(e.target.checked)}
                    />{" "}
                    Show archived
                  </label>
                </div>
                {visible.length ? (
                  <div
                    className="planner-table-wrap"
                    tabIndex={0}
                    role="region"
                    aria-label="Weekly tasks; scroll horizontally for all days"
                  >
                    <table className="planner-table">
                      <thead>
                        <tr>
                          <th scope="col">TASK / DAILY TARGET</th>
                          {summary.days.map((d, i) => (
                            <th
                              scope="col"
                              key={d}
                              className={d === today ? "is-today" : ""}
                            >
                              <span>{days[i]}</span>
                              <strong>
                                {new Date(d + "T12:00:00Z").getUTCDate()}
                              </strong>
                              {d === today && <small>TODAY</small>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((task) => {
                          const logged = loggedDays(
                            app.sessions,
                            p.entries,
                            p.timezone,
                            app.now,
                            task.id,
                          );
                          return (
                            <tr
                              key={task.id}
                              className={task.archived ? "archived-task" : ""}
                            >
                              <th scope="row">
                                <div className="planner-task-name">
                                  <strong>{task.name}</strong>
                                  {task.priority === "high" && (
                                    <span className="priority-tag">
                                      High priority
                                    </span>
                                  )}
                                </div>
                                <span className="planner-task-meta">
                                  {hours(task.targetMin * 60)} target ·{" "}
                                  {task.workMin}/{task.breakMin} rhythm
                                  {task.category ? ` · ${task.category}` : ""}
                                </span>
                                {task.fields.length > 0 && (
                                  <div className="task-fields">
                                    {task.fields.map((f, i) => (
                                      <span key={i}>
                                        {f.label}: {f.value}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {task.notes && (
                                  <details className="task-notes">
                                    <summary>Notes</summary>
                                    <p>{task.notes}</p>
                                  </details>
                                )}
                                <div className="planner-task-actions">
                                  <button
                                    className="task-start"
                                    disabled={
                                      task.archived ||
                                      !app.ready ||
                                      app.readOnly ||
                                      !!app.active
                                    }
                                    onClick={() => startTask(task)}
                                  >
                                    <Play size={12} /> Start
                                  </button>
                                  <button
                                    className="icon-button"
                                    aria-label={`Edit ${task.name}`}
                                    onClick={() => setEditTask(task)}
                                  >
                                    <Pencil size={13} />
                                  </button>
                                  <button
                                    className="icon-button"
                                    aria-label={`${task.archived ? "Restore" : "Archive"} ${task.name}`}
                                    disabled={app.plannerBusy}
                                    onClick={() =>
                                      void run(() =>
                                        saveTask({
                                          ...task,
                                          archived: !task.archived,
                                        }),
                                      )
                                    }
                                  >
                                    {task.archived ? (
                                      <RotateCcw size={13} />
                                    ) : (
                                      <Archive size={13} />
                                    )}
                                  </button>
                                </div>
                              </th>
                              {summary.days.map((d, i) => {
                                const key = `${d}:${task.id}`,
                                  checked = !!p.checks[key],
                                  scheduled =
                                    !task.archived && task.days.includes(i),
                                  secs = logged[d] || 0;
                                return (
                                  <td
                                    key={d}
                                    className={d === today ? "is-today" : ""}
                                  >
                                    {scheduled ? (
                                      <>
                                        <label
                                          className="task-day-check"
                                          title={
                                            checked
                                              ? `Completed ${formatStamp(p.checks[key], p.timezone)}`
                                              : `Mark ${task.name} complete`
                                          }
                                        >
                                          <input
                                            type="checkbox"
                                            aria-label={`${task.name} complete on ${d}`}
                                            checked={checked}
                                            disabled={
                                              app.plannerBusy || d > today
                                            }
                                            onChange={() =>
                                              void run(async () => {
                                                const checks = { ...p.checks };
                                                if (checked) delete checks[key];
                                                else checks[key] = stamp();
                                                await app.savePlanner({
                                                  ...p,
                                                  checks,
                                                });
                                              })
                                            }
                                          />
                                          <span>
                                            <Check size={14} />
                                          </span>
                                        </label>
                                        <small>
                                          {hours(secs)} /{" "}
                                          {hours(task.targetMin * 60)}
                                        </small>
                                        <div className="cell-meter">
                                          <i
                                            style={{
                                              width: `${Math.min(100, (secs / (task.targetMin * 60)) * 100)}%`,
                                            }}
                                          />
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        <span className="off-day">Off</span>
                                        {secs > 0 && (
                                          <small>{hours(secs)} logged</small>
                                        )}
                                      </>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th scope="row">Scheduled</th>
                          {summary.planned.map((v, i) => (
                            <td key={i}>{hours(v)}</td>
                          ))}
                        </tr>
                        <tr>
                          <th scope="row">Logged · all focus</th>
                          {summary.actual.map((v, i) => (
                            <td key={i}>{hours(v)}</td>
                          ))}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="planner-empty">
                    <CalendarDays size={36} />
                    <h2>A fresh week starts here.</h2>
                    <p>
                      Add your own tasks, or start with the four routines from
                      your sheet.
                      <br />
                      You can adjust every day, duration, and field.
                    </p>
                    <div>
                      <button
                        className="primary-button"
                        onClick={() => setEditTask(makeTask())}
                      >
                        <Plus size={15} /> Create first task
                      </button>
                      <button
                        className="secondary-button"
                        disabled={app.plannerBusy}
                        onClick={() =>
                          void run(() =>
                            storeTasks([
                              ...tasks,
                              ...[
                                "Coursework",
                                "Fornext & Client Work",
                                "Masters Prep & German",
                                "Startups & Idea Pitching",
                              ].map((name, i) => ({
                                ...makeTask(name),
                                targetMin: [60, 120, 90, 180][i],
                              })),
                            ]),
                          )
                        }
                      >
                        Use sheet template
                      </button>
                    </div>
                    <small>
                      Template starts Monday–Friday. Adjust the split to match
                      your schedule.
                    </small>
                  </div>
                )}
              </section>
              <div className="planner-bottom-grid">
                <section className="panel planner-today">
                  <div className="planner-panel-title">
                    <div>
                      <span className="eyebrow">ONE THING AT A TIME</span>
                      <h2>
                        {week === currentWeek
                          ? "On your list today"
                          : "Your weekly rhythm"}
                      </h2>
                    </div>
                    <Clock3 size={19} />
                  </div>
                  {tasks
                    .filter(
                      (t) =>
                        !t.archived &&
                        (week !== currentWeek ||
                          t.days.includes(
                            (new Date(today + "T12:00Z").getUTCDay() + 6) % 7,
                          )),
                    )
                    .map((t) => (
                      <div className="today-task" key={t.id}>
                        <div>
                          <strong>{t.name}</strong>
                          <span>
                            {t.workMin} min focus · {t.breakMin} min break
                          </span>
                        </div>
                        <button
                          className="icon-button"
                          aria-label={`Start ${t.name}`}
                          disabled={!app.ready || app.readOnly || !!app.active}
                          onClick={() => startTask(t)}
                        >
                          <Play size={16} />
                        </button>
                      </div>
                    ))}
                  {!tasks.some((t) => !t.archived) && (
                    <p className="form-hint">
                      Your scheduled tasks will appear here.
                    </p>
                  )}
                  {app.active && (
                    <button
                      className="text-button"
                      onClick={() =>
                        router.push(`/dashboard/${app.profile.id}/timer`)
                      }
                    >
                      Return to running timer <ArrowRight size={15} />
                    </button>
                  )}
                </section>
                <section className="panel planner-week-note">
                  <span className="eyebrow">LOOK BACK, MOVE FORWARD</span>
                  <h2>A note for this week</h2>
                  <form
                    key={week + ":" + (p.notes[week] || "")}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const text = String(
                        new FormData(e.currentTarget).get("note") || "",
                      );
                      void run(() =>
                        app.savePlanner({
                          ...p,
                          notes: { ...p.notes, [week]: text },
                        }),
                      );
                    }}
                  >
                    <textarea
                      name="note"
                      rows={4}
                      maxLength={2000}
                      defaultValue={p.notes[week] || ""}
                      placeholder="What worked? What would you like to change?"
                      aria-label="Weekly notes"
                    />
                    <button className="small-button" disabled={app.plannerBusy}>
                      Save note
                    </button>
                  </form>
                </section>
              </div>
              <section className="panel planner-activity">
                <div className="planner-panel-title">
                  <div>
                    <h2>Every little bit counts</h2>
                    <p>Session and manual-entry timestamps · {p.timezone}</p>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setLogEditor("new")}
                  >
                    <Plus size={14} /> Log time
                  </button>
                </div>
                {!weekEntries.length && !weekSessions.length && (
                  <p className="planner-activity-empty">
                    Start a task or log time to begin your timeline.
                  </p>
                )}
                {weekEntries.map((e) => (
                  <div className="activity-row" key={e.id}>
                    <span className="activity-icon">
                      <Pencil size={16} />
                    </span>
                    <div>
                      <strong>
                        {e.taskId ? e.taskName : "Extra / ad-hoc"}
                      </strong>
                      <span>
                        {formatStamp(e.startedAt, p.timezone)} →{" "}
                        {formatStamp(e.endedAt, p.timezone)}
                      </span>
                      {e.notes && <p>{e.notes}</p>}
                      <small>
                        Manual · entered {formatStamp(e.createdAt, p.timezone)}
                        {e.updatedAt !== e.createdAt
                          ? ` · edited ${formatStamp(e.updatedAt, p.timezone)}`
                          : ""}
                      </small>
                    </div>
                    <strong>
                      {hours(
                        (Date.parse(e.endedAt) - Date.parse(e.startedAt)) /
                          1000,
                      )}
                    </strong>
                    <button
                      className="icon-button"
                      aria-label={`Edit log ${e.taskName}`}
                      onClick={() => setLogEditor(e)}
                    >
                      <Pencil size={15} />
                    </button>
                  </div>
                ))}
                {weekSessions.map((raw) => {
                  const s = snapshot(raw, app.now);
                  return (
                    <details className="session-timeline" key={s.id}>
                      <summary>
                        <span>
                          <strong>{s.task_name || "Open focus"}</strong>
                          <small>
                            {formatStamp(s.started_at, p.timezone)} →{" "}
                            {s.ended_at
                              ? formatStamp(s.ended_at, p.timezone)
                              : s.running
                                ? "Running"
                                : "Paused"}
                          </small>
                        </span>
                        <strong>
                          {hours(
                            s.intervals
                              .filter((i) => i.type === "work")
                              .reduce((n, i) => n + i.duration_sec, 0),
                          )}
                        </strong>
                      </summary>
                      <div>
                        {s.intervals.map((i) => (
                          <div className="interval-timeline" key={i.id}>
                            <strong>
                              {i.type === "work" ? "Focus" : "Break"} ·{" "}
                              {Math.round((i.duration_sec / 60) * 10) / 10} min{" "}
                              {i.completed
                                ? "· completed"
                                : i.ended_at
                                  ? "· partial"
                                  : "· current"}
                            </strong>
                            <span>
                              {formatStamp(i.started_at, p.timezone)} →{" "}
                              {i.ended_at
                                ? formatStamp(i.ended_at, p.timezone)
                                : "In progress"}
                            </span>
                            {i.spans?.map((span, n) => (
                              <small key={n}>
                                Active{" "}
                                {formatStamp(span.started_at, p.timezone)} →{" "}
                                {span.ended_at
                                  ? formatStamp(span.ended_at, p.timezone)
                                  : s.running
                                    ? "Now"
                                    : "Paused"}
                              </small>
                            ))}
                            {(i.spans?.length || 0) > 1 && (
                              <small>
                                Gaps between active ranges are pauses and don’t
                                count toward focus.
                              </small>
                            )}
                            {!i.spans && (
                              <small>
                                Earlier session: detailed pause timestamps were
                                not recorded.
                              </small>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  );
                })}
              </section>
            </>
          ) : (
            <section className="panel planner-history">
              <div className="planner-panel-title">
                <div>
                  <h2>Your progress, week by week</h2>
                  <p>
                    Weeks roll forward automatically. Your old plans and logs
                    stay here.
                  </p>
                </div>
                <CalendarDays size={22} />
              </div>
              <div className="planner-table-wrap">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Week starting</th>
                      <th>Scheduled</th>
                      <th>Logged</th>
                      <th>Extra</th>
                      <th>Progress</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {historyWeeks.map((w) => {
                      const s = weekSummary(p, w, app.sessions, app.now);
                      return (
                        <tr key={w}>
                          <th>
                            <strong>
                              {labelDate(w)}, {w.slice(0, 4)}
                            </strong>
                            {p.notes[w] && <small>{p.notes[w]}</small>}
                          </th>
                          <td>{hours(s.target)}</td>
                          <td>{hours(s.total)}</td>
                          <td>{hours(s.extra)}</td>
                          <td>
                            <span>{s.percent.toFixed(1)}%</span>
                            <div className="cell-meter">
                              <i
                                style={{
                                  width: `${Math.min(100, s.percent)}%`,
                                }}
                              />
                            </div>
                          </td>
                          <td>
                            <button
                              className="small-button"
                              onClick={() => {
                                setWeek(w);
                                setView("week");
                              }}
                            >
                              Open
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="form-hint">
                Manual entries count toward logged time. Checkmarks track
                completion only. Focus on off-days still counts toward your
                totals.
              </p>
            </section>
          )}
        </>
      )}
      {editTask && (
        <TaskEditor
          task={editTask}
          week={week}
          busy={app.plannerBusy}
          close={() => setEditTask(null)}
          save={saveTask}
        />
      )}
      {logEditor && (
        <LogEditor
          entry={logEditor === "new" ? null : logEditor}
          tasks={tasks}
          zone={p.timezone}
          busy={app.plannerBusy}
          now={app.now}
          close={() => setLogEditor(null)}
          save={async (entry) => {
            await app.savePlanner({
              ...p,
              entries: p.entries.some((e) => e.id === entry.id)
                ? p.entries.map((e) => (e.id === entry.id ? entry : e))
                : [...p.entries, entry],
            });
          }}
        />
      )}
    </div>
  );
}
