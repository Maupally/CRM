/**
 * Marketing: the content calendar (what goes out where, who makes it, did it go out and how it went) and the
 * partnership backlog (people we know who could pass our news on). The team works on both through personal links
 * that open only these two — nothing else in Opal5.
 */
import { randomBytes } from 'node:crypto';
import type { Crm } from './crm.js';
import { nowIso } from './db.js';
import { HttpError } from './crm.js';
import { isIsoDay, longTxt, txt } from '../shared/domain.js';
import {
  CONTENT_STATUS, PARTNER_STATUS,
  type ContentItem, type ContentReportRow, type ContentStatus, type PartnerIdea, type PartnerStatus, type ShareLink,
} from '../shared/marketing.js';

type Input = Record<string, any>;
/** Accepts both the app's camelCase and the connector's snake_case. */
const field = (d: Input, k: string) => d[k] ?? d[k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)];

export class Marketing {
  constructor(private crm: Crm) {}
  private get db() { return this.crm.db; }

  /* ------------------------------------------------------------ content calendar */

  private toContent(r: any): ContentItem {
    return {
      id: Number(r.id), day: r.day, channel: r.channel, kind: r.kind, title: r.title, body: r.body, eventId: r.event_id,
      eventTitle: r.event_title || undefined, owner: r.owner, status: r.status, link: r.link, result: r.result,
      publishedOn: r.published_on, createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
    };
  }

  async content(f: { from?: string; to?: string; eventId?: string } = {}): Promise<ContentItem[]> {
    const where: string[] = [];
    const args: string[] = [];
    // unscheduled items always show — they are the to-plan pile
    if (f.from) { where.push("(c.day = '' OR c.day >= ?)"); args.push(f.from); }
    if (f.to) { where.push("(c.day = '' OR c.day <= ?)"); args.push(f.to); }
    if (f.eventId) { where.push('c.event_id = ?'); args.push(f.eventId); }
    const rows = await this.db.all(`SELECT c.*, e.title AS event_title FROM crm.content c LEFT JOIN crm.events e ON e.id = c.event_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY c.day = '', c.day, c.id LIMIT 2000`, args);
    return rows.map((r) => this.toContent(r));
  }

  async getContent(id: number): Promise<ContentItem> {
    const r = await this.db.get('SELECT c.*, e.title AS event_title FROM crm.content c LEFT JOIN crm.events e ON e.id = c.event_id WHERE c.id = ?', [id]);
    if (!r) throw new HttpError(404, `Nie ma pozycji ${id} w kalendarzu treści.`);
    return this.toContent(r);
  }

  async saveContent(d: Input, by = ''): Promise<ContentItem> {
    const id = Number(d.id) || 0;
    const cur = id ? await this.getContent(id) : null;
    const pick = (k: keyof ContentItem) => { const v = field(d, k); return v === undefined || v === null ? (cur?.[k] ?? '') : v; };
    const status = String(pick('status') || 'idea') as ContentStatus;
    if (!CONTENT_STATUS.includes(status)) throw new HttpError(400, `Nieznany status: ${status}`);
    const v = {
      day: txt(pick('day')), channel: txt(pick('channel')), kind: txt(pick('kind')), title: txt(pick('title')), body: longTxt(pick('body')),
      event_id: txt(pick('eventId')), owner: txt(pick('owner')), status, link: txt(pick('link')), result: longTxt(pick('result')),
      published_on: txt(pick('publishedOn')),
    };
    if (!v.title) throw new HttpError(400, 'Podaj, co to za treść (tytuł).');
    if (v.day && !isIsoDay(v.day)) throw new HttpError(400, 'Zła data (yyyy-MM-dd).');
    if (v.event_id && !(await this.db.get('SELECT 1 AS x FROM crm.events WHERE id = ?', [v.event_id]))) throw new HttpError(404, `Nie ma wydarzenia ${v.event_id}.`);
    // published: remember when — the report counts it in that month
    if (status === 'published' && !v.published_on) v.published_on = v.day && v.day <= this.crm.today() ? v.day : this.crm.today();
    if (status !== 'published') v.published_on = '';
    const now = nowIso();
    const cols = Object.keys(v);
    if (cur) {
      await this.db.run(`UPDATE crm.content SET ${cols.map((k) => `${k}=?`).join(', ')}, updated_at=? WHERE id = ?`, [...Object.values(v), now, id]);
      return this.getContent(id);
    }
    const r = await this.db.get(`INSERT INTO crm.content (${cols.join(', ')}, created_by, created_at, updated_at)
      VALUES (${cols.map(() => '?').join(', ')}, ?, ?, ?) RETURNING id`, [...Object.values(v), txt(by) || this.crm.owner, now, now]);
    return this.getContent(Number(r!.id));
  }

  async removeContent(id: number) {
    await this.db.run('DELETE FROM crm.content WHERE id = ?', [id]);
    return { ok: true };
  }

  /** Who planned what in the month, what is ready, what went out, what is late. */
  async contentReport(month: string): Promise<{ month: string; rows: ContentReportRow[]; published: ContentItem[] }> {
    if (!/^\d{4}-\d\d$/.test(month)) throw new HttpError(400, 'Miesiąc w formacie yyyy-MM.');
    const today = this.crm.today();
    const items = (await this.content()).filter((c) => c.status !== 'dropped' && ((c.day && c.day.startsWith(month)) || c.publishedOn.startsWith(month)));
    const rows = new Map<string, ContentReportRow>();
    for (const c of items) {
      const k = c.owner || '—';
      const r = rows.get(k) || { owner: k, planned: 0, ready: 0, published: 0, late: 0 };
      r.planned++;
      if (c.status === 'ready') r.ready++;
      if (c.status === 'published') r.published++;
      else if (c.day && c.day < today) r.late++;
      rows.set(k, r);
    }
    return { month, rows: [...rows.values()].sort((a, b) => b.planned - a.planned), published: items.filter((c) => c.status === 'published') };
  }

  /* ------------------------------------------------------------ partnership backlog */

  private toPartner(r: any): PartnerIdea {
    return {
      id: Number(r.id), who: r.who, relation: r.relation, reach: r.reach, idea: r.idea, contact: r.contact, eventId: r.event_id,
      eventTitle: r.event_title || undefined, owner: r.owner, status: r.status, notes: r.notes, createdBy: r.created_by,
      createdAt: r.created_at, updatedAt: r.updated_at,
    };
  }

  async partners(f: { eventId?: string; status?: string } = {}): Promise<PartnerIdea[]> {
    const where: string[] = [];
    const args: string[] = [];
    if (f.eventId) { where.push('p.event_id = ?'); args.push(f.eventId); }
    if (f.status) { where.push('p.status = ?'); args.push(f.status); }
    const rows = await this.db.all(`SELECT p.*, e.title AS event_title FROM crm.partner_ideas p LEFT JOIN crm.events e ON e.id = p.event_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY p.updated_at DESC LIMIT 2000`, args);
    return rows.map((r) => this.toPartner(r));
  }

  async getPartner(id: number): Promise<PartnerIdea> {
    const r = await this.db.get('SELECT p.*, e.title AS event_title FROM crm.partner_ideas p LEFT JOIN crm.events e ON e.id = p.event_id WHERE p.id = ?', [id]);
    if (!r) throw new HttpError(404, `Nie ma pozycji ${id} w backlogu partnerskim.`);
    return this.toPartner(r);
  }

  async savePartner(d: Input, by = ''): Promise<PartnerIdea> {
    const id = Number(d.id) || 0;
    const cur = id ? await this.getPartner(id) : null;
    const pick = (k: keyof PartnerIdea) => { const v = field(d, k); return v === undefined || v === null ? (cur?.[k] ?? '') : v; };
    const status = String(pick('status') || 'idea') as PartnerStatus;
    if (!PARTNER_STATUS.includes(status)) throw new HttpError(400, `Nieznany status: ${status}`);
    const v = {
      who: txt(pick('who')), relation: txt(pick('relation')), reach: txt(pick('reach')), idea: longTxt(pick('idea')), contact: txt(pick('contact')),
      event_id: txt(pick('eventId')), owner: txt(pick('owner')), status, notes: longTxt(pick('notes')),
    };
    if (!v.who) throw new HttpError(400, 'Podaj, kto to (who).');
    if (v.event_id && !(await this.db.get('SELECT 1 AS x FROM crm.events WHERE id = ?', [v.event_id]))) throw new HttpError(404, `Nie ma wydarzenia ${v.event_id}.`);
    const now = nowIso();
    const cols = Object.keys(v);
    if (cur) {
      await this.db.run(`UPDATE crm.partner_ideas SET ${cols.map((k) => `${k}=?`).join(', ')}, updated_at=? WHERE id = ?`, [...Object.values(v), now, id]);
      return this.getPartner(id);
    }
    const r = await this.db.get(`INSERT INTO crm.partner_ideas (${cols.join(', ')}, created_by, created_at, updated_at)
      VALUES (${cols.map(() => '?').join(', ')}, ?, ?, ?) RETURNING id`, [...Object.values(v), txt(by) || this.crm.owner, now, now]);
    return this.getPartner(Number(r!.id));
  }

  async removePartner(id: number) {
    await this.db.run('DELETE FROM crm.partner_ideas WHERE id = ?', [id]);
    return { ok: true };
  }

  /* ------------------------------------------------------------ team links */

  async links(): Promise<ShareLink[]> {
    const rows = await this.db.all('SELECT * FROM crm.share_links ORDER BY revoked, created_at DESC');
    return rows.map((r) => ({ token: r.token, name: r.name, createdAt: r.created_at, lastUsed: r.last_used, revoked: !!r.revoked }));
  }

  async addLink(name: string): Promise<ShareLink> {
    const n = txt(name);
    if (!n) throw new HttpError(400, 'Podaj, dla kogo jest link.');
    const token = randomBytes(18).toString('base64url');
    await this.db.run('INSERT INTO crm.share_links (token, name, created_at) VALUES (?, ?, ?)', [token, n, nowIso()]);
    return (await this.links()).find((l) => l.token === token)!;
  }

  async revokeLink(token: string) {
    await this.db.run('UPDATE crm.share_links SET revoked = TRUE WHERE token = ?', [token]);
    return { ok: true };
  }

  /** The person behind a team link, or a 404 — a revoked or made-up link opens nothing. */
  async resolve(token: string): Promise<string> {
    const r = token.length >= 16 ? await this.db.get('SELECT name, revoked, last_used FROM crm.share_links WHERE token = ?', [token]) : null;
    if (!r || r.revoked) throw new HttpError(404, 'Ten link nie działa — poproś o nowy.');
    const today = this.crm.today();
    if (!String(r.last_used).startsWith(today)) await this.db.run('UPDATE crm.share_links SET last_used = ? WHERE token = ?', [nowIso(), token]);
    return String(r.name);
  }

  /** What the team space may show besides the two lists: upcoming events (to link content to) and team names (owners). */
  async teamContext() {
    const today = this.crm.today();
    const [events, people] = await Promise.all([this.crm.listEvents(), this.crm.listPeople()]);
    return {
      events: events.filter((e) => e.date >= today && e.status !== 'cancelled').map((e) => ({ id: e.id, title: e.title, date: e.date })),
      team: people.filter((p) => p.kind === 'team').map((p) => p.name.split(' ')[0]).filter(Boolean),
    };
  }
}
