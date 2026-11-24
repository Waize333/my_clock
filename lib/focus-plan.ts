import type { LogIndex, Task } from "./planner";

export function filterTasks(tasks: Task[], query: string) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return tasks.filter((task) => {
    const text =
      `${task.name} ${task.category} ${task.notes}`.toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
}

export function dailyFocus(
  tasks: Task[],
  day: string,
  checks: Record<string, string>,
  logs: LogIndex,
) {
  const weekday = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  const priorities = { high: 0, normal: 1, low: 2 };
  return tasks
    .filter((task) => !task.archived && task.days.includes(weekday))
    .map((task) => {
      const seconds = logs.tasks[task.id]?.[day] ?? 0;
      const goalMet = seconds >= task.targetMin * 60;
      const checked = Boolean(checks[`${day}:${task.id}`]);
      return {
        task,
        seconds,
        goalMet,
        checked,
        done: goalMet || checked,
        percent: Math.min(100, (seconds / (task.targetMin * 60)) * 100),
      };
    })
    .sort(
      (a, b) =>
        Number(a.done) - Number(b.done) ||
        priorities[a.task.priority] - priorities[b.task.priority],
    );
}
