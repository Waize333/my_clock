"use client";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowUpRight, Info } from "lucide-react";
import { useApp } from "@/components/provider";
import { dailyStats, daySeries, longestStreak, extraStats } from "@/lib/stats";
import { api } from "@/lib/api";
import type { Timer } from "@/lib/timer/core";
export default function StatsPage() {
  const app = useApp();
  const [range, setRange] = useState(7);
  const [remote, setRemote] = useState<Timer[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!app.connected || app.profile.id === "local") return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const all: Timer[] = [];
        for (let offset = 0; ; offset += 500) {
          const data = await api<{ timer_state: Timer }[]>(
            `/api/sessions?offset=${offset}`,
          );
          all.push(...data.map((row) => row.timer_state));
          if (data.length < 500) break;
        }
        if (!cancelled) {
          setRemote(all);
          setError("");
        }
      } catch {
        if (!cancelled)
          setError(
            "Insights could not refresh. Your last loaded data is shown.",
          );
      }
    };
    void refresh();
    const interval = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15000);
    const visible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [app.profile.id, app.connected]);
  const sessions = remote
    ? [
        ...app.sessions.filter((s) => !s.status),
        ...remote.filter(
          (s) =>
            !app.sessions.some((local) => !local.status && local.id === s.id),
        ),
      ]
    : app.sessions;
  const extra = extraStats(
    sessions,
    new Date(app.now),
    app.planner.timezone,
    app.planner.entries,
  );
  const today = dailyStats(
    sessions,
    new Date(app.now),
    app.planner.timezone,
    app.planner.entries,
    app.now,
  );
  const series = daySeries(
    sessions,
    range,
    new Date(app.now),
    app.planner.timezone,
    app.planner.entries,
  );
  const heatmap = daySeries(
    sessions,
    90,
    new Date(app.now),
    app.planner.timezone,
    app.planner.entries,
  );
  const max = Math.max(60, ...heatmap.map((d) => d.minutes));
  return (
    <div className="content-page">
      <div className="eyebrow">A MOMENT OF REFLECTION</div>
      <h1>Your time, thoughtfully spent.</h1>
      <p className="page-description">
        Small moments of focus add up. Here’s your rhythm.
      </p>
      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      <div className="stats-grid">
        {[
          { value: `${today.minutes} min`, label: "Focus today" },
          { value: today.completed, label: "Completed intervals today" },
          {
            value: today.started ? `${today.rate}%` : "—",
            label: "Completion today",
          },
          {
            value: `${longestStreak(sessions, app.planner.timezone)} days`,
            label: "Longest daily streak",
          },
        ].map((s) => (
          <div className="metric-card" key={s.label}>
            <span>{s.label}</span>
            <strong>{s.value}</strong>
          </div>
        ))}
      </div>
      <section className="extra-insights">
        <div className="extra-intro">
          <span className="small-label">THE BIGGER PICTURE</span>
          <p>
            {extra.thisWeek} minutes this week
            {extra.weekChange !== null
              ? ` · ${extra.weekChange >= 0 ? "+" : ""}${extra.weekChange}% compared with the previous 7 days`
              : ""}
          </p>
        </div>
        <div className="extra-grid">
          {[
            {
              value: `${extra.totalMinutes} min`,
              label: "All-time focus",
              copy: "Every minute, including unfinished work.",
            },
            {
              value: `${extra.averageMinutes} min`,
              label: "Average focus interval",
              copy: "Your actual time, at your own pace.",
            },
            {
              value: `${extra.longestMinutes} min`,
              label: "Longest focus interval",
              copy: "A little room for deeper work.",
            },
            {
              value: extra.activeDays,
              label: "Days with focused time",
              copy: "Any amount of focus counts.",
            },
            {
              value: `${extra.breakMinutes} min`,
              label: "Time to recharge",
              copy: "Actual time spent taking a break.",
            },
            {
              value: extra.completedBreaks,
              label: "Breaks fully taken",
              copy: "Making space to begin again.",
            },
          ].map((metric) => (
            <div className="extra-metric" key={metric.label}>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
              <p>{metric.copy}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Time in focus</h2>
            <p>A little more presence, one day at a time.</p>
          </div>
          <div className="segmented">
            <button
              className={range === 7 ? "active" : ""}
              onClick={() => setRange(7)}
            >
              Week
            </button>
            <button
              className={range === 30 ? "active" : ""}
              onClick={() => setRange(30)}
            >
              Month
            </button>
          </div>
        </div>
        <div
          className="chart"
          role="img"
          aria-label={`Focus minutes per day for the last ${range} days. Total ${series.reduce((s, d) => s + d.minutes, 0)} minutes.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={series}
              margin={{ top: 20, right: 8, left: -28, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={30}
              />
              <YAxis
                tick={{ fill: "var(--muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: "var(--subtle)" }}
                contentStyle={{
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  color: "var(--fg)",
                  fontSize: 12,
                }}
                formatter={(value) => [`${value} minutes`, "Focused"]}
              />
              <Bar
                dataKey="minutes"
                fill="var(--accent)"
                radius={[4, 4, 0, 0]}
                maxBarSize={34}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <details className="data-details">
          <summary>View daily values</summary>
          <div className="daily-data">
            {series.map((d) => (
              <span key={d.date}>
                {d.label}: <strong>{d.minutes} min</strong>
              </span>
            ))}
          </div>
        </details>
      </section>
      <div className="insight-bottom">
        <section className="panel concentration">
          <div className="panel-heading">
            <h2>Concentration</h2>
            <div
              className="formula-tooltip"
              tabIndex={0}
              aria-label={`Score formula: completed work intervals divided by started work intervals, multiplied by average actual duration divided by planned duration, capped at one, times 100. Today: ${today.completed} completed, ${today.started} started, ${today.adherence}% average duration.`}
            >
              <Info size={16} />
              <span>
                {today.completed} completed ÷ {today.started} started ×{" "}
                {today.adherence}% average duration adherence × 100. Each
                duration ratio is capped at 1.
              </span>
            </div>
          </div>
          <div className="score">
            {today.started ? today.score : "—"}
            <span>/ 100</span>
          </div>
          <p>Today’s balance of finishing and staying present.</p>
          <div className="score-bar">
            <span style={{ width: `${today.score}%` }} />
          </div>
          <span className="fine-print">A reflection, never a competition.</span>
        </section>
        <section className="panel heatmap-panel">
          <div className="panel-heading">
            <div>
              <h2>Your last 90 days</h2>
              <p>Every bit of focused time belongs here.</p>
            </div>
            <ArrowUpRight size={18} />
          </div>
          <div className="heatmap">
            {heatmap.map((d) => (
              <div
                key={d.date}
                tabIndex={0}
                role="img"
                aria-label={`${d.label}: ${d.minutes} focus minutes`}
                className={`heat-cell ${d.minutes ? "filled" : ""}`}
                style={
                  d.minutes ? { opacity: 0.25 + (0.75 * d.minutes) / max } : {}
                }
              >
                <span>
                  {d.label} · {d.minutes} min
                </span>
              </div>
            ))}
          </div>
          <div className="heatmap-legend">
            <span>Less</span>
            {[0, 0.3, 0.55, 0.8, 1].map((n) => (
              <i
                key={n}
                style={{
                  background: n ? "var(--accent)" : "var(--subtle)",
                  opacity: n || 1,
                }}
              />
            ))}
            <span>More</span>
          </div>
        </section>
      </div>
      <p className="stats-footnote">
        Includes live focus, partial intervals, and reset or abandoned sessions.
        Intervals are grouped by their start date in your current timezone. A
        streak day has at least one completed focus interval.
      </p>
    </div>
  );
}
