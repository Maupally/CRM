/**
 * The weekly report the way it is actually sent: topics by stage (not every single call), active partnerships,
 * events held, and what is coming next week. Opal5 proposes the tiles with a one-line status each; the user picks
 * which go in and edits the lines — only picked tiles end up in the text.
 */
import type { Crm } from './crm.js';
import { COUNTED, addDays, STAGES, TYPE_LABEL, shortDate, type ActivityType, type Stage } from '../shared/domain.js';

export type WeeklySection = 'topics' | 'partners' | 'held' | 'next';
export interface WeeklyItem {
  id: string;
  section: WeeklySection;
  title: string;
  /** one-line status proposed by Opal5 — the user can rewrite it */
  line: string;
  stage?: Stage;
  date?: string;
  /** something happened with it in the period (picked first) */
  touched: boolean;
  link?: string;
}
export interface WeeklyItems { from: string; to: string; owner: string; items: WeeklyItem[]; pipeline: Record<Stage, number> }

const short = (s: string, n = 120) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const ORDER: Partial<Record<Stage, number>> = { negotiation: 0, 'scheduled visit': 1, contacting: 2 };

export async function weeklyItems(crm: Crm, from?: string, to?: string): Promise<WeeklyItems> {
  const b = to || crm.today();
  const a = from || addDays(b, -6);
  const next = addDays(b, 7);
  const [leads, events, acts, planned, tasks] = await Promise.all([
    crm.listLeads(), crm.listEvents(),
    crm.db.all(`SELECT * FROM crm.activities WHERE date BETWEEN ? AND ? AND result <> 'planned' ORDER BY date DESC, id DESC`, [a, b]),
    crm.db.all(`SELECT * FROM crm.activities WHERE result = 'planned' AND date > ? AND date <= ? ORDER BY date, id`, [b, addDays(b, 14)]),
    crm.db.all(`SELECT * FROM crm.tasks WHERE lead_id <> '' AND ((status = 'done' AND completed BETWEEN ? AND ?) OR (status NOT IN ('done', 'skipped') AND due BETWEEN ? AND ?))`,
      [a, b, a, next]),
  ]);
  const byLead = new Map<string, any[]>();
  // real contacts and notes — not the "added by hand" line every new company gets
  const real = (x: any) => (COUNTED as string[]).includes(x.type) || (x.note && x.note !== 'Dodano ręcznie');
  for (const x of acts.filter(real)) byLead.set(x.lead_id, [...(byLead.get(x.lead_id) || []), x]);
  const nextOf = new Map<string, any>();
  for (const x of planned) if (!nextOf.has(x.lead_id)) nextOf.set(x.lead_id, x);
  const taskOf = new Map<string, any[]>();
  for (const t of tasks) taskOf.set(t.lead_id, [...(taskOf.get(t.lead_id) || []), t]);
  const eventLeads = new Set(events.filter((e) => e.leadId && e.date >= a && e.date <= next).map((e) => e.leadId));

  const items: WeeklyItem[] = [];
  const pipeline = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
  for (const l of leads) {
    pipeline[l.stage]++;
    const mine = byLead.get(l.id) || [];
    const nx = nextOf.get(l.id);
    const ts = taskOf.get(l.id) || [];
    const touched = mine.length > 0 || ts.some((t) => t.status === 'done') || eventLeads.has(l.id);
    const inPlay = l.stage in ORDER;
    if (!(touched || (inPlay && nx) || (l.stage === 'active' && (nx || ts.length)))) continue;
    if (l.stage === 'new' || l.stage === 'disqualified') continue;
    // the status line: what happened last, then the next step — short, like a person would write it
    const last = mine.find((x) => x.note && (COUNTED as string[]).includes(x.type))?.note || mine.find((x) => x.note)?.note || ts.find((t) => t.status === 'done')?.task || '';
    const step = nx ? `dalej: ${(TYPE_LABEL[nx.type as ActivityType] || nx.type).toLowerCase()}${nx.note ? ` — ${short(nx.note, 50)}` : ''}` : '';
    items.push({
      id: `lead:${l.id}`, section: l.stage === 'active' ? 'partners' : 'topics', title: l.company, stage: l.stage,
      line: short(last, 70) || step, date: nx?.date, touched, link: `/firmy/${l.id}`,
    });
  }
  items.sort((x, y) => Number(y.touched) - Number(x.touched) || (ORDER[x.stage!] ?? 9) - (ORDER[y.stage!] ?? 9) || x.title.localeCompare(y.title, 'pl'));

  for (const e of events.filter((e) => e.date >= a && e.date <= b && e.status !== 'cancelled')) {
    items.push({ id: `event:${e.id}`, section: 'held', title: e.title, line: '',
      date: e.date, touched: true, link: `/wydarzenia/${e.id}` });
  }
  // next week: events, and meetings / visits planned with companies — in date order
  const coming: WeeklyItem[] = [];
  for (const e of events.filter((e) => e.date > b && e.date <= next && e.status !== 'cancelled')) {
    coming.push({ id: `event:${e.id}`, section: 'next', title: e.title,
      line: '', date: e.date, touched: false, link: `/wydarzenia/${e.id}` });
  }
  const names = new Map(leads.map((l) => [l.id, l.company]));
  for (const x of planned.filter((x) => x.date <= next && (x.type === 'Meeting' || x.type === 'Visit'))) {
    coming.push({ id: `act:${x.id}`, section: 'next', title: `${TYPE_LABEL[x.type as ActivityType] || x.type}: ${names.get(x.lead_id) || x.lead_id}`,
      line: '', date: x.date, touched: false, link: `/firmy/${x.lead_id}` });
  }
  items.push(...coming.sort((x, y) => (x.date || '').localeCompare(y.date || '')));
  return { from: a, to: b, owner: crm.owner, items, pipeline };
}
