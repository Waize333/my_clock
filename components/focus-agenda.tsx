"use client";
import { useState } from "react";
import { ArrowRight, Check, Feather, Play } from "lucide-react";
import { dailyFocus } from "@/lib/focus-plan";
import type { Task, LogIndex } from "@/lib/planner";

export function FocusAgenda({
  tasks,
  day,
  checks,
  logs,
  disabled,
  start,
  create,
}: {
  tasks: Task[];
  day: string;
  checks: Record<string, string>;
  logs: LogIndex;
  disabled: boolean;
  start: (task: Task) => void;
  create: () => void;
}) {
  const items = dailyFocus(tasks, day, checks, logs);
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? items : items.slice(0, 3);
  const completed = items.filter((item) => item.done).length;
  return (
    <section className="focus-agenda" aria-labelledby="focus-agenda-heading">
      <div className="focus-agenda-heading">
        <div>
          <span className="eyebrow">A CLEAR PLACE TO BEGIN</span>
          <h2 id="focus-agenda-heading">Today’s focus</h2>
          <p>
            {items.length
              ? "Choose one task. Give it your attention."
              : "A little intention makes room for a good day."}
          </p>
        </div>
        {items.length > 0 && (
          <span className="focus-completion">
            <Check size={16} aria-hidden="true" />
            {completed} of {items.length} done today
          </span>
        )}
      </div>
      {items.length ? (
        <div className="focus-agenda-grid" id="focus-agenda-list">
          {displayed.map(
            ({ task, seconds, goalMet, checked, done, percent }, index) => (
              <article
                className={`focus-task-card ${done ? "goal-done" : ""}`}
                key={task.id}
              >
                <div className="focus-card-label">
                  <span>{task.category || "Personal focus"}</span>
                  {done ? (
                    <span className="focus-tag">
                      <Check size={13} />
                      {goalMet ? "Goal met" : checked ? "Checked off" : ""}
                    </span>
                  ) : index === 0 ? (
                    <span className="focus-tag">Up next</span>
                  ) : task.priority === "high" ? (
                    <span className="focus-tag">High priority</span>
                  ) : null}
                </div>
                <h3>{task.name}</h3>
                <div className="focus-progress-copy">
                  <strong>
                    {Math.floor(seconds / 60)}
                    <small> / {task.targetMin} min</small>
                  </strong>
                  <span>
                    {Math.max(0, Math.ceil(task.targetMin - seconds / 60))} min
                    to goal
                  </span>
                </div>
                <div
                  className="focus-goal-meter"
                  role="progressbar"
                  aria-label={`${task.name} daily time goal`}
                  aria-valuenow={Math.round(percent)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ width: `${percent}%` }} />
                </div>
                <div className="focus-card-footer">
                  <span>
                    {task.workMin}m focus · {task.breakMin}m break
                  </span>
                  <button
                    className="focus-start"
                    disabled={disabled}
                    onClick={() => start(task)}
                    aria-label={`Start ${task.name}`}
                  >
                    <Play size={15} aria-hidden="true" />
                    {done ? "Focus again" : "Start"}
                  </button>
                </div>
              </article>
            ),
          )}
        </div>
      ) : (
        <div className="focus-agenda-empty">
          <Feather size={28} aria-hidden="true" />
          <div>
            <strong>No tasks scheduled for today.</strong>
            <p>
              Add a task and choose today, or start any task from your weekly
              plan.
            </p>
          </div>
          <button className="secondary-button" onClick={create}>
            Add a task <ArrowRight size={16} />
          </button>
        </div>
      )}
      {items.length > 3 && (
        <button
          className="text-button focus-show-all"
          aria-expanded={showAll}
          aria-controls="focus-agenda-list"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? "Show fewer tasks" : `Show all ${items.length} tasks`}{" "}
          <ArrowRight size={15} />
        </button>
      )}
    </section>
  );
}
