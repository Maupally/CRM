/**
 * The class board for a school year: classes from the youngest to the oldest, who attends, who joins, who might.
 * Built from the school system's exports (students + leads) right in the browser — the result keeps no names,
 * e-mails or phones, only class, birth year, gender and stage, so it can go into a report.
 */

export const GRADES = ['nursery', 'jk', 'sk', 'grade_0', 'grade_1', 'grade_2', 'grade_3', 'grade_4', 'grade_5', 'grade_6', 'grade_7', 'grade_8'] as const;
export type Grade = (typeof GRADES)[number];
export const GRADE_LABEL: Record<Grade, string> = {
  nursery: 'Nursery', jk: 'JK', sk: 'SK', grade_0: 'Grade 0', grade_1: 'Grade 1', grade_2: 'Grade 2', grade_3: 'Grade 3', grade_4: 'Grade 4',
  grade_5: 'Grade 5', grade_6: 'Grade 6', grade_7: 'Grade 7', grade_8: 'Grade 8',
};

/** current = attends (invoiced), leaving = attends but not re-enrolling, joining = contract signed, starts later, potential = active lead (future leads are left out) */
export type Kid = 'current' | 'leaving' | 'joining' | 'potential';
/** chance = the lead's enrolment probability in % (lead score; none = 0) */
export interface BoardEntry { kind: Kid; gender?: 'M' | 'F'; born?: string; start?: string; stage?: string; year?: string; chance?: number;
  /** shown only in the browser that read the export — never stored or sent (sanitizeBoard drops it) */
  name?: string;
  /** the lead's id in the school system, for a link — browser only, like the name */
  leadId?: string }
export interface BoardColumn { key: string; label: string; cohort: string; entries: BoardEntry[] }
export interface ClassBoardData { year: string; madeOn: string; columns: BoardColumn[]; skipped: { dropped: number; disqualified: number; noGrade: number; future?: number } }

const STAGE_PL: Record<string, string> = {
  contacted: 'kontakt', meeting_booked: 'spotkanie', trial_day: 'dzień próbny', contract_sent: 'umowa wysłana', contract_signed: 'umowa podpisana',
};
export const stageLabel = (s?: string) => (s ? STAGE_PL[s] || s.replace(/_/g, ' ') : '');

type Row = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const gradeOf = (g: unknown): Grade | null => { const x = str(g).toLowerCase(); return (GRADES as readonly string[]).includes(x) ? (x as Grade) : null; };
/** '2627' → 2026 */
const startYear = (y: string) => (/^\d{4}$/.test(y) ? 2000 + Number(y.slice(0, 2)) : 0);

/** Which file is which — by its columns, so it does not matter in what order they are dropped. */
export function kindOfExport(header: string[]): 'students' | 'leads' | null {
  const h = new Set(header.map((x) => x.toLowerCase()));
  if (h.has('birthday') && h.has('academic_year_data')) return 'students';
  if (h.has('pipeline_status') && h.has('grade')) return 'leads';
  return null;
}

/**
 * year = '2627'. Students go by their grade in that year; a lead for a later year goes to the class of the same
 * children now (Grade 1 in 27/28 = today's Grade 0), so each column is one cohort.
 */
export function buildBoard(students: Row[], leads: Row[], year = '2627', today = new Date().toISOString().slice(0, 10)): ClassBoardData {
  const cols = new Map<string, BoardColumn>();
  const col = (key: string, label: string) => {
    if (!cols.has(key)) cols.set(key, { key, label, cohort: '', entries: [] });
    return cols.get(key)!;
  };
  for (const g of GRADES) col(g, GRADE_LABEL[g]);
  const skipped = { dropped: 0, disqualified: 0, noGrade: 0, future: 0 };
  const births = new Map<string, number[]>();

  for (const s of students) {
    const status = str(s.status);
    if (status === 'dropped_out' || str(s.is_archived) === 'true') { skipped.dropped++; continue; }
    let ay: { academic_year?: string; grade?: string; stage?: string }[] = [];
    try { ay = JSON.parse(str(s.academic_year_data) || '[]'); } catch { /* broken cell */ }
    const now = ay.find((a) => a.academic_year === year);
    const g = gradeOf(now?.grade);
    const kind: Kid | null = status === 'invoiced' ? 'current' : status === 'leaving_cy' || status === 'leaving_ny' ? 'leaving' : status === 'starting_ny' ? 'joining' : null;
    if (!kind) continue;
    if (!g) { skipped.noGrade++; continue; }
    const born = str(s.birthday).slice(0, 7);
    const gender = str(s.gender).toLowerCase().startsWith('f') ? 'F' : str(s.gender).toLowerCase().startsWith('m') ? 'M' : undefined;
    col(g, '').entries.push({ kind, gender, born: born || undefined, start: kind === 'joining' ? str(s.start_date).slice(0, 7) || undefined : undefined,
      name: [str(s.first_name), str(s.last_name)].filter(Boolean).join(' ') || undefined });
    if (born && kind !== 'joining') births.set(g, [...(births.get(g) || []), Number(born.slice(0, 4))]);
  }

  const y0 = startYear(year);
  for (const l of leads) {
    const status = str(l.status);
    if (status === 'disqualified') { skipped.disqualified++; continue; }
    // only leads being worked on now; future leads (a later year, parked) stay out of the board
    if (status === 'future_lead') { skipped.future++; continue; }
    if (status !== 'active') continue;
    const ly = str(l.academic_year);
    const g = gradeOf(l.grade);
    const chance = Math.max(0, Math.min(100, Number(str(l.lead_score)) || 0));
    // some lead titles are just an e-mail — that is a contact, not a name
    const name = [str(l.first_name), str(l.last_name)].filter(Boolean).join(' ') || (str(l.title).includes('@') ? '' : str(l.title)) || undefined;
    if (!g) { col('none', 'Bez klasy').entries.push({ kind: 'potential', stage: str(l.pipeline_status) || undefined, year: ly || undefined, chance, name, leadId: str(l.id) || undefined }); continue; }
    // a past year in the lead means it was never moved on — count it as now
    const shift = ly && startYear(ly) > y0 ? startYear(ly) - y0 : 0;
    const i = GRADES.indexOf(g) - shift;
    const entry: BoardEntry = { kind: 'potential', stage: str(l.pipeline_status) || undefined, year: ly || undefined, chance, name, leadId: str(l.id) || undefined };
    if (i < 0) col('younger', 'Młodsze').entries.push(entry);
    else col(GRADES[i], '').entries.push(entry);
  }

  // the cohort label: the usual birth year of the children in the class
  const order = ['younger', ...GRADES, 'none'];
  const out = order.map((k) => cols.get(k)).filter((c): c is BoardColumn => !!c && (c.entries.length > 0 || (GRADES as readonly string[]).includes(c.key)));
  const base = y0 - 3; // nursery in 26/27 → born 2023
  for (const c of out) {
    const i = GRADES.indexOf(c.key as Grade);
    const ys = births.get(c.key) || [];
    const mode = ys.length ? [...ys].sort((a, b) => ys.filter((x) => x === b).length - ys.filter((x) => x === a).length)[0] : 0;
    c.cohort = i >= 0 ? `rocznik ${mode || base - i}` : '';
    const rank: Record<Kid, number> = { current: 0, leaving: 1, joining: 2, potential: 3 };
    // leads: the most likely first
    c.entries.sort((a, b) => rank[a.kind] - rank[b.kind] || (b.chance ?? 0) - (a.chance ?? 0) || (a.born || '').localeCompare(b.born || ''));
  }
  // classes nobody is in, at the oldest end, are left out
  const last = Math.max(...out.map((c) => (c.entries.length ? GRADES.indexOf(c.key as Grade) : -1)));
  return { year, madeOn: today, columns: out.filter((c) => GRADES.indexOf(c.key as Grade) <= last), skipped };
}

export const count = (c: BoardColumn, k: Kid) => c.entries.filter((e) => e.kind === k).length;

/** What the server keeps: only the anonymous fields, whatever was sent — a name can never be stored by mistake. */
export function sanitizeBoard(b: ClassBoardData, year: string): ClassBoardData {
  if (!/^\d{4}$/.test(year)) throw new Error('Zły rok.');
  const kinds: Kid[] = ['current', 'leaving', 'joining', 'potential'];
  const ym = (v: unknown) => (/^\d{4}-\d{2}$/.test(String(v)) ? String(v) : undefined);
  const cols = (Array.isArray(b?.columns) ? b.columns : []).slice(0, 20).map((c) => ({
    key: str(c.key).slice(0, 20), label: str(c.label).slice(0, 30), cohort: str(c.cohort).slice(0, 20),
    entries: (Array.isArray(c.entries) ? c.entries : []).slice(0, 300).filter((e) => kinds.includes(e.kind)).map((e) => ({
      kind: e.kind, born: ym(e.born), start: ym(e.start),
      stage: e.stage && /^[a-z_]{1,30}$/.test(e.stage) ? e.stage : undefined, year: e.year && /^\d{4}$/.test(e.year) ? e.year : undefined,
      chance: e.kind === 'potential' ? Math.max(0, Math.min(100, Math.round(Number(e.chance) || 0))) : undefined,
    })),
  }));
  const n = (v: unknown) => Math.max(0, Math.min(100000, Number(v) || 0));
  return { year, madeOn: /^\d{4}-\d{2}-\d{2}$/.test(str(b?.madeOn)) ? str(b.madeOn) : new Date().toISOString().slice(0, 10), columns: cols,
    skipped: { dropped: n(b?.skipped?.dropped), disqualified: n(b?.skipped?.disqualified), noGrade: n(b?.skipped?.noGrade), future: n(b?.skipped?.future) } };
}
