/**
 * Learning procedures from what already happened. Looks at past events' checklists (which tasks come back
 * every time, how many days before, who does them), at finished processes (how long steps really take,
 * who really does them) and at what is coming up — and proposes: a new procedure, a fix to one, or starting
 * one now for an upcoming event. Plain rules over the data, no AI call — Claude turns it into a proposal.
 */
import type { Crm } from './crm.js';
import { Processes } from './processes.js';
import { EVENT_TYPE_LABEL, searchKey, type CrmEvent, type Task } from '../shared/domain.js';

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };
const mostCommon = <T>(xs: T[]): T | undefined => {
  const m = new Map<T, number>();
  for (const x of xs) m.set(x, (m.get(x) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};
const STOP = new Set(['oraz', 'albo', 'przez', 'przed', 'sobie', 'jest', 'bedzie', 'ktore', 'zrobic', 'trzeba', 'wszystko']);
/** The gist of a text as word stems, without dates, numbers and the event's own name. */
const gist = (text: string, skip: Set<string> = new Set()) => new Set(searchKey(text).split(/[^a-z]+/)
  .filter((w) => w.length > 3 && !STOP.has(w)).map((w) => w.slice(0, 5)).filter((w) => !skip.has(w)));
const similar = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  let both = 0;
  for (const w of a) if (b.has(w)) both++;
  return both / (a.size + b.size - both);
};

export interface SuggestedStep { title: string; personId: number; person: string; days: number; daysBefore: number; seen: number }
export interface ProcessSuggestion {
  kind: 'new' | 'adjust' | 'start';
  title: string;
  why: string;
  processId?: number;
  eventId?: string;
  steps?: SuggestedStep[];
  changes?: string[];
}

/** Events of the same kind: same type, or for "Inne" — the same leading word of the title ("Bieg…", "Piknik…"). */
const kindOf = (e: CrmEvent) => {
  if (e.type && e.type !== 'Other') return { key: e.type, label: EVENT_TYPE_LABEL[e.type] || e.type };
  const w = [...gist(e.title)][0] || 'inne';
  return { key: `Other:${w}`, label: e.title.split(/\s+/)[0] };
};

export async function suggestProcesses(crm: Crm): Promise<ProcessSuggestion[]> {
  const pr = new Processes(crm);
  const today = crm.today();
  const [events, tasks, procs, runs, people] = await Promise.all([
    crm.listEvents(), crm.listTasks(), pr.list(), pr.runs({ all: true }), crm.listPeople()]);
  const name = (id: number) => people.find((p) => p.id === id)?.name || '';
  const out: ProcessSuggestion[] = [];
  const byEvent = new Map<string, Task[]>();
  for (const t of tasks) if (t.eventId && !t.runId) byEvent.set(t.eventId, [...(byEvent.get(t.eventId) || []), t]);

  // 1. Checklists that repeat across events of one kind → a procedure ("Przygotowanie: Dzień otwarty")
  const groups = new Map<string, { label: string; past: CrmEvent[]; next: CrmEvent[] }>();
  for (const e of events) {
    if (e.status === 'cancelled') continue;
    const k = kindOf(e);
    const g = groups.get(k.key) || { label: k.label, past: [], next: [] };
    if ((byEvent.get(e.id) || []).length >= 2 && (e.date < today || e.status === 'done')) g.past.push(e);
    else if (e.date >= today) g.next.push(e);
    groups.set(k.key, g);
  }
  for (const [key, g] of groups) {
    if (g.past.length < 2) continue;
    type Cluster = { words: Set<string>; titles: string[]; before: number[]; people: number[]; events: Set<string>; durations: number[] };
    const clusters: Cluster[] = [];
    for (const e of g.past) {
      const skip = gist(e.title);
      for (const t of byEvent.get(e.id) || []) {
        const w = gist(t.task, skip);
        if (!w.size) continue;
        let c = clusters.find((x) => similar(x.words, w) >= 0.5);
        if (!c) { c = { words: w, titles: [], before: [], people: [], events: new Set(), durations: [] }; clusters.push(c); }
        c.titles.push(t.task);
        c.events.add(e.id);
        const when = t.due || t.completed;
        if (when) c.before.push(daysBetween(when, e.date));
        if (t.personId) c.people.push(t.personId);
      }
    }
    const need = Math.max(2, Math.ceil(g.past.length / 2));
    const common = clusters.filter((c) => c.events.size >= need).sort((a, b) => median(b.before) - median(a.before));
    if (common.length < 2) continue;
    const steps: SuggestedStep[] = common.map((c, i) => {
      const before = median(c.before);
      const nextBefore = i + 1 < common.length ? median(common[i + 1].before) : 0;
      const personId = mostCommon(c.people) || 0;
      return { title: mostCommon(c.titles) || c.titles[0], personId, person: name(personId), daysBefore: before,
        days: Math.max(1, before - nextBefore), seen: c.events.size };
    });
    const procName = `Przygotowanie: ${g.label}`;
    const existing = procs.find((p) => searchKey(p.name) === searchKey(procName) ||
      p.steps.filter((s) => steps.some((x) => similar(gist(x.title), gist(s.title)) >= 0.5)).length >= Math.ceil(steps.length / 2));
    if (!existing) {
      out.push({ kind: 'new', title: procName,
        why: `Przy ${g.past.length} wydarzeniach typu „${g.label}” powtarzało się ${steps.length} tych samych zadań (${g.past.map((e) => e.title).slice(0, 3).join(', ')}).`,
        steps });
    }
    // an upcoming event of that kind with no run yet → start now (or soon)
    const proc = existing;
    for (const e of g.next) {
      if (runs.some((r) => r.eventId === e.id && r.status !== 'cancelled')) continue;
      const lead = Math.max(...steps.map((s) => s.daysBefore), 0);
      const startBy = new Date(Date.parse(e.date) - lead * 86400000).toISOString().slice(0, 10);
      if (daysBetween(today, e.date) > lead + 14) continue;            // too early to bother
      out.push({ kind: 'start', title: `${proc ? proc.name : procName} → ${e.title}`, processId: proc?.id, eventId: e.id,
        why: `${e.title} jest ${e.date}. Zwykle zaczynaliście ok. ${lead} dni wcześniej${startBy < today ? ` — termin startu (${startBy}) już minął` : `, czyli do ${startBy}`}.` +
          (proc ? '' : ' Najpierw trzeba zapisać tę procedurę.') });
    }
    void key;
  }

  // 2. Finished processes teach real durations and who really does a step → adjust the procedure
  for (const p of procs) {
    const done = runs.filter((r) => r.processId === p.id && r.status === 'done');
    if (done.length < 2) continue;
    const changes: string[] = [];
    p.steps.forEach((s, i) => {
      const took = done.map((r) => r.steps[i]).filter((x) => x?.started && x.completed).map((x) => daysBetween(x.started, x.completed));
      if (took.length >= 2 && s.days && median(took) >= Math.max(s.days + 2, s.days * 1.5)) {
        changes.push(`Krok ${i + 1} „${s.title}”: zaplanowane ${s.days} dni, w praktyce zwykle ${median(took)} — wydłużyć termin albo sprawdzić, co go hamuje.`);
      }
      const who = mostCommon(done.map((r) => r.steps[i]?.personId).filter(Boolean) as number[]);
      if (who && who !== s.personId && done.filter((r) => r.steps[i]?.personId === who).length >= 2) {
        changes.push(`Krok ${i + 1} „${s.title}”: zwykle robi go ${name(who)}, a w procedurze jest ${name(s.personId) || 'nikt'} — przepisać?`);
      }
    });
    if (changes.length) out.push({ kind: 'adjust', title: p.name, processId: p.id, why: `Z ${done.length} zakończonych przebiegów.`, changes });
  }

  return out.sort((a, b) => ({ start: 0, adjust: 1, new: 2 })[a.kind] - ({ start: 0, adjust: 1, new: 2 })[b.kind]);
}

/** Plain text for Claude. */
export async function suggestText(crm: Crm): Promise<string> {
  const all = await suggestProcesses(crm);
  if (!all.length) return 'Na razie brak sugestii — za mało powtarzalnej historii (potrzeba min. 2 podobnych wydarzeń z zadaniami albo 2 zakończonych procesów).';
  return all.map((s) => {
    const head = { new: 'NOWA PROCEDURA', adjust: 'POPRAWKA PROCEDURY', start: 'URUCHOMIĆ TERAZ' }[s.kind];
    const steps = s.steps?.map((x, i) => `  ${i + 1}. ${x.title} — ${x.person || 'nikt'} (osoba ${x.personId || '-'}), ok. ${x.daysBefore} dni przed, ${x.days} dni na krok, było przy ${x.seen} wydarzeniach`).join('\n');
    return [`[${head}] ${s.title}${s.processId ? ` (procedura ${s.processId})` : ''}${s.eventId ? ` (wydarzenie ${s.eventId})` : ''}`, s.why, steps, ...(s.changes || []).map((c) => `  - ${c}`)]
      .filter(Boolean).join('\n');
  }).join('\n\n');
}
