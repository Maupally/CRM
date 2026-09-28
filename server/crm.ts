import type { DB } from './db.ts';
import { tx, nowIso } from './db.ts';
import {
  STAGES, TYPES, RESULTS, COUNTED, CLOSED_STAGES, EVENT_STATUS, TASK_STATUS, DEFAULT_SEGMENT,
  type Stage, type Lead, type Activity, type Segment, type Template, type CrmEvent, type Task,
  txt, longTxt, normPhone, normEmail, normUrl, companyKey, isIsoDay, addDays, priority, autoStage,
  fillTemplate, isoDay,
} from '../shared/domain.ts';
import { buildReport } from './report.ts';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const bad = (msg: string) => new HttpError(400, msg);
const notFound = (msg: string) => new HttpError(404, msg);

type Row = Record<string, any>;

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

const LEAD_SQL = `
SELECT l.*,
  (SELECT MIN(a.date) FROM activities a WHERE a.lead_id = l.id AND a.result = 'planned') AS next_contact,
  (SELECT a.type FROM activities a WHERE a.lead_id = l.id AND a.result = 'planned'
     ORDER BY a.date, a.id LIMIT 1) AS next_type,
  (SELECT COUNT(*) FROM activities a WHERE a.lead_id = l.id AND a.result = 'planned') AS open_count,
  (SELECT MAX(a.date) FROM activities a WHERE a.lead_id = l.id
     AND a.result IN ('reached', 'done') AND a.type <> 'Note') AS last_logged
FROM leads l`;

export class Crm {
  constructor(
    public db: DB,
    public owner = 'Martin',
    public today: () => string = () => isoDay(),
  ) {}

  /* ============================================================ helpers */

  private segmentMap(): Map<string, Row> {
    const m = new Map<string, Row>();
    for (const s of this.db.prepare('SELECT name, weight, why FROM segments').all() as Row[]) m.set(s.name, s);
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

  private leadRow(id: string): Row {
    const r = this.db.prepare('SELECT * FROM leads WHERE id = ?').get(id) as Row | undefined;
    if (!r) throw notFound(`Lead ${id} not found.`);
    return r;
  }

  private toActivity(r: Row): Activity {
    return {
      id: Number(r.id), leadId: r.lead_id, date: r.date, type: r.type, note: r.note, owner: r.owner,
      result: r.result, stageFrom: r.stage_from, stageTo: r.stage_to, createdAt: r.created_at,
      ...(r.company !== undefined ? { company: r.company } : {}),
    };
  }

  private activityRow(id: number): Row {
    const r = this.db.prepare('SELECT * FROM activities WHERE id = ?').get(id) as Row | undefined;
    if (!r) throw notFound(`Activity ${id} not found.`);
    return r;
  }

  private checkStage(s: string): Stage {
    if (!(STAGES as readonly string[]).includes(s)) throw bad(`Unknown stage: ${s}`);
    return s as Stage;
  }

  private checkType(t: string): string {
    if (!(TYPES as readonly string[]).includes(t)) throw bad(`Unknown activity type: ${t}`);
    return t;
  }

  private checkResult(r: string): string {
    if (!(RESULTS as readonly string[]).includes(r)) throw bad(`Unknown result: ${r}`);
    return r;
  }

  private checkDate(d: unknown, label = 'date'): string {
    if (!isIsoDay(d)) throw bad(`Bad ${label}: ${String(d)}`);
    return d;
  }

  private insertActivity(a: {
    leadId: string; date: string; type: string; note: string; result: string;
    stageFrom?: string; stageTo?: string;
  }): number {
    const res = this.db.prepare(`INSERT INTO activities
      (lead_id, date, type, note, owner, result, stage_from, stage_to, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      a.leadId, a.date, a.type, a.note, this.owner, a.result,
      a.stageFrom || '', a.stageTo || '', nowIso());
    return Number(res.lastInsertRowid);
  }

  private touch(id: string) {
    this.db.prepare('UPDATE leads SET updated_at = ? WHERE id = ?').run(nowIso(), id);
  }

  /** Sets the stage and, if the lead is now closed, cancels its open follow-ups. */
  private applyStage(leadId: string, to: Stage) {
    this.db.prepare('UPDATE leads SET stage = ?, updated_at = ? WHERE id = ?').run(to, nowIso(), leadId);
    if (CLOSED_STAGES.includes(to)) {
      this.db.prepare(`UPDATE activities SET result = 'cancelled'
        WHERE lead_id = ? AND result = 'planned'`).run(leadId);
    }
  }

  private schedule(leadId: string, f: FollowUp | null | undefined) {
    if (!f || !f.date) return;
    const type = this.checkType(txt(f.type) || 'Call');
    this.insertActivity({
      leadId, date: this.checkDate(f.date, 'follow-up date'), type, result: 'planned',
      note: longTxt(f.note) || `Follow-up ${type.toLowerCase()}`,
    });
  }

  /** Works out the target stage for a finished activity, validating an explicit choice. */
  private resolveStage(from: Stage, type: string, result: string, stage?: string, reason?: string): Stage {
    const explicit = txt(stage);
    const to = explicit ? this.checkStage(explicit) : autoStage(from, type, result);
    if (to === 'disqualified' && from !== 'disqualified' && !txt(reason)) {
      throw bad('A reason is required to disqualify.');
    }
    return to;
  }

  /* ============================================================== leads */

  listLeads(): Lead[] {
    const segs = this.segmentMap();
    return (this.db.prepare(LEAD_SQL + ' ORDER BY l.id').all() as Row[]).map((r) => this.toLead(r, segs));
  }

  getLead(id: string): Lead {
    const r = this.db.prepare(LEAD_SQL + ' WHERE l.id = ?').get(id) as Row | undefined;
    if (!r) throw notFound(`Lead ${id} not found.`);
    return this.toLead(r, this.segmentMap());
  }

  leadCard(id: string) {
    const lead = this.getLead(id);
    const activities = (this.db.prepare(`SELECT * FROM activities WHERE lead_id = ?
      ORDER BY CASE result WHEN 'planned' THEN 0 ELSE 1 END,
               CASE result WHEN 'planned' THEN date END ASC,
               date DESC, id DESC`).all(id) as Row[]).map((r) => this.toActivity(r));
    const seg = this.db.prepare('SELECT * FROM segments WHERE name = ?').get(lead.segment) as Row | undefined;
    const events = (this.db.prepare('SELECT * FROM events WHERE lead_id = ? ORDER BY date').all(id) as Row[])
      .map((e) => this.toEvent(e));
    return { lead, activities, playbook: seg ? this.toSegment(seg) : null, events };
  }

  private findDuplicate(company: string, exceptId?: string): Row | undefined {
    const key = companyKey(company);
    if (!key) return undefined;
    return this.db.prepare('SELECT id, company FROM leads WHERE company_key = ? AND id <> ?')
      .get(key, exceptId || '') as Row | undefined;
  }

  private nextLeadId(): string {
    let max = 0;
    for (const r of this.db.prepare('SELECT id FROM leads').all() as Row[]) {
      const m = String(r.id).match(/(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return 'L' + String(max + 1).padStart(3, '0');
  }

  createLead(d: LeadInput & { next?: string }): Lead {
    const company = txt(d.company);
    if (!company) throw bad('Company name is required.');
    const dup = this.findDuplicate(company);
    if (dup) throw new HttpError(409, `Already in the base: ${dup.company} (${dup.id}).`);
    const stage = this.checkStage(txt(d.stage) || 'new');
    const segment = txt(d.segment) || DEFAULT_SEGMENT;
    return tx(this.db, () => {
      const id = this.nextLeadId();
      const now = nowIso();
      this.db.prepare(`INSERT INTO leads
        (id, segment, company, company_key, industry, city, phone, email, web, person, stage,
         notes, extra, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, segment, company, companyKey(company), txt(d.industry), txt(d.city),
        normPhone(d.phone) || txt(d.phone), normEmail(d.email), normUrl(d.web), txt(d.person), stage,
        longTxt(d.notes), txt(d.extra), txt(d.source) || 'Manual', now, now);
      this.insertActivity({ leadId: id, date: this.today(), type: 'Note', note: 'Added manually', result: 'done' });
      if (d.next) this.schedule(id, { date: d.next, type: 'Call', note: 'First call' });
      return this.getLead(id);
    });
  }

  updateLead(id: string, d: LeadInput): Lead {
    const cur = this.leadRow(id);
    const set: Record<string, string> = {};
    if (d.company !== undefined) {
      const company = txt(d.company);
      if (!company) throw bad('Company name is required.');
      const dup = this.findDuplicate(company, id);
      if (dup) throw new HttpError(409, `Another lead already has this name: ${dup.company} (${dup.id}).`);
      set.company = company;
      set.company_key = companyKey(company);
    }
    if (d.industry !== undefined) set.industry = txt(d.industry);
    if (d.city !== undefined) set.city = txt(d.city);
    if (d.phone !== undefined) set.phone = normPhone(d.phone) || txt(d.phone);
    if (d.email !== undefined) {
      const e = txt(d.email);
      set.email = normEmail(e);
      if (e && !set.email) throw bad(`Not an email address: ${e}`);
    }
    if (d.web !== undefined) set.web = normUrl(d.web);
    if (d.person !== undefined) set.person = txt(d.person);
    if (d.notes !== undefined) set.notes = longTxt(d.notes);
    if (d.extra !== undefined) set.extra = txt(d.extra);
    if (d.source !== undefined) set.source = txt(d.source);
    if (d.segment !== undefined) set.segment = txt(d.segment) || DEFAULT_SEGMENT;

    return tx(this.db, () => {
      const keys = Object.keys(set);
      if (keys.length) {
        this.db.prepare(`UPDATE leads SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
          .run(...keys.map((k) => set[k]), nowIso(), id);
      }
      if (set.segment !== undefined && set.segment !== cur.segment) {
        this.insertActivity({ leadId: id, date: this.today(), type: 'Note', result: 'done',
          note: `Segment: ${cur.segment || '—'} → ${set.segment}` });
      }
      return this.getLead(id);
    });
  }

  deleteLead(id: string) {
    this.leadRow(id);
    tx(this.db, () => {
      this.db.prepare('DELETE FROM activities WHERE lead_id = ?').run(id);
      this.db.prepare(`UPDATE events SET lead_id = '' WHERE lead_id = ?`).run(id);
      this.db.prepare('DELETE FROM leads WHERE id = ?').run(id);
    });
    return { ok: true };
  }

  /** Stage change on its own. Moving a lead is not a contact, so no "last contact" update. */
  setStage(id: string, stage: string, reason?: string) {
    const cur = this.leadRow(id);
    const to = this.checkStage(stage);
    if (to === 'disqualified' && !txt(reason)) throw bad('A reason is required to disqualify.');
    if (cur.stage === to) return this.leadCard(id);
    tx(this.db, () => {
      this.applyStage(id, to);
      this.insertActivity({ leadId: id, date: this.today(), type: 'Note', result: 'done',
        note: longTxt(reason), stageFrom: cur.stage, stageTo: to });
    });
    return this.leadCard(id);
  }

  /* ========================================================= activities */

  /**
   * The "after a call" action. Records what happened (or plans something), moves
   * the stage — explicitly or by the auto rule — and optionally books the next step.
   */
  logActivity(leadId: string, d: LogInput) {
    const cur = this.leadRow(leadId);
    const type = this.checkType(txt(d.type) || 'Call');
    const result = this.checkResult(txt(d.result) || 'done');
    if (result === 'cancelled') throw bad('Cannot log a cancelled activity.');
    const note = longTxt(d.note);

    if (result === 'planned') {
      const date = this.checkDate(d.date || this.today());
      tx(this.db, () => {
        this.insertActivity({ leadId, date, type, result, note: note || `Planned ${type.toLowerCase()}` });
        this.touch(leadId);
      });
      return this.leadCard(leadId);
    }

    const date = d.date ? this.checkDate(d.date) : this.today();
    if (date > this.today()) throw bad('Something that already happened cannot be in the future — plan it instead.');
    const from = cur.stage as Stage;
    const to = this.resolveStage(from, type, result, d.stage, d.reason);
    const text = [note, to === 'disqualified' && from !== to ? longTxt(d.reason) : ''].filter(Boolean).join(' — ');

    tx(this.db, () => {
      if (to !== from) this.applyStage(leadId, to);
      this.insertActivity({ leadId, date, type, result, note: text,
        stageFrom: to !== from ? from : '', stageTo: to !== from ? to : '' });
      this.schedule(leadId, d.followUp);
      this.touch(leadId);
    });
    return this.leadCard(leadId);
  }

  /** Tick off a planned activity: reached, no answer or done. Optionally book the next one. */
  completeActivity(id: number, d: CompleteInput) {
    const a = this.activityRow(id);
    if (a.result !== 'planned') throw bad('This activity is already closed.');
    const result = this.checkResult(txt(d.result));
    if (result === 'planned' || result === 'cancelled') throw bad('Pick reached, no answer or done.');
    const cur = this.leadRow(a.lead_id);
    const now = this.today();
    const from = cur.stage as Stage;
    const to = this.resolveStage(from, a.type, result, d.stage, d.reason);

    // done late? it belongs to the day it actually happened; keep the due date in the note
    const parts = [a.note, longTxt(d.note)];
    if (to === 'disqualified' && from !== to) parts.push(longTxt(d.reason));
    if (a.date !== now) parts.push(`planned for ${a.date}`);
    const text = parts.filter(Boolean).join(' | ');

    tx(this.db, () => {
      if (to !== from) this.applyStage(a.lead_id, to);
      this.db.prepare(`UPDATE activities SET result = ?, date = ?, note = ?, stage_from = ?, stage_to = ?
        WHERE id = ?`).run(result, now, text, to !== from ? from : '', to !== from ? to : '', id);
      this.schedule(a.lead_id, d.followUp);
      this.touch(a.lead_id);
    });
    return this.leadCard(a.lead_id);
  }

  /** Correct a logged or planned activity — date, type or note. */
  updateActivity(id: number, d: { date?: string; note?: string; type?: string; result?: string }) {
    const a = this.activityRow(id);
    const set: Record<string, string> = {};
    if (d.date !== undefined) {
      set.date = this.checkDate(d.date);
      if (a.result !== 'planned' && set.date > this.today()) throw bad('A finished activity cannot be in the future.');
    }
    if (d.note !== undefined) set.note = longTxt(d.note);
    if (d.type !== undefined) set.type = this.checkType(d.type);
    if (d.result !== undefined) {
      const r = this.checkResult(d.result);
      if ((r === 'planned') !== (a.result === 'planned')) throw bad('Use complete to close a planned activity.');
      set.result = r;
    }
    const keys = Object.keys(set);
    if (keys.length) {
      this.db.prepare(`UPDATE activities SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`)
        .run(...keys.map((k) => set[k]), id);
    }
    return this.leadCard(a.lead_id);
  }

  deleteActivity(id: number) {
    const a = this.activityRow(id);
    this.db.prepare('DELETE FROM activities WHERE id = ?').run(id);
    return this.leadCard(a.lead_id);
  }

  /** Everything between two dates, plus anything still open from before. */
  agenda(from: string, to: string) {
    this.checkDate(from); this.checkDate(to);
    const acts = (this.db.prepare(`SELECT a.*, l.company FROM activities a JOIN leads l ON l.id = a.lead_id
      WHERE (a.date BETWEEN ? AND ?) AND a.result <> 'cancelled'
      ORDER BY a.date, a.id`).all(from, to) as Row[]).map((r) => this.toActivity(r));
    const events = (this.db.prepare('SELECT * FROM events WHERE date BETWEEN ? AND ? ORDER BY date, time')
      .all(from, to) as Row[]).map((e) => this.toEvent(e));
    const tasks = (this.db.prepare(`SELECT t.*, e.title AS event_title, e.date AS event_date FROM tasks t
      LEFT JOIN events e ON e.id = t.event_id WHERE t.due BETWEEN ? AND ? ORDER BY t.due`)
      .all(from, to) as Row[]).map((t) => this.toTask(t));
    return { activities: acts, events, tasks };
  }

  /** The home screen: what is overdue, what is today, and who to call next. */
  todayView() {
    const t = this.today();
    const week = addDays(t, 7);
    const planned = (this.db.prepare(`SELECT a.*, l.company, l.phone, l.email, l.stage FROM activities a
      JOIN leads l ON l.id = a.lead_id WHERE a.result = 'planned' AND a.date <= ?
      ORDER BY a.date, a.id`).all(week) as Row[]);
    const withLead = (r: Row) => ({ ...this.toActivity(r), phone: r.phone, email: r.email, stage: r.stage });

    const leads = this.listLeads();
    const queue = leads
      .filter((l) => l.stage === 'new' && l.openCount === 0 && (l.phone || l.email))
      .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
      .slice(0, 25);

    const tasks = (this.db.prepare(`SELECT t.*, e.title AS event_title, e.date AS event_date FROM tasks t
      LEFT JOIN events e ON e.id = t.event_id WHERE t.status <> 'done' AND t.due <> '' AND t.due <= ?
      ORDER BY t.due`).all(addDays(t, 3)) as Row[]).map((r) => this.toTask(r));
    const events = (this.db.prepare(`SELECT * FROM events WHERE date BETWEEN ? AND ? AND status <> 'cancelled'
      ORDER BY date, time`).all(t, addDays(t, 21)) as Row[]).map((e) => this.toEvent(e));

    const done = this.db.prepare(`SELECT COUNT(*) AS n, COUNT(DISTINCT lead_id) AS c FROM activities
      WHERE date = ? AND result IN ('reached','done','no answer') AND type <> 'Note'`).get(t) as Row;

    return {
      today: t,
      overdue: planned.filter((r) => r.date < t).map(withLead),
      due: planned.filter((r) => r.date === t).map(withLead),
      upcoming: planned.filter((r) => r.date > t).map(withLead),
      queue,
      tasks,
      events,
      doneToday: { activities: Number(done.n), companies: Number(done.c) },
    };
  }

  /* ============================================================= stats */

  stats() {
    const t = this.today();
    const w = addDays(t, -6);
    const m = addDays(t, -29);
    const rows = this.db.prepare(`SELECT date, type, lead_id, result, stage_to FROM activities
      WHERE date >= ? AND date <= ? AND result NOT IN ('planned','cancelled')`).all(m, t) as Row[];

    const blank = () => ({ total: 0, byType: {} as Record<string, number>, companies: new Set<string>(),
      reached: 0, noAnswer: 0, moves: 0 });
    const b = { today: blank(), week: blank(), month: blank() };
    const daily: Record<string, Record<string, number>> = {};
    for (let i = 0; i < 30; i++) daily[addDays(m, i)] = {};

    for (const r of rows) {
      const counted = (COUNTED as string[]).includes(r.type);
      if (r.stage_to) {
        for (const k of [b.month, ...(r.date >= w ? [b.week] : []), ...(r.date === t ? [b.today] : [])]) k.moves++;
      }
      if (!counted) continue;
      daily[r.date] && (daily[r.date][r.type] = (daily[r.date][r.type] || 0) + 1);
      const targets = [b.month];
      if (r.date >= w) targets.push(b.week);
      if (r.date === t) targets.push(b.today);
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

    const leads = this.listLeads();
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

  report(from?: string, to?: string): { from: string; to: string; text: string } {
    const b = to ? this.checkDate(to) : this.today();
    const a = from ? this.checkDate(from) : addDays(b, -6);
    if (a > b) throw bad('The start date is after the end date.');
    const activities = (this.db.prepare(`SELECT a.*, l.company FROM activities a JOIN leads l ON l.id = a.lead_id`)
      .all() as Row[]).map((r) => this.toActivity(r));
    const text = buildReport({
      from: a, to: b, today: this.today(), owner: this.owner,
      leads: this.listLeads(), activities, events: this.listEvents(), tasks: this.listTasks(),
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

  listEvents(): CrmEvent[] {
    return (this.db.prepare(`SELECT e.*,
        (SELECT COUNT(*) FROM tasks t WHERE t.event_id = e.id AND t.status <> 'done') AS open_tasks,
        (SELECT COUNT(*) FROM tasks t WHERE t.event_id = e.id) AS total_tasks
      FROM events e ORDER BY e.date, e.time`).all() as Row[]).map((r) => this.toEvent(r));
  }

  private nextCode(table: 'events' | 'tasks', prefix: string): string {
    let max = 0;
    for (const r of this.db.prepare(`SELECT id FROM ${table}`).all() as Row[]) {
      const m = String(r.id).match(/(\d+)/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `${prefix}-${String(max + 1).padStart(4, '0')}`;
  }

  saveEvent(d: Partial<CrmEvent>): CrmEvent {
    const title = txt(d.title);
    if (!title) throw bad('Event title is required.');
    const date = this.checkDate(d.date, 'event date');
    const status = txt(d.status) || 'planned';
    if (!(EVENT_STATUS as readonly string[]).includes(status)) throw bad(`Unknown event status: ${status}`);
    let company = txt(d.company);
    const leadId = txt(d.leadId);
    if (leadId) {
      const l = this.leadRow(leadId);
      if (!company) company = l.company;
    }
    const v = [title, txt(d.type) || 'Other', date, txt(d.time), leadId, company, txt(d.location), status,
      txt(d.owner) || this.owner, txt(d.cost), longTxt(d.notes)];
    const id = txt(d.id);
    if (id) {
      const res = this.db.prepare(`UPDATE events SET title=?, type=?, date=?, time=?, lead_id=?, company=?,
        location=?, status=?, owner=?, cost=?, notes=? WHERE id = ?`).run(...v, id);
      if (!res.changes) throw notFound(`Event ${id} not found.`);
      return this.listEvents().find((e) => e.id === id)!;
    }
    const newId = this.nextCode('events', 'EV');
    this.db.prepare(`INSERT INTO events (title, type, date, time, lead_id, company, location, status, owner,
      cost, notes, id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...v, newId, this.today());
    return this.listEvents().find((e) => e.id === newId)!;
  }

  deleteEvent(id: string) {
    tx(this.db, () => {
      const res = this.db.prepare('DELETE FROM events WHERE id = ?').run(id);
      if (!res.changes) throw notFound(`Event ${id} not found.`);
      this.db.prepare('DELETE FROM tasks WHERE event_id = ?').run(id);
    });
    return { ok: true };
  }

  /* ============================================================= tasks */

  private toTask(r: Row): Task {
    return {
      id: r.id, eventId: r.event_id, task: r.task, owner: r.owner, due: r.due, status: r.status,
      notes: r.notes, completed: r.completed,
      ...(r.event_title !== undefined ? { eventTitle: r.event_title || '', eventDate: r.event_date || '' } : {}),
    };
  }

  listTasks(): Task[] {
    return (this.db.prepare(`SELECT t.*, e.title AS event_title, e.date AS event_date FROM tasks t
      LEFT JOIN events e ON e.id = t.event_id
      ORDER BY CASE WHEN t.due = '' THEN 1 ELSE 0 END, t.due, t.id`).all() as Row[]).map((r) => this.toTask(r));
  }

  saveTask(d: Partial<Task>): Task {
    const task = longTxt(d.task);
    if (!task) throw bad('Task description is required.');
    const status = txt(d.status) || 'todo';
    if (!(TASK_STATUS as readonly string[]).includes(status)) throw bad(`Unknown task status: ${status}`);
    const due = txt(d.due) ? this.checkDate(txt(d.due), 'due date') : '';
    const eventId = txt(d.eventId);
    if (eventId && !this.db.prepare('SELECT 1 FROM events WHERE id = ?').get(eventId)) {
      throw notFound(`Event ${eventId} not found.`);
    }
    const id = txt(d.id);
    if (id) {
      const cur = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Row | undefined;
      if (!cur) throw notFound(`Task ${id} not found.`);
      const completed = status === 'done' ? (cur.completed || this.today()) : '';
      this.db.prepare(`UPDATE tasks SET event_id=?, task=?, owner=?, due=?, status=?, notes=?, completed=?
        WHERE id = ?`).run(eventId, task, txt(d.owner) || this.owner, due, status, longTxt(d.notes), completed, id);
      return this.listTasks().find((t) => t.id === id)!;
    }
    const newId = this.nextCode('tasks', 'TS');
    this.db.prepare(`INSERT INTO tasks (id, event_id, task, owner, due, status, notes, completed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(newId, eventId, task, txt(d.owner) || this.owner, due, status,
      longTxt(d.notes), status === 'done' ? this.today() : '');
    return this.listTasks().find((t) => t.id === newId)!;
  }

  toggleTask(id: string): Task {
    const cur = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Row | undefined;
    if (!cur) throw notFound(`Task ${id} not found.`);
    const next = cur.status === 'done' ? 'todo' : 'done';
    this.db.prepare('UPDATE tasks SET status = ?, completed = ? WHERE id = ?')
      .run(next, next === 'done' ? this.today() : '', id);
    return this.listTasks().find((t) => t.id === id)!;
  }

  deleteTask(id: string) {
    const res = this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    if (!res.changes) throw notFound(`Task ${id} not found.`);
    return { ok: true };
  }

  /* ====================================================== playbook etc */

  private toSegment(r: Row): Segment {
    return {
      name: r.name, weight: Number(r.weight), goal: r.goal, who: r.who, opening: r.opening, hook: r.hook,
      offer: r.offer, cta: r.cta, objections: r.objections, why: r.why, sort: Number(r.sort),
    };
  }

  listSegments(): (Segment & { leads: number })[] {
    return (this.db.prepare(`SELECT s.*, (SELECT COUNT(*) FROM leads l WHERE l.segment = s.name) AS leads
      FROM segments s ORDER BY s.sort, s.name`).all() as Row[])
      .map((r) => ({ ...this.toSegment(r), leads: Number(r.leads) }));
  }

  /** Create or update a segment. Renaming moves every lead with it. */
  saveSegment(d: Partial<Segment> & { originalName?: string }) {
    const name = txt(d.name);
    if (!name) throw bad('Segment name is required.');
    const weight = Number(d.weight);
    if (!Number.isFinite(weight) || weight < 0 || weight > 10) throw bad('Weight must be a number from 0 to 10.');
    const original = txt(d.originalName);
    const fields = [weight, longTxt(d.goal), longTxt(d.who), longTxt(d.opening), longTxt(d.hook),
      longTxt(d.offer), longTxt(d.cta), longTxt(d.objections), longTxt(d.why)];
    tx(this.db, () => {
      if (original) {
        if (!this.db.prepare('SELECT 1 FROM segments WHERE name = ?').get(original)) {
          throw notFound(`Segment ${original} not found.`);
        }
        if (name !== original && this.db.prepare('SELECT 1 FROM segments WHERE name = ?').get(name)) {
          throw new HttpError(409, `Segment "${name}" already exists.`);
        }
        this.db.prepare(`UPDATE segments SET name=?, weight=?, goal=?, who=?, opening=?, hook=?, offer=?, cta=?,
          objections=?, why=? WHERE name = ?`).run(name, ...fields, original);
        if (name !== original) this.db.prepare('UPDATE leads SET segment = ? WHERE segment = ?').run(name, original);
      } else {
        if (this.db.prepare('SELECT 1 FROM segments WHERE lower(name) = lower(?)').get(name)) {
          throw new HttpError(409, `Segment "${name}" already exists.`);
        }
        const sort = Number((this.db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM segments').get() as Row).n);
        this.db.prepare(`INSERT INTO segments (name, weight, goal, who, opening, hook, offer, cta, objections, why, sort)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(name, ...fields, sort);
      }
    });
    return this.listSegments().find((s) => s.name === name)!;
  }

  deleteSegment(name: string) {
    const n = Number((this.db.prepare('SELECT COUNT(*) AS n FROM leads WHERE segment = ?').get(name) as Row).n);
    if (n) throw new HttpError(409, `${n} leads still use "${name}". Move them to another segment first.`);
    const res = this.db.prepare('DELETE FROM segments WHERE name = ?').run(name);
    if (!res.changes) throw notFound(`Segment ${name} not found.`);
    return { ok: true };
  }

  listTemplates(): Template[] {
    return this.db.prepare('SELECT * FROM templates ORDER BY length(code), code').all() as unknown as Template[];
  }

  saveTemplate(d: Partial<Template> & { originalCode?: string }) {
    const code = txt(d.code).toUpperCase();
    if (!code) throw bad('Template code is required.');
    const v = [txt(d.kind), txt(d.segments), txt(d.subject), longTxt(d.body)];
    const original = txt(d.originalCode);
    if (original) {
      if (code !== original && this.db.prepare('SELECT 1 FROM templates WHERE code = ?').get(code)) {
        throw new HttpError(409, `Template ${code} already exists.`);
      }
      const res = this.db.prepare('UPDATE templates SET code=?, kind=?, segments=?, subject=?, body=? WHERE code=?')
        .run(code, ...v, original);
      if (!res.changes) throw notFound(`Template ${original} not found.`);
    } else {
      if (this.db.prepare('SELECT 1 FROM templates WHERE code = ?').get(code)) {
        throw new HttpError(409, `Template ${code} already exists.`);
      }
      this.db.prepare('INSERT INTO templates (code, kind, segments, subject, body) VALUES (?, ?, ?, ?, ?)').run(code, ...v);
    }
    return this.listTemplates().find((t) => t.code === code)!;
  }

  deleteTemplate(code: string) {
    const res = this.db.prepare('DELETE FROM templates WHERE code = ?').run(code);
    if (!res.changes) throw notFound(`Template ${code} not found.`);
    return { ok: true };
  }

  renderTemplate(leadId: string, code: string) {
    const lead = this.getLead(leadId);
    const t = this.db.prepare('SELECT * FROM templates WHERE code = ?').get(code) as Row | undefined;
    if (!t) throw notFound(`Template ${code} not found.`);
    return { subject: fillTemplate(t.subject, lead), body: fillTemplate(t.body, lead), email: lead.email };
  }

  /* ============================================================ hygiene */

  /** Groups of leads whose names compare equal once legal forms and punctuation are ignored. */
  duplicates() {
    const rows = this.db.prepare(`SELECT id, company, city, phone, email, stage, company_key FROM leads
      WHERE company_key IN (SELECT company_key FROM leads WHERE company_key <> ''
        GROUP BY company_key HAVING COUNT(*) > 1)
      ORDER BY company_key, id`).all() as Row[];
    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      const k = r.company_key;
      delete r.company_key;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }
    return [...groups.values()];
  }

  config() {
    return {
      owner: this.owner, today: this.today(), stages: STAGES, types: TYPES, results: RESULTS,
      counted: COUNTED, eventStatus: EVENT_STATUS, taskStatus: TASK_STATUS,
      segments: this.listSegments(), templates: this.listTemplates(),
    };
  }
}
