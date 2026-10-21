/**
 * Business rules shared by the server and the browser. Everything here is pure —
 * no database, no DOM — so it can be unit-tested and reused on both sides.
 */

export const STAGES = ['new', 'contacting', 'scheduled visit', 'negotiation', 'active', 'disqualified'] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_INFO: Record<Stage, string> = {
  new: 'nikt jeszcze nie dzwonił',
  contacting: 'dzwoniono — bez odpowiedzi albo bez decyzji',
  'scheduled visit': 'spotkanie umówione',
  negotiation: 'zainteresowani, ustalamy formę',
  active: 'współpraca działa',
  disqualified: 'nie i już (powód w historii)',
};

/** What the person sees. Stored values stay English — the sheet and the report use them. */
export const STAGE_LABEL: Record<Stage, string> = {
  new: 'Nowy',
  contacting: 'W kontakcie',
  'scheduled visit': 'Umówiona wizyta',
  negotiation: 'Negocjacje',
  active: 'Partner',
  disqualified: 'Odrzucony',
};

/** Stages where the lead is finished and should not carry follow-ups. */
export const CLOSED_STAGES: Stage[] = ['active', 'disqualified'];

export const TYPES = ['Call', 'Email', 'SMS', 'Meeting', 'Visit', 'Note'] as const;
export type ActivityType = (typeof TYPES)[number];
export const TYPE_LABEL: Record<ActivityType, string> = {
  Call: 'Telefon', Email: 'E-mail', SMS: 'SMS', Meeting: 'Spotkanie', Visit: 'Wizyta', Note: 'Notatka',
};
/** Types that count as outreach. Notes are bookkeeping. */
export const COUNTED: ActivityType[] = ['Call', 'Email', 'SMS', 'Meeting', 'Visit'];

/** 'planned' is in the future; 'cancelled' was planned and dropped by a stage change. */
export const RESULTS = ['planned', 'reached', 'no answer', 'done', 'cancelled'] as const;
export type Result = (typeof RESULTS)[number];
export const RESULT_LABEL: Record<Result, string> = {
  planned: 'zaplanowane', reached: 'odebrał', 'no answer': 'nie odebrał', done: 'zrobione', cancelled: 'anulowane',
};
/** Results that count as having actually spoken to / delivered to someone. */
export const CONTACT_RESULTS: Result[] = ['reached', 'done'];

export const EVENT_TYPES = ['Open day', 'Workshop', 'Fair', 'Sponsorship', 'Meeting', 'Other'] as const;
export const EVENT_TYPE_LABEL: Record<string, string> = {
  'Open day': 'Dzień otwarty', Workshop: 'Warsztaty', Fair: 'Targi', Sponsorship: 'Sponsoring', Meeting: 'Spotkanie', Other: 'Inne',
};
export const EVENT_STATUS = ['planned', 'confirmed', 'done', 'cancelled'] as const;
export const EVENT_STATUS_LABEL: Record<string, string> = {
  planned: 'planowane', confirmed: 'potwierdzone', done: 'odbyło się', cancelled: 'odwołane',
};
export const TASK_STATUS = ['todo', 'doing', 'done', 'skipped'] as const;
/** done or not done (skipped) — either way off the to-do list, but kept in the history */
export const isClosed = (status: string) => status === 'done' || status === 'skipped';

export const DEFAULT_SEGMENT = 'NIEZNANA';

export const DISQUALIFY_REASONS = [
  'Niezainteresowani',
  'Mają już podobny benefit',
  'Za mała firma',
  'Brak działającego kontaktu',
  'Firma zamknięta / upadłość',
  'Nie nasza grupa docelowa',
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
  leadId: string;
  materials: Material[];
  attachments: number[];
  /** who the task is for (0 = nobody in particular) */
  personId: number;
  person?: { name: string; role: string; email: string; phone: string };
  eventTitle?: string;
  eventDate?: string;
  /** project / topic it belongs to, when no event or company says it */
  topic: string;
  /** effort in story points (Fibonacci); estimated from the wording when nobody set it */
  points: number;
  /** true when `points` is Opal5's guess, not set by the user or Claude */
  pointsAuto: boolean;
  company?: string;
  /** the company's segment, e.g. „Związki wyznaniowe” — groups tasks by topic */
  companySegment?: string;
  /** when the task is a step of a running procedure */
  runId: number;
  step: number;
  /** why it cannot move on, if it is stuck */
  blocked: string;
  /** when this step became the current one */
  started: string;
  /** when the task was written down */
  created: string;
  /** why it was not done (status skipped) */
  skipReason: string;
  run?: { title: string; process: string; steps: number };
}

/** A ready-to-use piece of text prepared for a task (post, SMS, email, text for teachers…). */
export interface Material {
  title: string;
  body: string;
  /** set for an email: the subject goes in its own field, never inside the body */
  subject?: string;
  /** email address, when the material is an email to someone outside the task's person */
  to?: string;
}

export const THREAD_MODES = ['b2b', 'casual', 'other'] as const;
export type ThreadMode = (typeof THREAD_MODES)[number];
export const THREAD_MODE_LABEL: Record<ThreadMode, string> = { b2b: 'B2B — firmy', casual: 'Swobodny — rodzice, zespół', other: 'Ogólny' };
export interface ThreadMessage { role: 'user' | 'assistant'; text: string; at: string; via?: 'mikrofon' | 'czat' | 'claude' }
export interface Thread { id: number; title: string; mode: ThreadMode; source: 'claude' | 'opal'; messages: ThreadMessage[]; updatedAt: string }
export interface ThreadSummary { id: number; title: string; mode: ThreadMode; source: string; count: number; last: string; updatedAt: string }

export const DESIGN_KINDS = ['www', 'deck', 'email', 'doc', 'form', 'brief'] as const;
export type DesignKind = (typeof DESIGN_KINDS)[number];
export const DESIGN_KIND_LABEL: Record<DesignKind, string> = {
  www: 'Strona WWW', deck: 'Prezentacja', email: 'Mail / szablon', doc: 'Dokument', form: 'Formularz Google (skrypt)', brief: 'Zlecenie / brief',
};

export interface DesignVersion { html: string; note: string; at: string }
export interface DesignMessage { role: 'user' | 'assistant'; text: string; files?: KnowledgeItem[]; at: string }
export interface Design {
  id: number;
  title: string;
  kind: DesignKind;
  versions: DesignVersion[];
  chat: DesignMessage[];
  updatedAt: string;
  /** the event it was made for, if any */
  eventId: string;
}
export interface DesignSummary { id: number; title: string; kind: DesignKind; versions: number; updatedAt: string; eventId: string; eventTitle?: string; note?: string }

/** Writing guidance moved over from the Claude project: general rules, B2B emails, relaxed messages. */
export interface Style { project: string; b2b: string; casual: string }

/** Someone the user works with — the director, a colleague, a teacher. */
export interface Person {
  id: number;
  name: string;
  role: string;
  email: string;
  phone: string;
  /** other ways the user calls them: "dyrektor, Patryk, szef" */
  aliases: string;
  notes: string;
  /** how many times tasks/emails went to them, and when last */
  contacts: number;
  lastContact: string;
  /** team = people at the school; external = suppliers, animators, partners' people */
  kind: PersonKind;
  /** their firm, e.g. "Event 360" (and its card in Firmy, when it is there) */
  company: string;
  leadId: string;
  /** skills — what they can do or provide: "ławy, stoły, namioty", "grafika, social media" */
  services: string;
  /** what they are responsible for (zakres obowiązków) */
  scope: string;
  /** link to a photo (optional) */
  photo?: string;
  /** tasks they finished (all time) */
  doneCount: number;
  /** events they helped with, newest first */
  events: PersonEvent[];
  /** their firm is an active partner right now */
  partner: boolean;
}

export const PERSON_KINDS = ['team', 'external'] as const;
export type PersonKind = (typeof PERSON_KINDS)[number];
export const PERSON_KIND_LABEL: Record<PersonKind, string> = { team: 'Zespół szkoły', external: 'Kontakty zewnętrzne' };
export interface PersonEvent { eventId: string; title: string; date: string; role: string }
export interface EventPerson { personId: number; name: string; role: string; company: string; phone: string; email: string }

export interface KnowledgeItem {
  id: number;
  title: string;
  filename: string;
  mime: string;
  size: number;
  description: string;
  tags: string;
  createdAt: string;
  hasFile: boolean;
  textLength: number;
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
    { label: 'Jutro', date: addDays(today, 1) },
    { label: 'Za 2 dni', date: addDays(today, 2) },
    { label: 'Piątek', date: addDays(today, toFriday) },
    { label: 'Pon.', date: addDays(today, toMonday) },
    { label: 'Za 2 tyg.', date: addDays(today, 14) },
    { label: 'Za miesiąc', date: addDays(today, 30) },
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

/* ------------------------------------------------------------------ B2C progress */

/** One B2C goal: e.g. "Telefony do rodziców z dni otwartych", 40 of 120 done. */
export interface B2cItem {
  id: number; title: string; category: string; target: number; done: number; unit: string; due: string; notes: string;
  updatedAt: string;
  /** Done in the last 7 days (from the log). */
  week: number;
}
export interface B2cLog { id: number; itemId: number; delta: number; note: string; day: string; at: string }

/* ------------------------------------------------------------------ procedures */

/** One step of a procedure: what, who does it, how many days it may take, when it counts as done. */
export interface ProcessStep { title: string; personId: number; days: number; doneWhen: string }
export interface Process { id: number; name: string; description: string; steps: ProcessStep[]; updatedAt: string; activeRuns: number }

export interface RunStep {
  taskId: string; step: number; title: string; status: string; due: string; completed: string; blocked: string; started: string;
  personId: number; person: string; doneWhen: string;
}
/** A running procedure with where it stands and — if so — why it is stuck. */
export interface ProcessRun {
  id: number; processId: number; process: string; title: string; leadId: string; company: string; eventId: string; eventTitle: string;
  status: 'active' | 'done' | 'cancelled'; started: string; finished: string;
  steps: RunStep[];
  /** 1-based number of the step it is on now (0 when finished) */
  current: number;
  stuck: string[];
}

/* -------------------------------------------------------------- Na później */

export const IDEA_STATUS = ['open', 'used', 'dropped'] as const;
export type IdeaStatus = (typeof IDEA_STATUS)[number];
export const IDEA_STATUS_LABEL: Record<IdeaStatus, string> = { open: 'Czeka', used: 'Wykorzystane', dropped: 'Odpuszczone' };
/** Something to come back to later — a company, an offer, an idea — not tied to any company, event or task yet. */
/** One step in a project's story — a message from a pasted e-mail thread or a note — under a company, an event or a topic. */
export type StoryDirection = 'in' | 'out' | 'note';
export interface StoryItem {
  id: number;
  leadId: string;
  eventId: string;
  topic: string;
  /** the e-mail thread (subject) it came from */
  thread: string;
  day: string;
  who: string;
  direction: StoryDirection;
  text: string;
  createdAt: string;
  company?: string;
  eventTitle?: string;
}

export interface Idea {
  id: number;
  title: string;
  /** what it is about, e.g. "zajęcia dodatkowe" */
  topic: string;
  note: string;
  url: string;
  contact: string;
  /** whose topic it is (when it is not the user's) */
  owner: string;
  /** when it becomes useful, in words: "przy ustalaniu zajęć dodatkowych na 2027/28" */
  whenRelevant: string;
  /** yyyy-MM-dd — bring it up on this day */
  remindOn: string;
  status: IdeaStatus;
  lastShown: string;
  createdAt: string;
  updatedAt: string;
}

/* -------------------------------------------------------------- messages sent (copied from templates) */

export const MSG_CHANNELS = ['email', 'sms', 'internal'] as const;
export type MsgChannel = (typeof MSG_CHANNELS)[number];
export const MSG_CHANNEL_LABEL: Record<MsgChannel, string> = { email: 'E-maile', sms: 'SMS', internal: 'Wewnętrzne' };
export interface MsgCount { email: number; sms: number; internal: number; total: number }
export interface MsgStats {
  /** last 12 months, oldest first: yyyy-MM */
  months: (MsgCount & { month: string })[];
  /** the requested period */
  period: MsgCount & { from: string; to: string; top: { template: string; channel: MsgChannel; n: number }[] };
  /** last 30 days, one entry per day */
  daily: (MsgCount & { date: string })[];
}

/* -------------------------------------------------------------- person files and the board */

/** What can sit on the board: a person, an event, a company (lead) or a place (by name). */
export const NODE_KINDS = ['person', 'event', 'company', 'place'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];
export interface NodeRef { kind: NodeKind; id: string }
export interface BoardNote { id: number; day: string; text: string; ref: string; source: string; links: (NodeRef & { label: string })[] }
export interface BoardNode { key: string; kind: NodeKind; id: string; label: string; sub: string; photo?: string; team?: boolean; weight: number }
export interface BoardEdge { a: string; b: string; labels: string[]; kinds: ('link' | 'note' | 'event' | 'company' | 'task' | 'place')[]; linkIds: number[] }
export interface Board { nodes: BoardNode[]; edges: BoardEdge[] }
export interface PersonFile {
  person: { id: number; name: string; role: string; company: string; photo: string };
  notes: BoardNote[];
  connections: { node: BoardNode; why: string[]; linkIds: number[] }[];
}
export const nodeKey = (r: NodeRef) => `${r.kind}:${r.id}`;

/* -------------------------------------------------------------- effort (story points) */

/** Fibonacci story points: complexity, uncertainty and effort together — not hours. 13 and 21 mean "break it down". */
export const POINTS = [1, 2, 3, 5, 8, 13, 21] as const;
export const POINTS_HINT: Record<number, string> = {
  1: 'drobiazg, zero niejasności (telefon, potwierdzenie)', 2: 'prosta rzecz (mail, krótki post)', 3: 'jasne, kilka kroków (umówić spotkanie, zamówienie)',
  5: 'kilka kroków i ludzi (regulamin, newsletter, prezentacja)', 8: 'złożone, testy, zależności (strona z formularzem, kampania)',
  13: 'duże i niepewne — rozbij na mniejsze', 21: 'za duże — trzeba rozbić',
};
const P_RULES: [RegExp, number][] = [
  [/rozbic|zorganizowa|kampani|konferencj|wdrozeni|strategi/, 8],
  [/stron|landing|formularz|newsletter|regulamin|prezentacj|ofert|propozycj|wizualizacj|umow[ay]/, 5],
  [/umowic|spotkani|wizyt|zamowi|wydruk|grafik|baner|plakat|obsad|zaproszeni|rozeznani|znalezc/, 3],
  [/mail|wyslac|napisac|post |wiadomos|odpowiedziec|poprosic/, 2],
  [/zadzwoni|telefon|sms|przypomni|potwierdzi|sprawdzi/, 1],
];
/** A first guess from the task's wording, used until someone sets the points. */
export function estimatePoints(task: string): number {
  const k = searchKey(task);
  for (const [re, p] of P_RULES) if (re.test(k)) return p;
  return 2;
}
export const snapPoints = (n: unknown): number => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return POINTS.reduce((best, p) => (Math.abs(p - v) < Math.abs(best - v) ? p : best), 1 as number);
};
