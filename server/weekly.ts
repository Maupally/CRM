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
export interface WeeklyItems { from: string; to: string; owner: string; items: WeeklyItem[]; pipeline: Record<Stage, number>; funnel: string }

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

  for (const e of events.filter((e) => e.date >= a && e.date <= b)) {
    // a called-off visit is news too („radny niestety nie przyszedł”); a routine open day is not, unless you pick it
    const off = e.status === 'cancelled';
    items.push({ id: `event:${e.id}`, section: 'held', title: e.title, line: off ? 'nie doszło do skutku' : '',
      date: e.date, touched: !off && e.type !== 'Open day', link: `/wydarzenia/${e.id}` });
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
  return { from: a, to: b, owner: crm.owner, items, pipeline, funnel: funnelLine(pipeline) };
}

/** Everything done in the period, for the user's own eyes: finished and skipped tasks, and contacts made. */
export interface DoneRow { kind: 'task' | 'skipped' | 'contact'; date: string; title: string; where?: string; who?: string; note?: string; link?: string }
export async function doneList(crm: Crm, from?: string, to?: string): Promise<{ from: string; to: string; rows: DoneRow[] }> {
  const b = to || crm.today();
  const a = from || addDays(b, -6);
  const [tasks, acts] = await Promise.all([
    crm.listTasks(),
    crm.db.all(`SELECT a.*, l.company FROM crm.activities a JOIN crm.leads l ON l.id = a.lead_id
      WHERE a.date BETWEEN ? AND ? AND a.result <> 'planned' ORDER BY a.date DESC, a.id DESC`, [a, b]),
  ]);
  const rows: DoneRow[] = [];
  for (const t of tasks) {
    if (!t.completed || t.completed < a || t.completed > b || (t.status !== 'done' && t.status !== 'skipped')) continue;
    rows.push({ kind: t.status === 'done' ? 'task' : 'skipped', date: t.completed.slice(0, 10), title: t.task,
      where: t.eventTitle || t.company || undefined, who: t.person?.name || undefined, note: t.status === 'skipped' ? t.skipReason || undefined : undefined,
      link: t.eventId ? `/wydarzenia/${t.eventId}` : t.leadId ? `/firmy/${t.leadId}` : undefined });
  }
  for (const x of acts) {
    if (!(COUNTED as string[]).includes(x.type)) continue;
    rows.push({ kind: 'contact', date: x.date, title: `${TYPE_LABEL[x.type as ActivityType] || x.type}: ${x.company}`, note: x.note ? short(x.note, 140) : undefined,
      link: `/firmy/${x.lead_id}` });
  }
  rows.sort((x, y) => y.date.localeCompare(x.date));
  return { from: a, to: b, rows };
}

/* ------------------------------------------------------------ what the report has learned */

const plural = (n: number, one: string, few: string, many: string) => {
  const t = n % 100, u = n % 10;
  return `${n} ${n === 1 ? one : u >= 2 && u <= 4 && (t < 12 || t > 14) ? few : many}`;
};

/** The closing line, as sent: „Lejek B2B: 16 firm w kontakcie, 1 umówiona wizyta, 1 negocjacja, 15 aktywnych partnerstw.” */
export function funnelLine(p: Record<Stage, number>): string {
  return `Lejek B2B: ${[
    plural(p.contacting, 'firma w kontakcie', 'firmy w kontakcie', 'firm w kontakcie'),
    plural(p['scheduled visit'], 'umówiona wizyta', 'umówione wizyty', 'umówionych wizyt'),
    plural(p.negotiation, 'negocjacja', 'negocjacje', 'negocjacji'),
    plural(p.active, 'aktywne partnerstwo', 'aktywne partnerstwa', 'aktywnych partnerstw'),
  ].join(', ')}.`;
}

/** Lessons from the user's corrections — each one applies to every report from now on. Editable in Raporty. */
export const DEFAULT_WEEKLY_RULES = [
  'Format jak w wysłanym raporcie: sekcje „Tematy w toku”, „Aktywne partnerstwa:”, „Wydarzenia”, „W przyszłym tygodniu”; każda pozycja jako punkt „- Nazwa – jedno zdanie”, wyliczenia jako podpunkty „  - ”. Bez dat, bez nagłówka, bez podpisu (stopkę dodaje poczta). Na końcu linia „Lejek B2B: …” (funnel).',
  'Tylko B2B: bez rekrutacji rodziców (umowy trójstronne, B2C) i bez pojedynczych zainteresowanych na wizycie.',
  'Bez dostawców i zakupów (agencje reklamowe, drukarnie, gadżety) — to nie są tematy partnerskie.',
  'Status jednym zdaniem: na co czekamy albo co dalej („czekamy na poprawki umowy”). Bez szczegółów negocjacji (prowizje, VAT, załączniki).',
  'Porażki i brak odzewu piszemy wprost: „na razie bez zainteresowania, bo…”, „próbujemy się skontaktować”, „niestety nie przyszedł”.',
  'Aktywne partnerstwa tylko z konkretną akcją w tym tygodniu (np. „wręczone vouchery na zawodach, zlecamy wydruk banerów”). Nie wpisuj „przygotowujemy maila”.',
  'Każda sprawa tylko w jednej sekcji — spotkanie, które się odbyło, idzie do „Wydarzenia”, nie do partnerstw.',
  'Rutynowe wydarzenia bez efektu (np. dzień otwarty bez rodzin) pomijamy. W „Wydarzenia” może być „W przygotowaniu: …” (np. cykl masterclass).',
  '„W przyszłym tygodniu”: konkretne spotkania i kroki (z kim i po co), bez dat.',
];

export interface SentReport { date: string; text: string }

export class WeeklyMemory {
  constructor(private crm: Crm) {}

  async rules(): Promise<string[]> {
    try { const r = JSON.parse(await this.crm.setting('weekly.rules')); if (Array.isArray(r)) return r.map(String); } catch { /* not set yet */ }
    return DEFAULT_WEEKLY_RULES;
  }

  async setRules(rules: string[]) {
    const clean = rules.map((r) => String(r).trim()).filter(Boolean).slice(0, 40);
    await this.crm.setSetting('weekly.rules', JSON.stringify(clean));
    return clean;
  }

  /** Adds lessons from a correction („Agencję FUX usuń — to dostawca”) unless already there. */
  async learn(lessons: string[]) {
    const cur = await this.rules();
    const known = new Set(cur.map((r) => r.toLowerCase()));
    return this.setRules([...cur, ...lessons.map((l) => String(l).trim()).filter((l) => l && !known.has(l.toLowerCase()))]);
  }

  async sent(): Promise<SentReport[]> {
    try { const r = JSON.parse(await this.crm.setting('weekly.sent')); if (Array.isArray(r)) return r; } catch { /* none yet */ }
    return [];
  }

  /** The report as it really went out — the model for the next one. Keeps the last five. */
  async addSent(text: string): Promise<SentReport[]> {
    const t = String(text || '').replace(/\r/g, '').trim();
    if (!t) throw new Error('Wklej treść wysłanego raportu.');
    const list = [{ date: this.crm.today(), text: t.slice(0, 8000) }, ...(await this.sent()).filter((x) => x.text !== t)].slice(0, 5);
    await this.crm.setSetting('weekly.sent', JSON.stringify(list));
    return list;
  }
}
