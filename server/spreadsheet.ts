/**
 * Moving data between the old Google Sheet (.xlsx export) and the database.
 *
 * Import replaces everything — it is meant for the one-off migration and for
 * restoring a backup. Export writes the same tab and column layout back, so the
 * data can always go back into Google Sheets.
 */
import XLSX from 'xlsx';
import type { DB } from './db.ts';
import { tx, nowIso } from './db.ts';
import {
  STAGES, TYPES, RESULTS, CLOSED_STAGES, DEFAULT_SEGMENT,
  txt, longTxt, normDate, companyKey, normPhone, isIsoDay,
} from '../shared/domain.ts';
import type { Crm } from './crm.ts';

type Cell = unknown;
type Sheet = Cell[][];

function findSheet(wb: XLSX.WorkBook, ...names: string[]): Sheet | null {
  for (const n of names) {
    const hit = wb.SheetNames.find((s) => s.trim().toLowerCase() === n.toLowerCase());
    if (hit) return XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[hit], { header: 1, raw: true, defval: '' });
  }
  return null;
}

/** Spreadsheet serial numbers, Date objects and text dates all become yyyy-MM-dd. */
function day(v: Cell): string {
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const p = XLSX.SSF.parse_date_code(v);
    if (p) return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  }
  return normDate(v);
}

function headerIndex(head: Cell[]): (name: string) => number {
  const h = head.map((c) => txt(c).toLowerCase());
  return (name: string) => h.indexOf(name.toLowerCase());
}

export interface ImportReport {
  leads: number;
  activities: number;
  carriedOver: number;
  skippedActivities: number;
  segments: number;
  templates: number;
  events: number;
  tasks: number;
  warnings: string[];
}

const STAGE_RE = new RegExp(`^(${STAGES.join('|')})\\s*→\\s*(${STAGES.join('|')})(?:\\s*:\\s*([\\s\\S]*))?$`);

export function importWorkbook(db: DB, buf: Buffer | Uint8Array, today: string, owner: string): ImportReport {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: false });
  const crm = findSheet(wb, 'CRM');
  if (!crm || crm.length < 2) throw new Error('The workbook has no CRM tab with data.');

  const rep: ImportReport = {
    leads: 0, activities: 0, carriedOver: 0, skippedActivities: 0, segments: 0, templates: 0,
    events: 0, tasks: 0, warnings: [],
  };
  const now = nowIso();

  tx(db, () => {
    for (const t of ['activities', 'tasks', 'events', 'leads', 'segments', 'templates']) db.exec(`DELETE FROM ${t}`);
    db.exec(`DELETE FROM sqlite_sequence WHERE name = 'activities'`);

    /* ---- playbook */
    const pb = findSheet(wb, 'Playbook');
    if (pb && pb.length > 1) {
      const at = headerIndex(pb[0]);
      const col = (r: Cell[], n: string) => (at(n) > -1 ? longTxt(r[at(n)]) : '');
      const ins = db.prepare(`INSERT OR REPLACE INTO segments
        (name, weight, goal, who, opening, hook, offer, cta, objections, why, sort)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      pb.slice(1).forEach((r, n) => {
        const name = txt(r[0]);
        if (!name || name.length > 40) return;           // footer lines, not segments
        const w = Number(r[at('Waga priorytetu')]);
        ins.run(name, Number.isFinite(w) && txt(r[at('Waga priorytetu')]) !== '' ? w : 1,
          col(r, 'Cel współpracy'), col(r, 'Do kogo dzwonić'), col(r, 'Otwarcie (telefon)'), col(r, 'Hook'),
          col(r, 'Oferta'), col(r, 'CTA'), col(r, 'Obiekcje i odpowiedzi'), col(r, 'Dlaczego dzwonię (1 zdanie)'), n + 1);
        rep.segments++;
      });
    }

    /* ---- templates */
    const tp = findSheet(wb, 'Szablony', 'Templates');
    if (tp && tp.length > 1) {
      const ins = db.prepare('INSERT OR REPLACE INTO templates (code, kind, segments, subject, body) VALUES (?, ?, ?, ?, ?)');
      for (const r of tp.slice(1)) {
        const code = txt(r[0]);
        if (!code || code.length > 6) continue;
        ins.run(code, txt(r[1]), txt(r[2]), txt(r[3]), longTxt(r[4]));
        rep.templates++;
      }
    }

    /* ---- leads */
    const at = headerIndex(crm[0]);
    const need = ['ID', 'Firma', 'Status'];
    const missing = need.filter((n) => at(n) === -1);
    if (missing.length) throw new Error(`CRM tab is missing columns: ${missing.join(', ')}`);
    const get = (r: Cell[], n: string) => (at(n) > -1 ? r[at(n)] : '');
    const segs = new Set((db.prepare('SELECT name FROM segments').all() as { name: string }[]).map((s) => s.name));
    const insLead = db.prepare(`INSERT INTO leads
      (id, segment, company, company_key, industry, city, phone, email, web, person, stage, notes, extra, source,
       legacy_last_contact, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const nextFromSheet = new Map<string, string>();
    const ids = new Set<string>();
    let autoId = 0;
    for (const r of crm) {
      const m = txt(r[at('ID')]).match(/(\d+)/);
      if (m) autoId = Math.max(autoId, parseInt(m[1], 10));
    }
    for (const r of crm.slice(1)) {
      const company = txt(get(r, 'Firma'));
      if (!company) continue;
      let id = txt(get(r, 'ID'));
      if (!id || ids.has(id)) {
        const was = id;
        id = 'L' + String(++autoId).padStart(3, '0');
        if (was) rep.warnings.push(`Duplicate lead ID ${was} (${company}) renumbered to ${id}.`);
      }
      ids.add(id);
      let stage = txt(get(r, 'Status')).toLowerCase();
      if (!(STAGES as readonly string[]).includes(stage)) {
        if (stage) rep.warnings.push(`${id}: unknown stage "${stage}" imported as "new".`);
        stage = 'new';
      }
      let segment = txt(get(r, 'Segment')) || DEFAULT_SEGMENT;
      if (!segs.has(segment)) {
        db.prepare('INSERT OR IGNORE INTO segments (name, weight, sort) VALUES (?, 1, 999)').run(segment);
        segs.add(segment);
        rep.warnings.push(`Segment "${segment}" was not in the Playbook — created with weight 1.`);
      }
      const phone = txt(get(r, 'Telefon'));
      insLead.run(id, segment, company, companyKey(company), txt(get(r, 'Branża')), txt(get(r, 'Miasto')),
        normPhone(phone) || phone, txt(get(r, 'Email')).toLowerCase(), txt(get(r, 'WWW')),
        txt(get(r, 'Osoba / stanowisko')), stage, longTxt(get(r, 'Notatki')), txt(get(r, 'Dodatkowe kontakty')),
        txt(get(r, 'Źródło')), day(get(r, 'Ostatni kontakt')), now, now);
      const next = day(get(r, 'Następny kontakt'));
      if (next && !CLOSED_STAGES.includes(stage as never)) nextFromSheet.set(id, next);
      rep.leads++;
    }

    /* ---- history */
    const hs = findSheet(wb, 'History');
    const open = new Set<string>();
    if (hs && hs.length > 1) {
      const hi = headerIndex(hs[0]);
      const g = (r: Cell[], n: string) => (hi(n) > -1 ? r[hi(n)] : '');
      const ins = db.prepare(`INSERT INTO activities
        (lead_id, date, type, note, owner, result, stage_from, stage_to, legacy_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const r of hs.slice(1)) {
        const leadId = txt(g(r, 'Lead ID'));
        if (!leadId) continue;
        if (!ids.has(leadId)) { rep.skippedActivities++; continue; }
        const date = day(g(r, 'Date'));
        if (!isIsoDay(date)) { rep.skippedActivities++; rep.warnings.push(`History row for ${leadId} has no valid date — skipped.`); continue; }
        let type = txt(g(r, 'Type')) || 'Note';
        if (!(TYPES as readonly string[]).includes(type)) type = 'Note';
        let result = txt(g(r, 'Result')).toLowerCase() || 'done';
        if (!(RESULTS as readonly string[]).includes(result)) result = 'done';
        let note = longTxt(g(r, 'Note'));
        if (note === '(no note)') note = '';
        let from = '', to = '';
        const m = note.match(STAGE_RE);
        if (m) { from = m[1]; to = m[2]; note = longTxt(m[3]); }
        // a planned follow-up on a lead that is already won or dropped is dead
        const stage = (db.prepare('SELECT stage FROM leads WHERE id = ?').get(leadId) as { stage: string }).stage;
        if (result === 'planned' && CLOSED_STAGES.includes(stage as never)) result = 'cancelled';
        if (result === 'planned') open.add(leadId);
        ins.run(leadId, date, type, note, txt(g(r, 'Owner')) || owner, result, from, to, txt(g(r, 'ID')), now);
        rep.activities++;
      }
    }

    /* ---- follow-up dates that exist only in the sheet column become planned calls */
    const insPlan = db.prepare(`INSERT INTO activities (lead_id, date, type, note, owner, result, created_at)
      VALUES (?, ?, 'Call', 'Follow-up carried over from the sheet', ?, 'planned', ?)`);
    for (const [id, date] of nextFromSheet) {
      if (open.has(id)) continue;
      insPlan.run(id, date, owner, now);
      rep.carriedOver++;
    }

    /* ---- events and tasks */
    const ev = findSheet(wb, 'Events');
    if (ev && ev.length > 1) {
      const ei = headerIndex(ev[0]);
      const g = (r: Cell[], n: string) => (ei(n) > -1 ? r[ei(n)] : '');
      const ins = db.prepare(`INSERT OR REPLACE INTO events (id, title, type, date, time, lead_id, company, location,
        status, owner, cost, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const r of ev.slice(1)) {
        const id = txt(g(r, 'ID'));
        if (!/^EV-\d+$/.test(id)) continue;
        const leadId = txt(g(r, 'Lead ID'));
        ins.run(id, txt(g(r, 'Title')) || '(untitled)', txt(g(r, 'Type')) || 'Other', day(g(r, 'Date')) || today,
          txt(g(r, 'Time')), ids.has(leadId) ? leadId : '', txt(g(r, 'Company')), txt(g(r, 'Location')),
          txt(g(r, 'Status')) || 'planned', txt(g(r, 'Owner')) || owner, txt(g(r, 'Cost')), longTxt(g(r, 'Notes')),
          day(g(r, 'Created')) || today);
        rep.events++;
      }
    }
    const ts = findSheet(wb, 'Tasks');
    if (ts && ts.length > 1) {
      const ti = headerIndex(ts[0]);
      const g = (r: Cell[], n: string) => (ti(n) > -1 ? r[ti(n)] : '');
      const ins = db.prepare(`INSERT OR REPLACE INTO tasks (id, event_id, task, owner, due, status, notes, completed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const r of ts.slice(1)) {
        const id = txt(g(r, 'ID'));
        if (!/^TS-\d+$/.test(id) || !longTxt(g(r, 'Task'))) continue;
        const status = txt(g(r, 'Status')) || 'todo';
        ins.run(id, txt(g(r, 'Event ID')), longTxt(g(r, 'Task')), txt(g(r, 'Owner')) || owner, day(g(r, 'Due')),
          ['todo', 'doing', 'done'].includes(status) ? status : 'todo', longTxt(g(r, 'Notes')), day(g(r, 'Completed')));
        rep.tasks++;
      }
    }
  });

  return rep;
}

/** Full backup in the original sheet layout, so it can be opened in Google Sheets again. */
export function exportWorkbook(crm: Crm): Buffer {
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: unknown[][], widths?: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  const leads = crm.listLeads();
  add('CRM', [
    ['ID', 'Segment', 'Firma', 'Branża', 'Miasto', 'Telefon', 'Email', 'WWW', 'Osoba / stanowisko', 'Status',
      'Priorytet', 'Dlaczego dzwonię', 'Ostatni kontakt', 'Następny kontakt', 'Notatki', 'Dodatkowe kontakty', 'Źródło'],
    ...leads.map((l) => [l.id, l.segment, l.company, l.industry, l.city, l.phone, l.email, l.web, l.person, l.stage,
      l.priority, l.why, l.lastContact, l.nextContact, l.notes, l.extra, l.source]),
  ], [7, 16, 36, 14, 14, 13, 28, 28, 22, 14, 8, 40, 12, 12, 50, 24, 14]);

  const acts = crm.db.prepare('SELECT * FROM activities ORDER BY date, id').all() as Record<string, any>[];
  add('History', [
    ['ID', 'Lead ID', 'Date', 'Type', 'Note', 'Owner', 'Result'],
    ...acts.map((a) => ['H' + String(a.id).padStart(5, '0'), a.lead_id, a.date, a.type,
      (a.stage_to ? `${a.stage_from} → ${a.stage_to}${a.note ? ': ' + a.note : ''}` : a.note) || '(no note)',
      a.owner, a.result]),
  ], [9, 8, 12, 9, 60, 10, 10]);

  const segs = crm.listSegments();
  add('Playbook', [
    ['Segment', 'Waga priorytetu', 'Cel współpracy', 'Do kogo dzwonić', 'Otwarcie (telefon)', 'Hook', 'Oferta', 'CTA',
      'Obiekcje i odpowiedzi', '', '', 'Dlaczego dzwonię (1 zdanie)'],
    ...segs.map((s) => [s.name, s.weight, s.goal, s.who, s.opening, s.hook, s.offer, s.cta, s.objections, '', '', s.why]),
  ]);
  add('Szablony', [
    ['Kod', 'Typ', 'Dla segmentu', 'Temat', 'Treść'],
    ...crm.listTemplates().map((t) => [t.code, t.kind, t.segments, t.subject, t.body]),
  ], [6, 28, 30, 50, 90]);
  add('Events', [
    ['ID', 'Title', 'Type', 'Date', 'Time', 'Lead ID', 'Company', 'Location', 'Status', 'Owner', 'Cost', 'Notes', 'Created'],
    ...crm.listEvents().map((e) => [e.id, e.title, e.type, e.date, e.time, e.leadId, e.company, e.location, e.status,
      e.owner, e.cost, e.notes, e.createdAt]),
  ]);
  add('Tasks', [
    ['ID', 'Event ID', 'Task', 'Owner', 'Due', 'Status', 'Notes', 'Completed'],
    ...crm.listTasks().map((t) => [t.id, t.eventId, t.task, t.owner, t.due, t.status, t.notes, t.completed]),
  ]);

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
