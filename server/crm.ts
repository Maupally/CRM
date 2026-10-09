import type { DB, Q, Row } from './db.js';
import { nowIso } from './db.js';
import {
  STAGES, TYPES, RESULTS, COUNTED, CLOSED_STAGES, EVENT_STATUS, TASK_STATUS, DEFAULT_SEGMENT, STAGE_LABEL,
  type Stage, type Lead, type Activity, type Segment, type Template, type CrmEvent, type Task, type Material, type Person, type PersonEvent, type EventPerson, type Style,
  txt, longTxt, searchKey, normPhone, normEmail, normUrl, companyKey, isIsoDay, addDays, priority, autoStage,
  fillTemplate, isoDay,
} from '../shared/domain.js';
import { buildReport } from './report.js';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const bad = (msg: string) => new HttpError(400, msg);
const notFound = (msg: string) => new HttpError(404, msg);
const conflict = (msg: string) => new HttpError(409, msg);

export interface LeadInput {
  company?: string; segment?: string; industry?: string; city?: string; phone?: string;
  email?: string; web?: string; person?: string; notes?: string; extra?: string; source?: string;
  stage?: string;
}

export interface FollowUp { date: string; type?: string; note?: string }

export interface LogInput {
  type: string;
  result?: string;
  note?: string;
  date?: string;
  /** Explicit stage; otherwise the auto-stage rule decides. */
  stage?: string;
  reason?: string;
  followUp?: FollowUp | null;
}

export interface CompleteInput {
  result: string;
  note?: string;
  stage?: string;
  reason?: string;
  followUp?: FollowUp | null;
}

export interface BulkInput {
  ids: string[];
  stage?: string;
  reason?: string;
  segment?: string;
  plan?: FollowUp | null;
}

const LEAD_SQL = `
SELECT l.*,
  (SELECT MIN(a.date) FROM crm.activities a WHERE a.lead_id = l.id AND a.result = 'planned') AS next_contact,
  (SELECT a.type FROM crm.activities a WHERE a.lead_id = l.id AND a.result = 'planned'
     ORDER BY a.date, a.id LIMIT 1) AS next_type,
  (SELECT COUNT(*) FROM crm.activities a WHERE a.lead_id = l.id AND a.result = 'planned') AS open_count,
  (SELECT MAX(a.date) FROM crm.activities a WHERE a.lead_id = l.id
     AND a.result IN ('reached', 'done') AND a.type <> 'Note') AS last_logged
FROM crm.leads l`;

const TASK_SQL = `SELECT t.*, e.title AS event_title, e.date AS event_date, l.company AS company,
  p.name AS person_name, p.role AS person_role, p.email AS person_email, p.phone AS person_phone,
  r.title AS run_title, pr.name AS run_process,
  (SELECT COUNT(*) FROM crm.tasks s WHERE s.run_id = t.run_id AND t.run_id <> 0) AS run_steps FROM crm.tasks t
  LEFT JOIN crm.events e ON e.id = t.event_id
  LEFT JOIN crm.leads l ON l.id = t.lead_id
  LEFT JOIN crm.people p ON p.id = t.person_id
  LEFT JOIN crm.process_runs r ON r.id = t.run_id AND t.run_id <> 0
  LEFT JOIN crm.processes pr ON pr.id = r.process_id`;

/** Emails keep their subject in its own field; a "Temat: …" first line is lifted out of the body. */
function cleanMaterial(m: Partial<Material>): Material {
  let body = longTxt(m.body);
  let subject = txt(m.subject);
  const head = body.match(/^\s*(temat|subject)\s*:\s*(.+)\n+/i);
  if (head) { subject = subject || txt(head[2]); body = body.slice(head[0].length).trim(); }
  const out: Material = { title: txt(m.title), body };
  if (subject) out.subject = subject;
  if (txt(m.to)) out.to = txt(m.to);
  return out;
}

function parseMaterials(raw: unknown): Material[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(String(raw));
    return Array.isArray(v) ? v.filter((m) => m && (m.title || m.body)).map(cleanMaterial) : [];
  } catch { return []; }
}
const parseIds = (raw: unknown): number[] => String(raw || '').split(',').map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);

export class Crm {
  /**
   * @param db     the database, or a transaction handle when running inside tx()
   * @param today  injectable clock, so tests can travel in time
   */
  constructor(
    public db: DB,
    public owner = 'Martin',
    public today: () => string = () => isoDay(),
    private q: Q = db,
    private inTx = false,
  ) {}

  /** Runs fn with a Crm bound to one transaction. Nested calls reuse the outer one. */
  private async tx<T>(fn: (c: Crm) => Promise<T>): Promise<T> {
    if (this.inTx) return fn(this);
    return this.db.tx((t) => fn(new Crm(this.db, this.owner, this.today, t, true)));
  }

  /* ============================================================ helpers */

  private async segmentMap(): Promise<Map<string, Row>> {
    const m = new Map<string, Row>();
    for (const s of await this.q.all('SELECT name, weight, why FROM crm.segments')) m.set(s.name, s);
    return m;
  }

  private toLead(r: Row, segs: Map<string, Row>): Lead {
    const seg = segs.get(r.segment);
    const logged = r.last_logged || '';
    const legacy = r.legacy_last_contact || '';
    const base = {
      id: r.id, segment: r.segment, company: r.company, industry: r.industry, city: r.city,
      phone: r.phone, email: r.email, web: r.web, person: r.person, stage: r.stage as Stage,
      notes: r.notes, extra: r.extra, source: r.source, createdAt: r.created_at, updatedAt: r.updated_at,
      nextContact: r.next_contact || '', nextType: r.next_type || '',
      lastContact: logged > legacy ? logged : legacy,
      openCount: Number(r.open_count) || 0,
      why: seg?.why || '',
      priority: 0,
    };
    base.priority = priority(base, seg ? Number(seg.weight) : undefined);
    return base;
  }

  private async leadRow(id: string): Promise<Row> {
    const r = await this.q.get('SELECT * FROM crm.leads WHERE id = ?', [id]);
    if (!r) throw notFound(`Nie ma firmy ${id}.`);
    return r;
  }

  private toActivity(r: Row): Activity {
    return {
      id: Number(r.id), leadId: r.lead_id, date: r.date, type: r.type, note: r.note, owner: r.owner,
      result: r.result, stageFrom: r.stage_from, stageTo: r.stage_to, createdAt: r.created_at,
      ...(r.company !== undefined ? { company: r.company } : {}),
    };
  }

  async activityRow(id: number): Promise<Row> {
    const r = await this.q.get('SELECT * FROM crm.activities WHERE id = ?', [id]);
    if (!r) throw notFound(`Nie ma aktywności ${id}.`);
    return r;
  }

  private checkStage(s: string): Stage {
    if (!(STAGES as readonly string[]).includes(s)) throw bad(`Nieznany etap: ${s}`);
    return s as Stage;
  }

  private checkType(t: string): string {
    if (!(TYPES as readonly string[]).includes(t)) throw bad(`Nieznany typ aktywności: ${t}`);
    return t;
  }

  private checkResult(r: string): string {
    if (!(RESULTS as readonly string[]).includes(r)) throw bad(`Nieznany wynik: ${r}`);
    return r;
  }

  private checkDate(d: unknown, label = 'data'): string {
    if (!isIsoDay(d)) throw bad(`Zła ${label}: ${String(d)}`);
    return d;
  }

  private async insertActivity(a: {
    leadId: string; date: string; type: string; note: string; result: string;
    stageFrom?: string; stageTo?: string;
  }): Promise<number> {
    const r = await this.q.get(`INSERT INTO crm.activities
      (lead_id, date, type, note, owner, result, stage_from, stage_to, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [a.leadId, a.date, a.type, a.note, this.owner, a.result, a.stageFrom || '', a.stageTo || '', nowIso()]);
    return Number(r!.id);
  }

  private async touch(id: string) {
    await this.q.run('UPDATE crm.leads SET updated_at = ? WHERE id = ?', [nowIso(), id]);
  }

  /** Sets the stage and, if the lead is now closed, cancels its open follow-ups. */
  private async applyStage(leadId: string, to: Stage) {
    await this.q.run('UPDATE crm.leads SET stage = ?, updated_at = ? WHERE id = ?', [to, nowIso(), leadId]);
    if (CLOSED_STAGES.includes(to)) {
      await this.q.run(`UPDATE crm.activities SET result = 'cancelled' WHERE lead_id = ? AND result = 'planned'`, [leadId]);
    }
  }

  private async schedule(leadId: string, f: FollowUp | null | undefined) {
    if (!f || !f.date) return;
    const type = this.checkType(txt(f.type) || 'Call');
    await this.insertActivity({
      leadId, date: this.checkDate(f.date, 'data follow-upu'), type, result: 'planned',
      note: longTxt(f.note),
    });
  }

  /** Works out the target stage for a finished activity, validating an explicit choice. */
  private resolveStage(from: Stage, type: string, result: string, stage?: string, reason?: string): Stage {
    const explicit = txt(stage);
    const to = explicit ? this.checkStage(explicit) : autoStage(from, type, result);
    if (to === 'disqualified' && from !== 'disqualified' && !txt(reason)) {
      throw bad('Podaj powód odrzucenia.');
    }
    return to;
  }

  /* ============================================================== leads */

  async listLeads(): Promise<Lead[]> {
    const segs = await this.segmentMap();
    return (await this.q.all(LEAD_SQL + ' ORDER BY l.id')).map((r) => this.toLead(r, segs));
  }

  async getLead(id: string): Promise<Lead> {
    const r = await this.q.get(LEAD_SQL + ' WHERE l.id = ?', [id]);
    if (!r) throw notFound(`Nie ma firmy ${id}.`);
    return this.toLead(r, await this.segmentMap());
  }

  async leadCard(id: string) {
    const lead = await this.getLead(id);
    const activities = (await this.q.all(`SELECT * FROM crm.activities WHERE lead_id = ?
      ORDER BY CASE result WHEN 'planned' THEN 0 ELSE 1 END,
               CASE WHEN result = 'planned' THEN date END ASC,
               date DESC, id DESC`, [id])).map((r) => this.toActivity(r));
    const seg = await this.q.get('SELECT * FROM crm.segments WHERE name = ?', [lead.segment]);
    const events = (await this.q.all('SELECT * FROM crm.events WHERE lead_id = ? ORDER BY date', [id]))
      .map((e) => this.toEvent(e));
    return { lead, activities, playbook: seg ? this.toSegment(seg) : null, events };
  }

  async findDuplicate(company: string, exceptId?: string): Promise<Row | undefined> {
    const key = companyKey(company);
    if (!key) return undefined;
    return this.q.get('SELECT id, company FROM crm.leads WHERE company_key = ? AND id <> ?', [key, exceptId || '']);
  }

  private async nextLeadId(): Promise<string> {
    const r = await this.q.get(`SELECT COALESCE(MAX(CAST(substring(id FROM '[0-9]+') AS INTEGER)), 0) AS n
      FROM crm.leads WHERE id ~ '[0-9]'`);
    return 'L' + String(Number(r!.n) + 1).padStart(3, '0');
  }

  async createLead(d: LeadInput & { next?: string }): Promise<Lead> {
    const company = txt(d.company);
    if (!company) throw bad('Nazwa firmy jest wymagana.');
    const dup = await this.findDuplicate(company);
    if (dup) throw conflict(`Ta firma już jest w bazie: ${dup.company} (${dup.id}).`);
    const stage = this.checkStage(txt(d.stage) || 'new');
    const segment = txt(d.segment) || DEFAULT_SEGMENT;
    return this.tx(async (c) => {
      const id = await c.nextLeadId();
      const now = nowIso();
      await c.q.run(`INSERT INTO crm.leads
        (id, segment, company, company_key, industry, city, phone, email, web, person, stage,
         notes, extra, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        id, segment, company, companyKey(company), txt(d.industry), txt(d.city),
        normPhone(d.phone) || txt(d.phone), normEmail(d.email), normUrl(d.web), txt(d.person), stage,
        longTxt(d.notes), txt(d.extra), txt(d.source) || 'Manual', now, now]);
      await c.insertActivity({ leadId: id, date: c.today(), type: 'Note', note: 'Dodano ręcznie', result: 'done' });
      if (d.next) await c.schedule(id, { date: d.next, type: 'Call', note: 'Pierwszy telefon' });
      return c.getLead(id);
    });
  }

  async updateLead(id: string, d: LeadInput): Promise<Lead> {
    const cur = await this.leadRow(id);
    const set: Record<string, string> = {};
    if (d.company !== undefined) {
      const company = txt(d.company);
      if (!company) throw bad('Nazwa firmy jest wymagana.');
      const dup = await this.findDuplicate(company, id);
      if (dup) throw conflict(`Inna firma ma już tę nazwę: ${dup.company} (${dup.id}).`);
      set.company = company;
      set.company_key = companyKey(company);
    }
    if (d.industry !== undefined) set.industry = txt(d.industry);
    if (d.city !== undefined) set.city = txt(d.city);
    if (d.phone !== undefined) set.phone = normPhone(d.phone) || txt(d.phone);
    if (d.email !== undefined) {
      const e = txt(d.email);
      set.email = normEmail(e);
      if (e && !set.email) throw bad(`To nie jest adres e-mail: ${e}`);
    }
    if (d.web !== undefined) set.web = normUrl(d.web);
    if (d.person !== undefined) set.person = txt(d.person);
    if (d.notes !== undefined) set.notes = longTxt(d.notes);
    if (d.extra !== undefined) set.extra = txt(d.extra);
    if (d.source !== undefined) set.source = txt(d.source);
    if (d.segment !== undefined) set.segment = txt(d.segment) || DEFAULT_SEGMENT;

    return this.tx(async (c) => {
      const keys = Object.keys(set);
      if (keys.length) {
        await c.q.run(`UPDATE crm.leads SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
          [...keys.map((k) => set[k]), nowIso(), id]);
      }
      if (set.segment !== undefined && set.segment !== cur.segment) {
        await c.insertActivity({ leadId: id, date: c.today(), type: 'Note', result: 'done',
          note: `Segment: ${cur.segment || '—'} → ${set.segment}` });
      }
      return c.getLead(id);
    });
  }

  /** Adds a dated line to the company's standing notes, keeping what is already there. */
  async appendNote(id: string, text: string): Promise<Lead> {
    const cur = await this.leadRow(id);
    const line = longTxt(text);
    if (!line) throw bad('Notatka jest pusta.');
    const [y, m, d] = this.today().split('-');
    const notes = [cur.notes, `${d}.${m}.${y}: ${line}`].filter(Boolean).join('\n');
    return this.updateLead(id, { notes });
  }

  async deleteLead(id: string) {
    await this.leadRow(id);
    await this.tx(async (c) => {
      await c.q.run('DELETE FROM crm.activities WHERE lead_id = ?', [id]);
      await c.q.run(`UPDATE crm.events SET lead_id = '' WHERE lead_id = ?`, [id]);
      await c.q.run('DELETE FROM crm.leads WHERE id = ?', [id]);
    });
    return { ok: true };
  }

  /** Stage change on its own. Moving a lead is not a contact, so no "last contact" update. */
  async setStage(id: string, stage: string, reason?: string) {
    const cur = await this.leadRow(id);
    const to = this.checkStage(stage);
    if (to === 'disqualified' && !txt(reason)) throw bad('Podaj powód odrzucenia.');
    if (cur.stage === to) return this.leadCard(id);
    await this.tx(async (c) => {
      await c.applyStage(id, to);
      await c.insertActivity({ leadId: id, date: c.today(), type: 'Note', result: 'done',
        note: longTxt(reason), stageFrom: cur.stage, stageTo: to });
    });
    return this.leadCard(id);
  }

  /** The same change for many leads at once — stage, segment and/or a planned activity. */
  async bulk(d: BulkInput) {
    const ids = [...new Set((d.ids || []).map(txt).filter(Boolean))];
    if (!ids.length) throw bad('Nie zaznaczono żadnej firmy.');
    if (ids.length > 1000) throw bad('Za dużo naraz (maks. 1000).');
    const stage = txt(d.stage) ? this.checkStage(txt(d.stage)) : null;
    if (stage === 'disqualified' && !txt(d.reason)) throw bad('Podaj powód odrzucenia.');
    const segment = txt(d.segment);
    if (d.plan?.date) this.checkDate(d.plan.date, 'data');
    let changed = 0;
    await this.tx(async (c) => {
      for (const id of ids) {
        const cur = await c.q.get('SELECT stage, segment FROM crm.leads WHERE id = ?', [id]);
        if (!cur) continue;
        if (stage && cur.stage !== stage) {
          await c.applyStage(id, stage);
          await c.insertActivity({ leadId: id, date: c.today(), type: 'Note', result: 'done',
            note: longTxt(d.reason), stageFrom: cur.stage, stageTo: stage });
        }
        if (segment && cur.segment !== segment) {
          await c.q.run('UPDATE crm.leads SET segment = ?, updated_at = ? WHERE id = ?', [segment, nowIso(), id]);
          await c.insertActivity({ leadId: id, date: c.today(), type: 'Note', result: 'done',
            note: `Segment: ${cur.segment || '—'} → ${segment}` });
        }
        if (d.plan?.date && !CLOSED_STAGES.includes((stage || cur.stage) as Stage)) await c.schedule(id, d.plan);
        changed++;
      }
    });
    return { changed };
  }

  /* ========================================================= activities */

  /**
   * The "after a call" action. Records what happened (or plans something), moves
   * the stage — explicitly or by the auto rule — and optionally books the next step.
   */
  async logActivity(leadId: string, d: LogInput) {
    const cur = await this.leadRow(leadId);
    const type = this.checkType(txt(d.type) || 'Call');
    const result = this.checkResult(txt(d.result) || 'done');
    if (result === 'cancelled') throw bad('Nie można zapisać anulowanej aktywności.');
    const note = longTxt(d.note);

    if (result === 'planned') {
      const date = this.checkDate(d.date || this.today());
      await this.tx(async (c) => {
        await c.insertActivity({ leadId, date, type, result, note });
        await c.touch(leadId);
      });
      return this.leadCard(leadId);
    }

    const date = d.date ? this.checkDate(d.date) : this.today();
    if (date > this.today()) throw bad('To, co już się wydarzyło, nie może mieć daty w przyszłości — zaplanuj to.');
    const from = cur.stage as Stage;
    const to = this.resolveStage(from, type, result, d.stage, d.reason);
    const text = [note, to === 'disqualified' && from !== to ? longTxt(d.reason) : ''].filter(Boolean).join(' — ');

    await this.tx(async (c) => {
      if (to !== from) await c.applyStage(leadId, to);
      await c.insertActivity({ leadId, date, type, result, note: text,
        stageFrom: to !== from ? from : '', stageTo: to !== from ? to : '' });
      await c.schedule(leadId, d.followUp);
      await c.touch(leadId);
    });
    return this.leadCard(leadId);
  }

  /** Tick off a planned activity: reached, no answer or done. Optionally book the next one. */
  async completeActivity(id: number, d: CompleteInput) {
    const a = await this.activityRow(id);
    if (a.result !== 'planned') throw bad('Ta aktywność jest już zamknięta.');
    const result = this.checkResult(txt(d.result));
    if (result === 'planned' || result === 'cancelled') throw bad('Wybierz: odebrał, nie odebrał albo zrobione.');
    const cur = await this.leadRow(a.lead_id);
    const now = this.today();
    const from = cur.stage as Stage;
    const to = this.resolveStage(from, a.type, result, d.stage, d.reason);

    // done late? it belongs to the day it actually happened; keep the due date in the note
    const parts = [a.note, longTxt(d.note)];
    if (to === 'disqualified' && from !== to) parts.push(longTxt(d.reason));
    if (a.date !== now) parts.push(`plan: ${a.date}`);
    const text = parts.filter(Boolean).join(' | ');

    await this.tx(async (c) => {
      if (to !== from) await c.applyStage(a.lead_id, to);
      await c.q.run(`UPDATE crm.activities SET result = ?, date = ?, note = ?, stage_from = ?, stage_to = ?
        WHERE id = ?`, [result, now, text, to !== from ? from : '', to !== from ? to : '', id]);
      await c.schedule(a.lead_id, d.followUp);
      await c.touch(a.lead_id);
    });
    return this.leadCard(a.lead_id);
  }

  /** Correct a logged or planned activity — date, type or note. */
  async updateActivity(id: number, d: { date?: string; note?: string; type?: string; result?: string }) {
    const a = await this.activityRow(id);
    const set: Record<string, string> = {};
    if (d.date !== undefined) {
      set.date = this.checkDate(d.date);
      if (a.result !== 'planned' && set.date > this.today()) throw bad('Zakończona aktywność nie może być w przyszłości.');
    }
    if (d.note !== undefined) set.note = longTxt(d.note);
    if (d.type !== undefined) set.type = this.checkType(d.type);
    if (d.result !== undefined) {
      const r = this.checkResult(d.result);
      if ((r === 'planned') !== (a.result === 'planned')) throw bad('Zaplanowaną aktywność zamknij przyciskiem „Zrobione”.');
      set.result = r;
    }
    const keys = Object.keys(set);
    if (keys.length) {
      await this.q.run(`UPDATE crm.activities SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
        [...keys.map((k) => set[k]), id]);
    }
    return this.leadCard(a.lead_id);
  }

  async deleteActivity(id: number) {
    const a = await this.activityRow(id);
    await this.q.run('DELETE FROM crm.activities WHERE id = ?', [id]);
    return this.leadCard(a.lead_id);
  }

  /** Planned activities (open to-dos) with the company attached, plus recently finished ones. */
  async activities(opts: { from?: string; to?: string; open?: boolean }) {
    const where: string[] = [`a.result <> 'cancelled'`];
    const p: unknown[] = [];
    if (opts.open) where.push(`a.result = 'planned'`);
    if (opts.from) { where.push('a.date >= ?'); p.push(this.checkDate(opts.from)); }
    if (opts.to) { where.push('a.date <= ?'); p.push(this.checkDate(opts.to)); }
    const rows = await this.q.all(`SELECT a.*, l.company, l.phone, l.email, l.stage, l.city, l.segment
      FROM crm.activities a JOIN crm.leads l ON l.id = a.lead_id
      WHERE ${where.join(' AND ')} ORDER BY a.date, a.id LIMIT 2000`, p);
    return rows.map((r) => ({ ...this.toActivity(r), phone: r.phone, email: r.email, stage: r.stage, city: r.city, segment: r.segment }));
  }

  /** Everything between two dates, for the calendar. */
  async agenda(from: string, to: string) {
    this.checkDate(from); this.checkDate(to);
    const acts = (await this.q.all(`SELECT a.*, l.company FROM crm.activities a JOIN crm.leads l ON l.id = a.lead_id
      WHERE a.date BETWEEN ? AND ? AND a.result <> 'cancelled'
      ORDER BY a.date, a.id`, [from, to])).map((r) => this.toActivity(r));
    const events = (await this.q.all('SELECT * FROM crm.events WHERE date BETWEEN ? AND ? ORDER BY date, time', [from, to]))
      .map((e) => this.toEvent(e));
    const tasks = (await this.q.all(TASK_SQL + ' WHERE t.due BETWEEN ? AND ? ORDER BY t.due', [from, to]))
      .map((t) => this.toTask(t));
    return { activities: acts, events, tasks };
  }

  /** The home screen: what is overdue, what is today, who to call next and how the week goes. */
  async dashboard() {
    const t = this.today();
    const [planned, leads, tasks, events, done, week] = await Promise.all([
      this.activities({ open: true, to: addDays(t, 7) }),
      this.listLeads(),
      this.q.all(TASK_SQL + ` WHERE (t.status <> 'done' AND t.due <> '' AND t.due <= ?) OR (t.status = 'done' AND t.completed = ?)
        ORDER BY t.due`, [addDays(t, 7), t]),
      this.q.all(`SELECT * FROM crm.events WHERE date BETWEEN ? AND ? AND status <> 'cancelled' ORDER BY date, time`,
        [t, addDays(t, 30)]),
      this.q.get(`SELECT COUNT(*) AS n, COUNT(DISTINCT lead_id) AS c FROM crm.activities
        WHERE date = ? AND result IN ('reached','done','no answer') AND type <> 'Note'`, [t]),
      this.q.get(`SELECT COUNT(*) AS n, COUNT(DISTINCT lead_id) AS c FROM crm.activities
        WHERE date BETWEEN ? AND ? AND result IN ('reached','done','no answer') AND type <> 'Note'`, [addDays(t, -6), t]),
    ]);

    const queue = leads
      .filter((l) => l.stage === 'new' && l.openCount === 0 && (l.phone || l.email))
      .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
      .slice(0, 12);
    const pipeline: Record<string, number> = Object.fromEntries(STAGES.map((s) => [s, 0]));
    for (const l of leads) pipeline[l.stage] = (pipeline[l.stage] || 0) + 1;

    return {
      today: t,
      overdue: planned.filter((r) => r.date < t),
      due: planned.filter((r) => r.date === t),
      upcoming: planned.filter((r) => r.date > t),
      queue,
      pipeline,
      tasks: tasks.map((r) => this.toTask(r)).filter((x) => x.status !== 'done'),
      tasksDoneToday: tasks.filter((r) => r.status === 'done').length,
      events: events.map((e) => this.toEvent(e)),
      doneToday: { activities: Number(done!.n), companies: Number(done!.c) },
      doneWeek: { activities: Number(week!.n), companies: Number(week!.c) },
    };
  }

  /* ============================================================= stats */

  async stats() {
    const t = this.today();
    const w = addDays(t, -6);
    const m = addDays(t, -29);
    const rows = await this.q.all(`SELECT date, type, lead_id, result, stage_to FROM crm.activities
      WHERE date >= ? AND date <= ? AND result NOT IN ('planned','cancelled')`, [m, t]);

    const blank = () => ({ total: 0, byType: {} as Record<string, number>, companies: new Set<string>(),
      reached: 0, noAnswer: 0, moves: 0 });
    const b = { today: blank(), week: blank(), month: blank() };
    const daily: Record<string, Record<string, number>> = {};
    for (let i = 0; i < 30; i++) daily[addDays(m, i)] = {};

    for (const r of rows) {
      const targets = [b.month];
      if (r.date >= w) targets.push(b.week);
      if (r.date === t) targets.push(b.today);
      if (r.stage_to) for (const k of targets) k.moves++;
      if (!(COUNTED as string[]).includes(r.type)) continue;
      if (daily[r.date]) daily[r.date][r.type] = (daily[r.date][r.type] || 0) + 1;
      for (const k of targets) {
        k.total++;
        k.byType[r.type] = (k.byType[r.type] || 0) + 1;
        k.companies.add(r.lead_id);
        if (r.result === 'reached') k.reached++;
        if (r.result === 'no answer') k.noAnswer++;
      }
    }
    const pack = (k: ReturnType<typeof blank>) => ({
      total: k.total, byType: k.byType, companies: k.companies.size,
      reached: k.reached, noAnswer: k.noAnswer, moves: k.moves,
    });

    const leads = await this.listLeads();
    const pipeline: Record<string, number> = Object.fromEntries(STAGES.map((s) => [s, 0]));
    const segments: Record<string, Record<string, number>> = {};
    let overdue = 0, queue = 0, noContact = 0;
    for (const l of leads) {
      pipeline[l.stage] = (pipeline[l.stage] || 0) + 1;
      const s = (segments[l.segment] ||= { total: 0, withPhone: 0, ...Object.fromEntries(STAGES.map((x) => [x, 0])) });
      s.total++; s[l.stage] = (s[l.stage] || 0) + 1;
      if (l.phone) s.withPhone++;
      if (l.nextContact && l.nextContact < t) overdue++;
      if (l.stage === 'new' && l.priority >= 5) queue++;
      if (!l.phone && !l.email) noContact++;
    }

    return {
      today: t,
      activity: { today: pack(b.today), week: pack(b.week), month: pack(b.month) },
      daily: Object.entries(daily).map(([date, byType]) => ({ date, byType })),
      pipeline,
      segments: Object.entries(segments).map(([name, v]) => ({ name, ...v }))
        .sort((a, b2) => (b2 as Row).total - (a as Row).total),
      totals: { leads: leads.length, overdue, queue, noContact },
    };
  }

  async report(from?: string, to?: string): Promise<{ from: string; to: string; text: string }> {
    const b = to ? this.checkDate(to) : this.today();
    const a = from ? this.checkDate(from) : addDays(b, -6);
    if (a > b) throw bad('Data początkowa jest po końcowej.');
    const [acts, leads, events, tasks] = await Promise.all([
      this.q.all(`SELECT a.*, l.company FROM crm.activities a JOIN crm.leads l ON l.id = a.lead_id
        WHERE a.date BETWEEN ? AND ? OR (a.result = 'planned' AND a.date >= ?)`, [a, b, this.today()]),
      this.listLeads(), this.listEvents(), this.listTasks(),
    ]);
    const text = buildReport({
      from: a, to: b, today: this.today(), owner: this.owner,
      leads, activities: acts.map((r) => this.toActivity(r)), events, tasks,
    });
    return { from: a, to: b, text };
  }

  /* ============================================================ events */

  private toEvent(r: Row): CrmEvent {
    return {
      id: r.id, title: r.title, type: r.type, date: r.date, time: r.time, leadId: r.lead_id,
      company: r.company, location: r.location, status: r.status, owner: r.owner, cost: r.cost,
      notes: r.notes, createdAt: r.created_at,
      ...(r.open_tasks !== undefined ? { openTasks: Number(r.open_tasks), totalTasks: Number(r.total_tasks) } : {}),
    };
  }

  async listEvents(): Promise<CrmEvent[]> {
    return (await this.q.all(`SELECT e.*,
        (SELECT COUNT(*) FROM crm.tasks t WHERE t.event_id = e.id AND t.status <> 'done') AS open_tasks,
        (SELECT COUNT(*) FROM crm.tasks t WHERE t.event_id = e.id) AS total_tasks
      FROM crm.events e ORDER BY e.date, e.time`)).map((r) => this.toEvent(r));
  }

  private async nextCode(table: 'events' | 'tasks', prefix: string): Promise<string> {
    const r = await this.q.get(`SELECT COALESCE(MAX(CAST(substring(id FROM '[0-9]+') AS INTEGER)), 0) AS n
      FROM crm.${table} WHERE id ~ '[0-9]'`);
    return `${prefix}-${String(Number(r!.n) + 1).padStart(4, '0')}`;
  }

  async saveEvent(d: Partial<CrmEvent>): Promise<CrmEvent> {
    const title = txt(d.title);
    if (!title) throw bad('Podaj nazwę wydarzenia.');
    const date = this.checkDate(d.date, 'data wydarzenia');
    const status = txt(d.status) || 'planned';
    if (!(EVENT_STATUS as readonly string[]).includes(status)) throw bad(`Nieznany status: ${status}`);
    let company = txt(d.company);
    const leadId = txt(d.leadId);
    if (leadId) {
      const l = await this.leadRow(leadId);
      if (!company) company = l.company;
    }
    const v = [title, txt(d.type) || 'Other', date, txt(d.time), leadId, company, txt(d.location), status,
      txt(d.owner) || this.owner, txt(d.cost), longTxt(d.notes)];
    const id = txt(d.id);
    if (id) {
      const n = await this.q.run(`UPDATE crm.events SET title=?, type=?, date=?, time=?, lead_id=?, company=?,
        location=?, status=?, owner=?, cost=?, notes=? WHERE id = ?`, [...v, id]);
      if (!n) throw notFound(`Nie ma wydarzenia ${id}.`);
      return (await this.listEvents()).find((e) => e.id === id)!;
    }
    const newId = await this.tx(async (c) => {
      const nid = await c.nextCode('events', 'EV');
      await c.q.run(`INSERT INTO crm.events (title, type, date, time, lead_id, company, location, status, owner,
        cost, notes, id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [...v, nid, c.today()]);
      return nid;
    });
    return (await this.listEvents()).find((e) => e.id === newId)!;
  }

  async deleteEvent(id: string) {
    await this.tx(async (c) => {
      const n = await c.q.run('DELETE FROM crm.events WHERE id = ?', [id]);
      if (!n) throw notFound(`Nie ma wydarzenia ${id}.`);
      await c.q.run('DELETE FROM crm.tasks WHERE event_id = ?', [id]);
      await c.q.run('DELETE FROM crm.event_people WHERE event_id = ?', [id]);
    });
    return { ok: true };
  }

  /* ============================================================= people */

  private toPerson(r: Row, events: PersonEvent[] = []): Person {
    return {
      id: Number(r.id), name: r.name, role: r.role, email: r.email, phone: r.phone, aliases: r.aliases,
      notes: r.notes, contacts: Number(r.contacts) || 0, lastContact: r.last_contact,
      kind: r.kind === 'external' ? 'external' : 'team', company: r.company || '', leadId: r.lead_id || '', services: r.services || '',
      scope: r.scope || '', doneCount: Number(r.done_count) || 0,
      events, partner: r.lead_stage === 'active',
    };
  }

  private async personEvents(id?: number): Promise<Map<number, PersonEvent[]>> {
    const rows = await this.q.all(`SELECT ep.person_id, ep.event_id, ep.role, e.title, e.date FROM crm.event_people ep
      JOIN crm.events e ON e.id = ep.event_id ${id ? 'WHERE ep.person_id = ?' : ''} ORDER BY e.date DESC`, id ? [id] : []);
    const m = new Map<number, PersonEvent[]>();
    for (const r of rows) {
      const k = Number(r.person_id);
      m.set(k, [...(m.get(k) || []), { eventId: r.event_id, title: r.title, date: r.date, role: r.role }]);
    }
    return m;
  }

  /**
   * Every active partner has someone in the network: their contact person joins on their own the moment the
   * firm turns active (or an existing person from that firm gets linked to it). Idempotent — runs on every read.
   */
  async syncPartners() {
    const missing = await this.q.all(`SELECT l.* FROM crm.leads l WHERE l.stage = 'active'
      AND NOT EXISTS (SELECT 1 FROM crm.people p WHERE p.lead_id = l.id)`);
    if (!missing.length) return;
    const people = await this.q.all(`SELECT id, company, name, role FROM crm.people WHERE lead_id = ''`);
    for (const l of missing) {
      // someone already saved from that firm — by its company field, or "Marcin (Event 360)" in the name or role
      const key = companyKey(l.company);
      const firm = searchKey(l.company);
      const same = people.find((p) => (p.company && companyKey(p.company) === key) ||
        (!p.company && firm.length >= 4 && searchKey(`${p.name} ${p.role}`).includes(firm)));
      if (same) {
        await this.q.run(`UPDATE crm.people SET lead_id = ?, kind = 'external', company = CASE WHEN company = '' THEN ? ELSE company END WHERE id = ?`,
          [l.id, l.company, same.id]);
        people.splice(people.indexOf(same), 1);
        continue;
      }
      await this.q.run(`INSERT INTO crm.people (name, role, email, phone, aliases, notes, kind, company, services, lead_id, created_at)
        VALUES (?, ?, ?, ?, '', ?, 'external', ?, ?, ?, ?)`,
        [l.person || l.company, l.person ? `Kontakt — partner ${l.company}` : 'Partner (firma)', l.email, l.phone,
          'Dodany automatycznie, gdy firma została aktywnym partnerem.', l.company, l.industry, l.id, nowIso()]);
    }
  }

  private static PEOPLE_SQL = `SELECT p.*, l.stage AS lead_stage,
    (SELECT COUNT(*) FROM crm.tasks t WHERE t.person_id = p.id AND t.status = 'done') AS done_count
    FROM crm.people p LEFT JOIN crm.leads l ON l.id = p.lead_id AND p.lead_id <> ''`;

  /** Most contacted first: the people the user deals with every week float to the top. */
  async listPeople(): Promise<Person[]> {
    await this.syncPartners();
    const ev = await this.personEvents();
    return (await this.q.all(`${Crm.PEOPLE_SQL} ORDER BY p.contacts DESC, p.name`)).map((r) => this.toPerson(r, ev.get(Number(r.id))));
  }

  async getPerson(id: number): Promise<Person> {
    const r = await this.q.get(`${Crm.PEOPLE_SQL} WHERE p.id = ?`, [id]);
    if (!r) throw notFound(`Nie ma osoby ${id} w zespole.`);
    return this.toPerson(r, (await this.personEvents(id)).get(id));
  }

  /** Puts someone on an event with what they do there (animacje, ławy i stoły…); again = new role. */
  async linkPersonEvent(eventId: string, personId: number, role = '') {
    await this.getPerson(personId);
    if (!(await this.q.get('SELECT id FROM crm.events WHERE id = ?', [eventId]))) throw notFound(`Nie ma wydarzenia ${eventId}.`);
    await this.q.run(`INSERT INTO crm.event_people (event_id, person_id, role, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (event_id, person_id) DO UPDATE SET role = CASE WHEN EXCLUDED.role = '' THEN crm.event_people.role ELSE EXCLUDED.role END`,
      [eventId, personId, txt(role), nowIso()]);
    return this.eventPeople(eventId);
  }

  async unlinkPersonEvent(eventId: string, personId: number) {
    await this.q.run('DELETE FROM crm.event_people WHERE event_id = ? AND person_id = ?', [eventId, personId]);
    return this.eventPeople(eventId);
  }

  async eventPeople(eventId: string): Promise<EventPerson[]> {
    const rows = await this.q.all(`SELECT p.id, p.name, p.company, p.phone, p.email, ep.role FROM crm.event_people ep
      JOIN crm.people p ON p.id = ep.person_id WHERE ep.event_id = ? ORDER BY p.name`, [eventId]);
    return rows.map((r) => ({ personId: Number(r.id), name: r.name, role: r.role, company: r.company, phone: r.phone, email: r.email }));
  }

  /**
   * Who can help with a need ("animacje", "druk z logo", "namiot"): people and companies ranked by how well
   * their services, role, notes and past events match — the user's own network first.
   */
  async findHelp(query: string) {
    // Polish words bend ("wydrukować" ↔ "druk", "logotypem" ↔ "logo"): compare word stems both ways
    const stem = (w: string) => w.slice(0, Math.max(4, w.length - 2));
    const tokens = (t: string) => searchKey(t).split(/[^a-z0-9]+/).filter((w) => w.length > 3);
    const words = tokens(query);
    if (!words.length) return { people: [], companies: [] };
    const hit = (q: string, t: string) => t.includes(stem(q)) || q.includes(stem(t));
    const score = (fields: [string, number][]) => {
      let s = 0;
      for (const [text, weight] of fields) { const ts = tokens(text); for (const q of words) if (ts.some((t) => hit(q, t))) s += weight; }
      return s;
    };
    // what they actually finished counts too — skills show in the work before anyone writes them down
    const history = new Map<number, string[]>();
    for (const r of await this.q.all(`SELECT person_id, task FROM crm.tasks WHERE status = 'done' AND person_id <> 0`)) {
      history.set(Number(r.person_id), [...(history.get(Number(r.person_id)) || []), r.task]);
    }
    const people = (await this.listPeople()).map((p) => ({ p, done: history.get(p.id) || [], s: score([[p.services, 4], [p.scope, 3], [p.role, 3], [p.company, 2],
      [p.notes, 1], [p.events.map((e) => `${e.role} ${e.title}`).join(' '), 2], [(history.get(p.id) || []).join(' '), 2]]) }))
      .filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 8);
    const companies = (await this.listLeads()).map((l) => ({ l, s: score([[l.company, 3], [l.industry, 3], [l.segment, 2], [l.notes, 1], [l.extra, 1]]) }))
      .filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 6);
    return {
      people: people.map(({ p, done }) => ({ id: String(p.id), name: p.name, kind: p.kind, active_partner: p.partner || undefined, role: p.role, company: p.company || undefined,
        scope: p.scope || undefined, done_tasks: done.length || undefined,
        similar_done: done.filter((t) => words.some((q) => tokens(t).some((w) => hit(q, w)))).slice(0, 3),
        services: p.services || undefined, phone: p.phone || undefined, email: p.email || undefined,
        past_events: p.events.slice(0, 4).map((e) => `${e.title} (${e.date})${e.role ? ` — ${e.role}` : ''}`) })),
      companies: companies.map(({ l }) => ({ id: l.id, company: l.company, industry: l.industry || undefined, segment: l.segment || undefined,
        stage: l.stage, city: l.city || undefined, person: l.person || undefined, phone: l.phone || undefined })),
    };
  }

  async savePerson(d: Partial<Person>): Promise<Person> {
    const name = txt(d.name);
    const id = Number(d.id) || 0;
    const cur = id ? await this.getPerson(id) : null;
    const v = {
      name: name || cur?.name || '', role: txt(d.role ?? cur?.role), email: normEmail(d.email ?? cur?.email ?? ''),
      phone: txt(d.phone ?? cur?.phone), aliases: txt(d.aliases ?? cur?.aliases), notes: longTxt(d.notes ?? cur?.notes),
      kind: (d.kind ?? cur?.kind) === 'external' ? 'external' : 'team', company: txt(d.company ?? cur?.company),
      services: txt(d.services ?? cur?.services), leadId: txt(d.leadId ?? cur?.leadId), scope: longTxt(d.scope ?? cur?.scope),
    };
    if (!v.name) throw bad('Podaj imię i nazwisko.');
    if (v.leadId && !(await this.q.get('SELECT id FROM crm.leads WHERE id = ?', [v.leadId]))) throw bad(`Nie ma firmy ${v.leadId}.`);
    const cols = [v.name, v.role, v.email, v.phone, v.aliases, v.notes, v.kind, v.company, v.services, v.leadId, v.scope];
    if (cur) {
      await this.q.run('UPDATE crm.people SET name=?, role=?, email=?, phone=?, aliases=?, notes=?, kind=?, company=?, services=?, lead_id=?, scope=? WHERE id = ?',
        [...cols, id]);
      return this.getPerson(id);
    }
    const r = await this.q.get(`INSERT INTO crm.people (name, role, email, phone, aliases, notes, kind, company, services, lead_id, scope, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`, [...cols, nowIso()]);
    return this.getPerson(Number(r!.id));
  }

  async deletePerson(id: number) {
    if (!(await this.q.run('DELETE FROM crm.people WHERE id = ?', [id]))) throw notFound(`Nie ma osoby ${id}.`);
    await this.q.run('UPDATE crm.tasks SET person_id = 0 WHERE person_id = ?', [id]);
    await this.q.run('DELETE FROM crm.event_people WHERE person_id = ?', [id]);
    return { ok: true };
  }

  /** Counts a message or finished task for someone, so frequent contacts come first. */
  async touchPerson(id: number) {
    await this.q.run('UPDATE crm.people SET contacts = contacts + 1, last_contact = ? WHERE id = ?', [this.today(), id]);
    return this.getPerson(id);
  }

  /* ============================================================= tasks */

  private toTask(r: Row): Task {
    return {
      id: r.id, eventId: r.event_id, task: r.task, owner: r.owner, due: r.due, status: r.status,
      notes: r.notes, completed: r.completed, leadId: r.lead_id || '',
      materials: parseMaterials(r.materials), attachments: parseIds(r.attachments),
      personId: Number(r.person_id) || 0,
      ...(r.person_name ? { person: { name: r.person_name, role: r.person_role || '', email: r.person_email || '', phone: r.person_phone || '' } } : {}),
      ...(r.event_title !== undefined ? { eventTitle: r.event_title || '', eventDate: r.event_date || '' } : {}),
      ...(r.company ? { company: r.company } : {}),
      runId: Number(r.run_id) || 0, step: Number(r.step) || 0, blocked: r.blocked || '', started: r.started || '', created: r.created || '',
      ...(r.run_title ? { run: { title: r.run_title, process: r.run_process || '', steps: Number(r.run_steps) || 0 } } : {}),
    };
  }

  /**
   * Procedures are kept to: a step can be finished only after the ones before it. Finishing a step starts the
   * next one (its clock and due date) and the last one closes the run.
   */
  private async guardStep(cur: Row) {
    const runId = Number(cur.run_id);
    if (!runId) return;
    const before = await this.q.get(`SELECT t.step, t.task, p.name FROM crm.tasks t LEFT JOIN crm.people p ON p.id = t.person_id
      WHERE t.run_id = ? AND t.step < ? AND t.status <> 'done' ORDER BY t.step LIMIT 1`, [runId, Number(cur.step)]);
    if (before) {
      throw bad(`To krok ${cur.step} procesu — najpierw musi być zrobiony krok ${before.step}: „${before.task}”${before.name ? ` (${before.name})` : ''}.`);
    }
  }

  private async advanceRun(runId: number) {
    if (!runId) return;
    const next = await this.q.get(`SELECT id, due, started, step_days FROM crm.tasks WHERE run_id = ? AND status <> 'done' ORDER BY step LIMIT 1`, [runId]);
    if (!next) {
      await this.q.run(`UPDATE crm.process_runs SET status = 'done', finished = ? WHERE id = ? AND status = 'active'`, [this.today(), runId]);
      return;
    }
    await this.q.run(`UPDATE crm.process_runs SET status = 'active', finished = '' WHERE id = ? AND status = 'done'`, [runId]);
    if (next.started) return;
    const days = Number(next.step_days) || 0;
    await this.q.run(`UPDATE crm.tasks SET started = ?, due = CASE WHEN due = '' THEN ? ELSE due END WHERE id = ?`,
      [this.today(), days ? addDays(this.today(), days) : '', next.id]);
  }

  async listTasks(): Promise<Task[]> {
    return (await this.q.all(TASK_SQL + ` ORDER BY CASE WHEN t.due = '' THEN 1 ELSE 0 END, t.due, t.id`))
      .map((r) => this.toTask(r));
  }

  private async taskById(id: string): Promise<Task> {
    return this.toTask((await this.q.get(TASK_SQL + ' WHERE t.id = ?', [id]))!);
  }

  /**
   * Create or update a task. Omitted fields keep their current value, so the assistant
   * can e.g. only move the due date or only add materials.
   */
  async saveTask(d: Partial<Task>): Promise<Task> {
    const id = txt(d.id);
    const cur = id ? await this.q.get('SELECT * FROM crm.tasks WHERE id = ?', [id]) : undefined;
    if (id && !cur) throw notFound(`Nie ma zadania ${id}.`);
    const pick = <T>(v: T | undefined, fallback: T) => (v === undefined ? fallback : v);

    const task = longTxt(pick(d.task, cur?.task ?? ''));
    if (!task) throw bad('Opisz zadanie.');
    const status = txt(pick(d.status, cur?.status ?? 'todo')) || 'todo';
    if (!(TASK_STATUS as readonly string[]).includes(status)) throw bad(`Nieznany status: ${status}`);
    const dueRaw = txt(pick(d.due, cur?.due ?? ''));
    const due = dueRaw ? this.checkDate(dueRaw, 'data') : '';
    const eventId = txt(pick(d.eventId, cur?.event_id ?? ''));
    if (eventId && !(await this.q.get('SELECT 1 FROM crm.events WHERE id = ?', [eventId]))) {
      throw notFound(`Nie ma wydarzenia ${eventId}.`);
    }
    const leadId = txt(pick(d.leadId, cur?.lead_id ?? ''));
    if (leadId) await this.leadRow(leadId);
    const materials = d.materials !== undefined
      ? JSON.stringify(d.materials.filter((m) => m && (m.title || m.body)).map(cleanMaterial))
      : (cur?.materials ?? '');
    const attachments = d.attachments !== undefined ? d.attachments.map(Number).filter((n) => n > 0).join(',') : (cur?.attachments ?? '');
    const owner = txt(pick(d.owner, cur?.owner ?? '')) || this.owner;
    const notes = longTxt(pick(d.notes, cur?.notes ?? ''));
    const personId = Number(pick(d.personId, Number(cur?.person_id) || 0)) || 0;
    if (personId) await this.getPerson(personId);
    const blocked = status === 'done' ? '' : longTxt(pick(d.blocked, cur?.blocked ?? ''));

    if (cur) {
      if (status === 'done' && cur.status !== 'done') await this.guardStep(cur);
      const completed = status === 'done' ? (cur.completed || this.today()) : '';
      await this.q.run(`UPDATE crm.tasks SET event_id=?, lead_id=?, task=?, owner=?, due=?, status=?, notes=?, completed=?,
        materials=?, attachments=?, person_id=?, blocked=? WHERE id = ?`,
        [eventId, leadId, task, owner, due, status, notes, completed, materials, attachments, personId, blocked, id]);
      if (status === 'done' && cur.status !== 'done' && personId) await this.touchPerson(personId);
      if ((status === 'done') !== (cur.status === 'done')) await this.advanceRun(Number(cur.run_id));
      return this.taskById(id);
    }
    const newId = await this.tx(async (c) => {
      const nid = await c.nextCode('tasks', 'TS');
      await c.q.run(`INSERT INTO crm.tasks (id, event_id, lead_id, task, owner, due, status, notes, completed, materials, attachments, person_id, created)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [nid, eventId, leadId, task, owner, due, status, notes,
        status === 'done' ? (isIsoDay(d.completed) ? d.completed : c.today()) : '', materials, attachments, personId, c.today()]);
      return nid;
    });
    return this.taskById(newId);
  }

  async toggleTask(id: string): Promise<Task> {
    const cur = await this.q.get('SELECT * FROM crm.tasks WHERE id = ?', [id]);
    if (!cur) throw notFound(`Nie ma zadania ${id}.`);
    const next = cur.status === 'done' ? 'todo' : 'done';
    if (next === 'done') await this.guardStep(cur);
    await this.q.run(`UPDATE crm.tasks SET status = ?, completed = ?, blocked = CASE WHEN ? = 'done' THEN '' ELSE blocked END WHERE id = ?`,
      [next, next === 'done' ? this.today() : '', next, id]);
    if (next === 'done' && Number(cur.person_id)) await this.touchPerson(Number(cur.person_id));
    await this.advanceRun(Number(cur.run_id));
    return this.taskById(id);
  }

  async deleteTask(id: string) {
    const n = await this.q.run('DELETE FROM crm.tasks WHERE id = ?', [id]);
    if (!n) throw notFound(`Nie ma zadania ${id}.`);
    return { ok: true };
  }

  /* ====================================================== playbook etc */

  private toSegment(r: Row): Segment {
    return {
      name: r.name, weight: Number(r.weight), goal: r.goal, who: r.who, opening: r.opening, hook: r.hook,
      offer: r.offer, cta: r.cta, objections: r.objections, why: r.why, sort: Number(r.sort),
    };
  }

  async listSegments(): Promise<(Segment & { leads: number })[]> {
    return (await this.q.all(`SELECT s.*, (SELECT COUNT(*) FROM crm.leads l WHERE l.segment = s.name) AS leads
      FROM crm.segments s ORDER BY s.sort, s.name`)).map((r) => ({ ...this.toSegment(r), leads: Number(r.leads) }));
  }

  /** Create or update a segment. Renaming moves every lead with it. */
  async saveSegment(d: Partial<Segment> & { originalName?: string }) {
    const name = txt(d.name);
    if (!name) throw bad('Podaj nazwę segmentu.');
    const weight = Number(d.weight);
    if (!Number.isFinite(weight) || weight < 0 || weight > 10) throw bad('Waga to liczba od 0 do 10.');
    const original = txt(d.originalName);
    const fields = [weight, longTxt(d.goal), longTxt(d.who), longTxt(d.opening), longTxt(d.hook),
      longTxt(d.offer), longTxt(d.cta), longTxt(d.objections), longTxt(d.why)];
    await this.tx(async (c) => {
      if (original) {
        if (!(await c.q.get('SELECT 1 FROM crm.segments WHERE name = ?', [original]))) {
          throw notFound(`Nie ma segmentu ${original}.`);
        }
        if (name !== original && await c.q.get('SELECT 1 FROM crm.segments WHERE name = ?', [name])) {
          throw conflict(`Segment „${name}” już istnieje.`);
        }
        await c.q.run(`UPDATE crm.segments SET name=?, weight=?, goal=?, who=?, opening=?, hook=?, offer=?, cta=?,
          objections=?, why=? WHERE name = ?`, [name, ...fields, original]);
        if (name !== original) await c.q.run('UPDATE crm.leads SET segment = ? WHERE segment = ?', [name, original]);
      } else {
        if (await c.q.get('SELECT 1 FROM crm.segments WHERE lower(name) = lower(?)', [name])) {
          throw conflict(`Segment „${name}” już istnieje.`);
        }
        const sort = Number((await c.q.get('SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM crm.segments'))!.n);
        await c.q.run(`INSERT INTO crm.segments (name, weight, goal, who, opening, hook, offer, cta, objections, why, sort)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [name, ...fields, sort]);
      }
    });
    return (await this.listSegments()).find((s) => s.name === name)!;
  }

  async deleteSegment(name: string) {
    const n = Number((await this.q.get('SELECT COUNT(*) AS n FROM crm.leads WHERE segment = ?', [name]))!.n);
    if (n) throw conflict(`${n} firm nadal ma segment „${name}”. Przenieś je najpierw.`);
    if (!(await this.q.run('DELETE FROM crm.segments WHERE name = ?', [name]))) throw notFound(`Nie ma segmentu ${name}.`);
    return { ok: true };
  }

  async listTemplates(): Promise<Template[]> {
    return this.q.all<Template>('SELECT * FROM crm.templates ORDER BY length(code), code');
  }

  async saveTemplate(d: Partial<Template> & { originalCode?: string }) {
    const code = txt(d.code).toUpperCase();
    if (!code) throw bad('Podaj kod szablonu.');
    const v = [txt(d.kind), txt(d.segments), txt(d.subject), longTxt(d.body)];
    const original = txt(d.originalCode);
    if (original) {
      if (code !== original && await this.q.get('SELECT 1 FROM crm.templates WHERE code = ?', [code])) {
        throw conflict(`Szablon ${code} już istnieje.`);
      }
      const n = await this.q.run('UPDATE crm.templates SET code=?, kind=?, segments=?, subject=?, body=? WHERE code=?',
        [code, ...v, original]);
      if (!n) throw notFound(`Nie ma szablonu ${original}.`);
    } else {
      if (await this.q.get('SELECT 1 FROM crm.templates WHERE code = ?', [code])) throw conflict(`Szablon ${code} już istnieje.`);
      await this.q.run('INSERT INTO crm.templates (code, kind, segments, subject, body) VALUES (?, ?, ?, ?, ?)', [code, ...v]);
    }
    return (await this.listTemplates()).find((t) => t.code === code)!;
  }

  async deleteTemplate(code: string) {
    if (!(await this.q.run('DELETE FROM crm.templates WHERE code = ?', [code]))) throw notFound(`Nie ma szablonu ${code}.`);
    return { ok: true };
  }

  async renderTemplate(leadId: string, code: string) {
    const lead = await this.getLead(leadId);
    const t = await this.q.get('SELECT * FROM crm.templates WHERE code = ?', [code]);
    if (!t) throw notFound(`Nie ma szablonu ${code}.`);
    return { subject: fillTemplate(t.subject, lead), body: fillTemplate(t.body, lead), email: lead.email };
  }

  /* ============================================================ hygiene */

  /** Groups of leads whose names compare equal once legal forms and punctuation are ignored. */
  async duplicates() {
    const rows = await this.q.all(`SELECT id, company, city, phone, email, stage, company_key FROM crm.leads
      WHERE company_key IN (SELECT company_key FROM crm.leads WHERE company_key <> ''
        GROUP BY company_key HAVING COUNT(*) > 1)
      ORDER BY company_key, id`);
    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      const k = r.company_key;
      delete r.company_key;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }
    return [...groups.values()];
  }

  /** How the assistant writes: general instructions, B2B emails, and relaxed messages (parents, teachers). */
  async setting(key: string): Promise<string> {
    return (await this.q.get('SELECT value FROM crm.settings WHERE key = ?', [key]))?.value || '';
  }

  async setSetting(key: string, value: string) {
    await this.q.run(`INSERT INTO crm.settings (key, value) VALUES (?, ?)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [key, value]);
  }

  async style(): Promise<Style> {
    const rows = await this.q.all(`SELECT key, value FROM crm.settings WHERE key IN ('style.project', 'style.b2b', 'style.casual')`);
    const v = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return { project: v['style.project'] || '', b2b: v['style.b2b'] || '', casual: v['style.casual'] || '' };
  }

  async saveStyle(d: Partial<Style>): Promise<Style> {
    for (const k of ['project', 'b2b', 'casual'] as const) {
      if (d[k] === undefined) continue;
      await this.q.run(`INSERT INTO crm.settings (key, value) VALUES (?, ?)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [`style.${k}`, longTxt(d[k]).slice(0, 60_000)]);
    }
    return this.style();
  }

  async config() {
    const [segments, templates] = await Promise.all([this.listSegments(), this.listTemplates()]);
    return {
      owner: this.owner, today: this.today(), stages: STAGES, stageLabels: STAGE_LABEL, types: TYPES, results: RESULTS,
      counted: COUNTED, eventStatus: EVENT_STATUS, taskStatus: TASK_STATUS, segments, templates,
    };
  }
}
