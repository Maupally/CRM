/**
 * Capacity in story points: what is planned per week (open tasks by due date; overdue counts into this week),
 * what got done per week, and the velocity — the average done over the last four full weeks.
 */
import { addDays, isClosed, startOfWeek, type Task } from './domain.js';

export interface WeekLoad { start: string; end: string; planned: number; done: number; tasks: number }
export interface Capacity {
  velocity: number;
  thisWeek: WeekLoad;
  ahead: WeekLoad[];
  past: WeekLoad[];
  /** this week's planned points per person ("" = nobody assigned) */
  people: { name: string; planned: number; done: number }[];
  /** no due date: points waiting to be planned */
  unscheduled: number;
  /** 13 and 21 — should be broken down */
  tooBig: { id: string; task: string; points: number }[];
}

export function capacity(tasks: Task[], today: string, weeksAhead = 3, weeksBack = 4): Capacity {
  const ws = startOfWeek(today);
  const week = (start: string): WeekLoad => {
    const end = addDays(start, 6);
    const isThis = start === ws;
    const open = tasks.filter((t) => !isClosed(t.status) && t.due && (isThis ? t.due <= end : t.due >= start && t.due <= end));
    const done = tasks.filter((t) => t.status === 'done' && t.completed && t.completed.slice(0, 10) >= start && t.completed.slice(0, 10) <= end);
    return { start, end, planned: open.reduce((n, t) => n + t.points, 0), done: done.reduce((n, t) => n + t.points, 0), tasks: open.length };
  };
  const thisWeek = week(ws);
  const ahead = Array.from({ length: weeksAhead }, (_, i) => week(addDays(ws, 7 * (i + 1))));
  const past = Array.from({ length: weeksBack }, (_, i) => week(addDays(ws, -7 * (weeksBack - i))));
  const velocity = Math.round(past.reduce((n, w) => n + w.done, 0) / Math.max(1, past.length));
  const pm = new Map<string, { planned: number; done: number }>();
  const end = addDays(ws, 6);
  for (const t of tasks) {
    const name = t.person?.name || '';
    const p = pm.get(name) || { planned: 0, done: 0 };
    if (!isClosed(t.status) && t.due && t.due <= end) p.planned += t.points;
    else if (t.status === 'done' && t.completed && t.completed.slice(0, 10) >= ws && t.completed.slice(0, 10) <= end) p.done += t.points;
    else continue;
    pm.set(name, p);
  }
  return {
    velocity, thisWeek, ahead, past,
    people: [...pm.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.planned - a.planned),
    unscheduled: tasks.filter((t) => !isClosed(t.status) && !t.due).reduce((n, t) => n + t.points, 0),
    tooBig: tasks.filter((t) => !isClosed(t.status) && t.points >= 13).map((t) => ({ id: t.id, task: t.task, points: t.points })),
  };
}
