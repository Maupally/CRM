/**
 * B2C progress: goals with a target and a running count, plus a log of every change — so it is clear
 * what is left and how much got done this week. Standalone for now (not wired to the B2C CRM).
 */
import type { DB, Row } from './db.js';
import { nowIso } from './db.js';
import { HttpError } from './crm.js';
import { addDays, longTxt, txt, isIsoDay, type B2cItem, type B2cLog } from '../shared/domain.js';

const int = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : 0; };

export class B2c {
  constructor(private db: DB, private today: () => string) {}

  private toItem(r: Row): B2cItem {
    return {
      id: Number(r.id), title: r.title, category: r.category, target: Number(r.target), done: Number(r.done), unit: r.unit,
      due: r.due, notes: r.notes, updatedAt: r.updated_at, week: Number(r.week) || 0,
    };
  }

  private sql(where = '') {
    return `SELECT i.*, COALESCE((SELECT SUM(l.delta) FROM crm.b2c_log l WHERE l.item_id = i.id AND l.day > ?), 0) AS week
      FROM crm.b2c_items i ${where} ORDER BY i.category, i.due = '', i.due, i.title`;
  }

  async list(): Promise<B2cItem[]> {
    return (await this.db.all(this.sql(), [addDays(this.today(), -7)])).map((r) => this.toItem(r));
  }

  async get(id: number): Promise<B2cItem> {
    const r = await this.db.get(this.sql('WHERE i.id = ?'), [addDays(this.today(), -7), id]);
    if (!r) throw new HttpError(404, `Nie ma pozycji B2C ${id}.`);
    return this.toItem(r);
  }

  /** Finds an item by id or by (part of) its title — for the assistant. */
  async find(ref: unknown): Promise<B2cItem> {
    const id = Number(ref);
    if (id) return this.get(id);
    const k = txt(ref).toLowerCase();
    const all = await this.list();
    const hit = all.find((i) => i.title.toLowerCase() === k) || all.find((i) => i.title.toLowerCase().includes(k));
    if (!k || !hit) throw new HttpError(404, `Nie ma w B2C pozycji „${txt(ref)}”. Są: ${all.map((i) => i.title).join(', ') || 'brak'}.`);
    return hit;
  }

  async save(d: Partial<B2cItem>): Promise<B2cItem> {
    const id = Number(d.id) || 0;
    const cur = id ? await this.get(id) : null;
    const v = {
      title: txt(d.title ?? cur?.title), category: txt(d.category ?? cur?.category), target: Math.max(0, int(d.target ?? cur?.target)),
      unit: txt(d.unit ?? cur?.unit), due: txt(d.due ?? cur?.due), notes: longTxt(d.notes ?? cur?.notes),
    };
    if (!v.title) throw new HttpError(400, 'Podaj nazwę.');
    if (v.due && !isIsoDay(v.due)) throw new HttpError(400, 'Zła data (yyyy-MM-dd).');
    const now = nowIso();
    if (cur) {
      await this.db.run('UPDATE crm.b2c_items SET title=?, category=?, target=?, unit=?, due=?, notes=?, updated_at=? WHERE id = ?',
        [v.title, v.category, v.target, v.unit, v.due, v.notes, now, id]);
      if (d.done !== undefined && int(d.done) !== cur.done) await this.progress(id, int(d.done) - cur.done, 'Poprawione ręcznie');
      return this.get(id);
    }
    const r = await this.db.get(`INSERT INTO crm.b2c_items (title, category, target, unit, due, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`, [v.title, v.category, v.target, v.unit, v.due, v.notes, now, now]);
    const nid = Number(r!.id);
    if (int(d.done)) await this.progress(nid, int(d.done), 'Stan początkowy');
    return this.get(nid);
  }

  async remove(id: number) {
    if (!(await this.db.run('DELETE FROM crm.b2c_items WHERE id = ?', [id]))) throw new HttpError(404, `Nie ma pozycji B2C ${id}.`);
    await this.db.run('DELETE FROM crm.b2c_log WHERE item_id = ?', [id]);
    return { ok: true };
  }

  /** Adds (or with a negative number takes back) done units; never below zero. */
  async progress(id: number, delta: number, note = '', day = this.today()): Promise<B2cItem> {
    const cur = await this.get(id);
    const d = Math.max(-cur.done, int(delta));
    if (!d) return cur;
    await this.db.run('UPDATE crm.b2c_items SET done = done + ?, updated_at = ? WHERE id = ?', [d, nowIso(), id]);
    await this.db.run('INSERT INTO crm.b2c_log (item_id, delta, note, day, at) VALUES (?, ?, ?, ?, ?)',
      [id, d, txt(note).slice(0, 500), isIsoDay(day) ? day : this.today(), nowIso()]);
    return this.get(id);
  }

  async log(id: number, limit = 50): Promise<B2cLog[]> {
    const rows = await this.db.all('SELECT * FROM crm.b2c_log WHERE item_id = ? ORDER BY at DESC, id DESC LIMIT ?', [id, limit]);
    return rows.map((r) => ({ id: Number(r.id), itemId: Number(r.item_id), delta: Number(r.delta), note: r.note, day: r.day, at: r.at }));
  }

  /** Plain-text status for the assistant and the connector. */
  async status(): Promise<string> {
    const all = await this.list();
    if (!all.length) return 'W B2C nie ma jeszcze żadnych pozycji.';
    const t = this.today();
    return all.map((i) => {
      const left = Math.max(0, i.target - i.done);
      const pct = i.target ? Math.round((i.done / i.target) * 100) : 0;
      return `id ${i.id} · ${i.category ? `[${i.category}] ` : ''}${i.title}: ${i.done}${i.target ? `/${i.target}` : ''} ${i.unit}`.trim() +
        (i.target ? ` (${pct}%, zostało ${left})` : '') + (i.week ? `, w 7 dni +${i.week}` : '') +
        (i.due ? `, termin ${i.due}${i.due < t && left ? ' — PO TERMINIE' : ''}` : '');
    }).join('\n');
  }
}
