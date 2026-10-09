/**
 * A person's track record, built from what they actually finished: how much, what kind of work keeps coming
 * back (→ skills that are not written down yet), whether they hit deadlines and how long things take them.
 * Claude uses it to update skills and to pick and estimate who should do what.
 */
import type { Crm } from './crm.js';
import { searchKey } from '../shared/domain.js';

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };
const STOP = new Set(['oraz', 'albo', 'przez', 'przed', 'sobie', 'jest', 'bedzie', 'ktore', 'zrobic', 'trzeba', 'wszystko', 'jutro', 'dzisiaj',
  'potwierdzic', 'ustalic', 'sprawdzic', 'zapytac', 'wyslac', 'napisac', 'przygotowac', 'zadzwonic', 'odebrac', 'dostawe']);

export async function personProfile(crm: Crm, personId: number) {
  const p = await crm.getPerson(personId);
  const today = crm.today();
  const mine = (await crm.listTasks()).filter((t) => t.personId === personId);
  const done = mine.filter((t) => t.status === 'done' && t.completed).sort((a, b) => b.completed.localeCompare(a.completed));
  const open = mine.filter((t) => t.status !== 'done');

  // recurring kinds of work: word stems that come back across finished tasks
  const stems = new Map<string, { n: number; words: Map<string, number>; tasks: Set<string> }>();
  for (const t of done) {
    const seen = new Set<string>();
    for (const w of searchKey(t.task).split(/[^a-z]+/)) {
      if (w.length < 4 || STOP.has(w)) continue;
      const k = w.slice(0, 5);
      if (seen.has(k)) continue;
      seen.add(k);
      const e = stems.get(k) || { n: 0, words: new Map(), tasks: new Set() };
      e.n++; e.words.set(w, (e.words.get(w) || 0) + 1); e.tasks.add(t.task);
      stems.set(k, e);
    }
  }
  const recurring = [...stems.values()].filter((e) => e.n >= 2).sort((a, b) => b.n - a.n).slice(0, 8)
    .map((e) => ({ word: [...e.words.entries()].sort((a, b) => b[1] - a[1])[0][0], times: e.n, examples: [...e.tasks].slice(0, 3) }));

  const timed = done.filter((t) => t.due);
  const late = timed.filter((t) => t.completed > t.due);
  // written down after the fact ("Roma did X last week") says nothing about how long it took
  const took = done.filter((t) => t.created && t.created <= t.completed).map((t) => daysBetween(t.created, t.completed));
  return {
    id: p.id, name: p.name, role: p.role, kind: p.kind, company: p.company || undefined,
    skills: p.services || undefined, scope: p.scope || undefined,
    done_total: done.length,
    done_last_90_days: done.filter((t) => daysBetween(t.completed, today) <= 90).length,
    on_time: timed.length ? `${timed.length - late.length}/${timed.length} na czas` : undefined,
    usually_late_by_days: late.length ? median(late.map((t) => daysBetween(t.due, t.completed))) : undefined,
    typical_days_to_finish: took.length >= 2 ? median(took) : undefined,
    recurring_work: recurring.length ? recurring : undefined,
    events: p.events.length ? p.events.map((e) => `${e.title} (${e.date})${e.role ? ` — ${e.role}` : ''}`) : undefined,
    open_now: open.length,
    late_now: open.filter((t) => t.due && t.due < today).length,
    recently_done: done.slice(0, 10).map((t) => `${t.completed}: ${t.task}${t.eventTitle ? ` [${t.eventTitle}]` : t.company ? ` [${t.company}]` : ''}`),
  };
}
export type PersonProfile = Awaited<ReturnType<typeof personProfile>>;
