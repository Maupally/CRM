/**
 * Business rules shared by the server and the browser. Everything here is pure —
 * no database, no DOM — so it can be unit-tested and reused on both sides.
 */

export const STAGES = ['new', 'contacting', 'scheduled visit', 'negotiation', 'active', 'disqualified'] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_INFO: Record<Stage, string> = {
  new: 'nobody has called yet',
  contacting: 'called — no answer, or a talk without a decision',
  'scheduled visit': 'meeting booked',
  negotiation: 'interested, agreeing on the form',
  active: 'partnership running',
  disqualified: 'a firm no (reason in the log)',
};

/** Stages where the lead is finished and should not carry follow-ups. */
export const CLOSED_STAGES: Stage[] = ['active', 'disqualified'];

export const TYPES = ['Call', 'Email', 'SMS', 'Meeting', 'Visit', 'Note'] as const;
export type ActivityType = (typeof TYPES)[number];
/** Types that count as outreach. Notes are bookkeeping. */
export const COUNTED: ActivityType[] = ['Call', 'Email', 'SMS', 'Meeting', 'Visit'];

/** 'planned' is in the future; 'cancelled' was planned and dropped by a stage change. */
export const RESULTS = ['planned', 'reached', 'no answer', 'done', 'cancelled'] as const;
export type Result = (typeof RESULTS)[number];
/** Results that count as having actually spoken to / delivered to someone. */
export const CONTACT_RESULTS: Result[] = ['reached', 'done'];

export const EVENT_TYPES = ['Open day', 'Workshop', 'Fair', 'Sponsorship', 'Meeting', 'Other'] as const;
export const EVENT_STATUS = ['planned', 'confirmed', 'done', 'cancelled'] as const;
export const TASK_STATUS = ['todo', 'doing', 'done'] as const;

export const DEFAULT_SEGMENT = 'NIEZNANA';

export const DISQUALIFY_REASONS = [
  'Not interested — no reason given',
  'Already has a competing benefit provider',
  'Too small — not enough staff',
  'No working contact details',
  'Company closed or in bankruptcy',
  'Wrong target group',
];

/* ------------------------------------------------------------ records */

export interface Lead {
  id: string;
  segment: string;
  company: string;
  industry: string;
  city: string;
  phone: string;
  email: string;
  web: string;
  person: string;
  stage: Stage;
  notes: string;
  extra: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  /** Derived: earliest open planned activity. */
  nextContact: string;
  /** Derived: latest real contact (or the date carried over from the sheet). */
  lastContact: string;
  /** Derived: date of the earliest open planned activity's type. */
  nextType: string;
  openCount: number;
  priority: number;
  why: string;
}

export interface Activity {
  id: number;
  leadId: string;
  date: string;
  type: ActivityType;
  note: string;
  owner: string;
  result: Result;
  stageFrom: string;
  stageTo: string;
  createdAt: string;
  company?: string;
}

export interface Segment {
  name: string;
  weight: number;
  goal: string;
  who: string;
  opening: string;
  hook: string;
  offer: string;
  cta: string;
  objections: string;
  why: string;
  sort: number;
}

export interface Template {
  code: string;
  kind: string;
  segments: string;
  subject: string;
  body: string;
}

export interface CrmEvent {
  id: string;
  title: string;
  type: string;
  date: string;
  time: string;
  leadId: string;
  company: string;
  location: string;
  status: string;
  owner: string;
  cost: string;
  notes: string;
  createdAt: string;
  openTasks?: number;
  totalTasks?: number;
}

export interface Task {
  id: string;
  eventId: string;
  task: string;
  owner: string;
  due: string;
  status: string;
  notes: string;
  completed: string;
  eventTitle?: string;
  eventDate?: string;
}

/* ------------------------------------------------------ normalisation */

export function txt(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

/** Multi-line text: trims each line but keeps line breaks. */
export function longTxt(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/ /g, ' ').replace(/\r\n?/g, '\n')
    .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trimEnd()).join('\n').trim();
}

/** Polish number, formatted 000 000 000 with the +48 removed. Empty if not a valid 9-digit number. */
export function normPhone(v: unknown): string {
  let s = txt(v);
  if (!s) return '';
  if (s.includes('//')) s = s.split('//')[0];
  let d = s.replace(/\D/g, '');
  if (d.startsWith('0048')) d = d.slice(4);
  else if (d.startsWith('48') && d.length > 9) d = d.slice(2);
  d = d.replace(/^0+/, '');
  if (d.length !== 9) return '';
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}

export function normEmail(v: unknown): string {
  const m = txt(v).match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return m ? m[0].toLowerCase().replace(/\.$/, '') : '';
}

export function normUrl(v: unknown): string {
  let s = txt(v);
  if (!s) return '';
  if (/^(link|brak|-|nd|szukaj w google)$/i.test(s)) return '';
  if (!/\.[a-z]{2,}/i.test(s)) return '';
  s = s.replace(/[.,;]+$/, '');
  return /^https?:\/\//i.test(s) ? s : 'https://' + s.replace(/^\/+/, '');
}

const PL: Record<string, string> = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };

/** Comparison key for a company — Polish letters folded, legal form and punctuation removed. */
export function companyKey(v: unknown): string {
  let s = txt(v).toLowerCase();
  if (!s) return '';
  s = s.replace(/[ąćęłńóśźż]/g, (c) => PL[c]);
  s = s.replace(/\b(sp\.?\s*z\s*o\.?\s*o\.?|s\.?\s*a\.?|sp\.?\s*j\.?|sp\.?\s*k\.?|s\.?\s*c\.?|ltd|llc|gmbh|inc|polska|poland)(?=\s|$|[^a-z])/g, ' ');
  return s.replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Loose search key: case- and diacritics-insensitive. */
export function searchKey(v: unknown): string {
  return txt(v).toLowerCase().replace(/[ąćęłńóśźż]/g, (c) => PL[c]);
}

/* -------------------------------------------------------------- dates */

export const TIME_ZONE = 'Europe/Warsaw';

/** yyyy-MM-dd for a Date in the CRM's time zone. */
export function isoDay(d: Date = new Date(), tz = TIME_ZONE): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Accepts a Date, yyyy-MM-dd, dd.mm.yyyy or dd/mm/yyyy. Returns yyyy-MM-dd or ''. */
export function normDate(v: unknown): string {
  if (!v) return '';
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    // spreadsheet dates arrive as local midnight; read the calendar day back in UTC-safe form
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  const s = txt(v);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

export function isIsoDay(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
}

export function addDays(day: string, n: number): string {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
}

/** 0 = Monday … 6 = Sunday. */
export function weekday(day: string): number {
  return (new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7;
}

export function startOfWeek(day: string): string {
  return addDays(day, -weekday(day));
}

/** Shortcuts offered when scheduling a follow-up. */
export function quickDates(today: string): { label: string; date: string }[] {
  const wd = weekday(today);
  const toFriday = (4 - wd + 7) % 7 || 7;
  const toMonday = (7 - wd) % 7 || 7;
  return [
    { label: 'Tomorrow', date: addDays(today, 1) },
    { label: '+2 days', date: addDays(today, 2) },
    { label: 'Friday', date: addDays(today, toFriday) },
    { label: 'Next Mon', date: addDays(today, toMonday) },
    { label: '+2 weeks', date: addDays(today, 14) },
    { label: '+1 month', date: addDays(today, 30) },
  ];
}

/** dd.mm for humans. */
export function shortDate(d: string): string {
  const p = d.split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}` : d;
}

/* -------------------------------------------------------------- rules */

/**
 * Priority, same formula the sheet used:
 * segment weight + 2 if there is a phone + 1 if there is an email + 3 while a
 * meeting is in play. A disqualified lead is always 0.
 */
export function priority(l: Pick<Lead, 'stage' | 'phone' | 'email'>, segmentWeight: number | undefined): number {
  if (l.stage === 'disqualified') return 0;
  return (segmentWeight ?? 1) + (l.phone ? 2 : 0) + (l.email ? 1 : 0) +
    (l.stage === 'negotiation' || l.stage === 'scheduled visit' ? 3 : 0);
}

/**
 * Moves a lead forward when something actually happened:
 *   new                + any finished outreach  -> contacting
 *   new | contacting   + Meeting or Visit       -> scheduled visit
 * Never downgrades, and never fires on a merely planned activity or a note.
 */
export function autoStage(from: Stage, type: string, result: string): Stage {
  if (result === 'planned' || result === 'cancelled') return from;
  if (!(COUNTED as string[]).includes(type)) return from;
  if ((type === 'Meeting' || type === 'Visit') && (from === 'new' || from === 'contacting')) {
    return 'scheduled visit';
  }
  if (from === 'new') return 'contacting';
  return from;
}

/** Fills [Firma], [Miasto], [Osoba] placeholders in a template. */
export function fillTemplate(s: string, lead: Pick<Lead, 'company' | 'city' | 'person'>): string {
  return String(s || '')
    .replace(/\[Firma\]/g, lead.company)
    .replace(/\[Miasto\]/g, lead.city || 'Katowice')
    .replace(/\[Osoba\]/g, lead.person || '');
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
