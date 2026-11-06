/**
 * Which group a task belongs to — an event, a project/topic set on the task, a procedure, a kind of companies
 * (segment) or one company — and, for a new task, which existing groups fit it best.
 */
import { isClosed, searchKey, type CrmEvent, type Task } from './domain.js';

export type TopicKind = 'event' | 'project' | 'run' | 'topic' | 'company' | 'other' | 'cold';
export interface Topic { key: string; title: string; kind: TopicKind; date?: string; eventId?: string; leadId?: string }

export const stems = (s: string) => searchKey(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4).map((w) => w.slice(0, 5));
const allIn = (label: string, text: string) => { const st = stems(label).filter((w) => w.length >= 5); const k = searchKey(text); return st.length > 0 && st.every((w) => k.includes(w)); };

/** Named groups a loose task can join by naming them: company segments and projects set on tasks. */
export const namedGroups = (tasks: Task[]) => ({
  segments: [...new Set(tasks.map((t) => t.companySegment).filter(Boolean) as string[])],
  projects: [...new Set(tasks.map((t) => t.topic).filter(Boolean))],
});

export function topicOf(t: Task, g: { segments: string[]; projects: string[] }): Topic {
  // an event gathers everything for it, procedure steps included
  if (t.eventId) return { key: `E:${t.eventId}`, kind: 'event', title: t.eventTitle || t.eventId, date: t.eventDate, eventId: t.eventId };
  if (t.topic) return { key: `T:${t.topic}`, kind: 'project', title: t.topic };
  // all runs of one procedure together (e.g. „Nowy partner” for Arabka and Padel Up); each step shows its company
  if (t.run) return { key: `P:${t.run.process}`, kind: 'run', title: t.run.process };
  if (t.leadId && t.companySegment) return { key: `S:${t.companySegment}`, kind: 'topic', title: t.companySegment };
  if (t.leadId) return { key: `L:${t.leadId}`, kind: 'company', title: t.company || t.leadId, leadId: t.leadId };
  const project = g.projects.find((p) => allIn(p, t.task));
  if (project) return { key: `T:${project}`, kind: 'project', title: project };
  const seg = g.segments.find((s) => allIn(s, t.task));
  return seg ? { key: `S:${seg}`, kind: 'topic', title: seg } : { key: 'other', kind: 'other', title: 'Inne' };
}

export interface GroupSuggestion {
  kind: 'event' | 'project' | 'segment' | 'process' | 'company';
  title: string;
  /** what to pass to create_task */
  set: { event_id?: string; topic?: string; lead_id?: string };
  open_tasks: number;
  examples: string[];
  score: number;
}

/** Existing groups ranked by how well they match a new task's wording — what Claude proposes before saving. */
export function suggestGroups(text: string, tasks: Task[], events: CrmEvent[], today: string, limit = 4): GroupSuggestion[] {
  const want = new Set(stems(text));
  const g = namedGroups(tasks);
  const groups = new Map<string, GroupSuggestion & { words: Set<string> }>();
  const add = (key: string, base: Omit<GroupSuggestion, 'open_tasks' | 'examples' | 'score'>, t?: Task) => {
    const x = groups.get(key) || { ...base, open_tasks: 0, examples: [], score: 0, words: new Set(stems(base.title)) };
    if (t) {
      if (!isClosed(t.status)) x.open_tasks++;
      if (x.examples.length < 3) x.examples.push(t.task);
      for (const w of stems(t.task)) x.words.add(w);
    }
    groups.set(key, x);
  };
  for (const e of events) if (e.date >= today && e.status !== 'cancelled') add(`E:${e.id}`, { kind: 'event', title: `${e.title} (${e.date})`, set: { event_id: e.id } });
  for (const t of tasks) {
    const tp = topicOf(t, g);
    if (tp.kind === 'event' && groups.has(tp.key)) add(tp.key, groups.get(tp.key)!, t);
    else if (tp.kind === 'project') add(tp.key, { kind: 'project', title: tp.title, set: { topic: tp.title } }, t);
    else if (tp.kind === 'topic') add(tp.key, { kind: 'segment', title: tp.title, set: { topic: tp.title } }, t);
    else if (tp.kind === 'run') add(tp.key, { kind: 'process', title: tp.title, set: { topic: tp.title } }, t);
    else if (tp.kind === 'company' && t.leadId) add(tp.key, { kind: 'company', title: tp.title, set: { lead_id: t.leadId } }, t);
  }
  const out = [...groups.values()].map((x) => {
    let hits = 0;
    for (const w of want) if (x.words.has(w)) hits++;
    // the group's own name counts double
    for (const w of stems(x.title)) if (want.has(w)) hits++;
    return { ...x, score: hits + (x.open_tasks ? 0.2 : 0) };
  }).filter((x) => x.score >= 1).sort((a, b) => b.score - a.score);
  return out.slice(0, limit).map(({ words: _w, ...x }) => ({ ...x, score: Math.round(x.score * 10) / 10 }));
}
