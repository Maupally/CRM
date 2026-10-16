/**
 * Na później: a loose backlog of things to come back to — a company with an offer that is not the user's topic,
 * an idea for next year. Nothing to do now; Claude brings them up when the date comes, when the conversation
 * touches their topic, and now and then on its own so they are not forgotten.
 */
import type { DB, Row } from './db.js';
import { nowIso } from './db.js';
import { HttpError } from './crm.js';
import { IDEA_STATUS, IDEA_STATUS_LABEL, addDays, isIsoDay, longTxt, searchKey, txt, type Idea, type IdeaStatus } from '../shared/domain.js';

/** How long an idea rests before it may be brought up again on its own. */
const REST_DAYS = 21;

const words = (q: string) => searchKey(q).split(/[^a-z0-9]+/).filter((w) => w.length >= 4).map((w) => w.slice(0, 5));

export class Ideas {
  constructor(private db: DB, private today: () => string) {}

  private toIdea(r: Row): Idea {
    return {
      id: Number(r.id), title: r.title, topic: r.topic, note: r.note, url: r.url, contact: r.contact, owner: r.owner,
      whenRelevant: r.when_relevant, remindOn: r.remind_on, status: r.status, lastShown: r.last_shown, createdAt: r.created_at, updatedAt: r.updated_at,
    };
  }

  async list(all = true): Promise<Idea[]> {
    const rows = await this.db.all(`SELECT * FROM crm.ideas ${all ? '' : "WHERE status = 'open'"}
      ORDER BY status = 'open' DESC, remind_on = '', remind_on, updated_at DESC`);
    return rows.map((r) => this.toIdea(r));
  }

  async get(id: number): Promise<Idea> {
    const r = await this.db.get('SELECT * FROM crm.ideas WHERE id = ?', [id]);
    if (!r) throw new HttpError(404, `Nie ma pozycji ${id} na liście „Na później”.`);
    return this.toIdea(r);
  }

  async save(d: Partial<Idea> & Record<string, any>): Promise<Idea> {
    const id = Number(d.id) || 0;
    const cur = id ? await this.get(id) : null;
    const pick = (k: keyof Idea, alt?: string) => (d[k] ?? (alt ? d[alt] : undefined) ?? cur?.[k] ?? '') as string;
    const v = {
      title: txt(pick('title')), topic: txt(pick('topic')), note: longTxt(pick('note')), url: txt(pick('url')), contact: txt(pick('contact')),
      owner: txt(pick('owner')), when_relevant: txt(pick('whenRelevant', 'when_relevant')), remind_on: txt(pick('remindOn', 'remind_on')),
      status: (IDEA_STATUS.includes(pick('status') as IdeaStatus) ? pick('status') : 'open') as IdeaStatus,
    };
    if (!v.title) throw new HttpError(400, 'Podaj, czego to dotyczy (title).');
    if (v.remind_on && !isIsoDay(v.remind_on)) throw new HttpError(400, 'Zła data przypomnienia (yyyy-MM-dd).');
    const now = nowIso();
    if (cur) {
      // a new reminder date makes it come back even if it was shown recently
      const shown = v.remind_on !== cur.remindOn ? '' : cur.lastShown;
      await this.db.run(`UPDATE crm.ideas SET title=?, topic=?, note=?, url=?, contact=?, owner=?, when_relevant=?, remind_on=?, status=?, last_shown=?, updated_at=? WHERE id = ?`,
        [v.title, v.topic, v.note, v.url, v.contact, v.owner, v.when_relevant, v.remind_on, v.status, shown, now, id]);
      return this.get(id);
    }
    const r = await this.db.get(`INSERT INTO crm.ideas (title, topic, note, url, contact, owner, when_relevant, remind_on, status, last_shown, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [v.title, v.topic, v.note, v.url, v.contact, v.owner, v.when_relevant, v.remind_on, v.status, this.today(), now, now]);
    return this.get(Number(r!.id));
  }

  async remove(id: number) {
    if (!(await this.db.run('DELETE FROM crm.ideas WHERE id = ?', [id]))) throw new HttpError(404, `Nie ma pozycji ${id}.`);
    return { ok: true };
  }

  /** Open ideas whose words meet the query (topic, title, note, when it is useful). */
  async match(query: string, limit = 5): Promise<Idea[]> {
    const q = words(query);
    if (!q.length) return [];
    const open = await this.list(false);
    return open.map((i) => {
      const hay = searchKey(`${i.title} ${i.topic} ${i.note} ${i.whenRelevant} ${i.owner}`);
      return { i, n: q.filter((w) => hay.includes(w)).length };
    }).filter((x) => x.n).sort((a, b) => b.n - a.n).slice(0, limit).map((x) => x.i);
  }

  /** Reminder dates that have come. */
  async due(): Promise<Idea[]> {
    return (await this.list(false)).filter((i) => i.remindOn && i.remindOn <= this.today());
  }

  /**
   * One idea to mention in passing, so the list is not forgotten: open, without a reminder date (those come on their day),
   * not shown for three weeks — the one waiting longest. Marked as shown.
   */
  async nudge(): Promise<Idea | null> {
    const t = this.today();
    const pick = (await this.list(false))
      .filter((i) => !i.remindOn && (!i.lastShown || i.lastShown <= addDays(t, -REST_DAYS)))
      .sort((a, b) => (a.lastShown || '').localeCompare(b.lastShown || ''))[0];
    if (!pick) return null;
    await this.db.run('UPDATE crm.ideas SET last_shown = ? WHERE id = ?', [t, pick.id]);
    return pick;
  }

  async shown(ids: number[]) {
    for (const id of ids) await this.db.run('UPDATE crm.ideas SET last_shown = ? WHERE id = ?', [this.today(), id]);
  }

  /** Compact form for Claude. */
  static brief(i: Idea) {
    return {
      id: i.id, title: i.title, topic: i.topic || undefined, note: i.note || undefined, url: i.url || undefined, contact: i.contact || undefined,
      owner: i.owner || undefined, when_relevant: i.whenRelevant || undefined, remind_on: i.remindOn || undefined,
      status: i.status === 'open' ? undefined : IDEA_STATUS_LABEL[i.status], saved: i.createdAt.slice(0, 10),
    };
  }
}
