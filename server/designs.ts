/**
 * Studio: documents the user designs with the assistant — web pages, slide decks, email templates.
 * Each keeps its versions (full single-file HTML) and the conversation that shaped it.
 */
import type { DB, Row } from './db.js';
import { nowIso } from './db.js';
import { HttpError } from './crm.js';
import type { Knowledge } from './knowledge.js';
import {
  DESIGN_KINDS, txt, type Design, type DesignKind, type DesignMessage, type DesignSummary, type DesignVersion,
} from '../shared/domain.js';

const MAX_VERSIONS = 20;
const MAX_CHAT = 60;

const parse = <T>(raw: unknown, fallback: T): T => { try { return JSON.parse(String(raw)) as T; } catch { return fallback; } };

export class Designs {
  constructor(private db: DB) {}

  private toDesign(r: Row): Design & { containerId: string } {
    return {
      id: Number(r.id), title: r.title, kind: r.kind as DesignKind,
      versions: parse<DesignVersion[]>(r.versions, []), chat: parse<DesignMessage[]>(r.chat, []),
      updatedAt: r.updated_at, containerId: r.container_id || '',
    };
  }

  async list(): Promise<DesignSummary[]> {
    const rows = await this.db.all('SELECT id, title, kind, versions, updated_at FROM crm.designs ORDER BY updated_at DESC');
    return rows.map((r) => ({ id: Number(r.id), title: r.title, kind: r.kind, versions: parse<unknown[]>(r.versions, []).length, updatedAt: r.updated_at }));
  }

  async get(id: number) {
    const r = await this.db.get('SELECT * FROM crm.designs WHERE id = ?', [id]);
    if (!r) throw new HttpError(404, `Nie ma projektu ${id} w Studio.`);
    return this.toDesign(r);
  }

  async create(d: { title?: string; kind?: string; html?: string; note?: string }) {
    const kind = (DESIGN_KINDS as readonly string[]).includes(String(d.kind)) ? String(d.kind) : 'www';
    const now = nowIso();
    const versions: DesignVersion[] = d.html ? [{ html: d.html, note: d.note || 'Start', at: now }] : [];
    const r = await this.db.get(`INSERT INTO crm.designs (title, kind, versions, chat, created_at, updated_at)
      VALUES (?, ?, ?, '[]', ?, ?) RETURNING id`, [txt(d.title) || 'Bez tytułu', kind, JSON.stringify(versions), now, now]);
    return this.get(Number(r!.id));
  }

  /** Starts a design from a knowledge-base HTML file (an artifact moved over from Claude, a generated page). */
  async fromKnowledge(kb: Knowledge, id: number, kind?: string) {
    const item = await kb.get(id);
    const f = await kb.file(id);
    if (!/html/.test(f.mime)) throw new HttpError(400, 'W Studio otworzysz tylko plik HTML.');
    return this.create({ title: item.title, kind: kind || 'www', html: new TextDecoder().decode(f.data), note: `Z Bazy wiedzy: ${item.title}` });
  }

  async update(id: number, d: { title?: string; kind?: string }) {
    await this.get(id);
    if (d.title !== undefined) await this.db.run('UPDATE crm.designs SET title = ? WHERE id = ?', [txt(d.title) || 'Bez tytułu', id]);
    if (d.kind !== undefined && (DESIGN_KINDS as readonly string[]).includes(d.kind)) await this.db.run('UPDATE crm.designs SET kind = ? WHERE id = ?', [d.kind, id]);
    return this.get(id);
  }

  async remove(id: number) {
    if (!(await this.db.run('DELETE FROM crm.designs WHERE id = ?', [id]))) throw new HttpError(404, `Nie ma projektu ${id}.`);
    return { ok: true };
  }

  /** Saves a turn: the messages, maybe a new version and title, and the sandbox container for the next turn. */
  async saveTurn(id: number, t: { messages: DesignMessage[]; html?: string; note?: string; title?: string; containerId?: string }) {
    const d = await this.get(id);
    const versions = t.html ? [...d.versions, { html: t.html, note: t.note || '', at: nowIso() }].slice(-MAX_VERSIONS) : d.versions;
    const chat = [...d.chat, ...t.messages].slice(-MAX_CHAT);
    await this.db.run(`UPDATE crm.designs SET versions = ?, chat = ?, title = ?, container_id = ?, updated_at = ? WHERE id = ?`,
      [JSON.stringify(versions), JSON.stringify(chat), txt(t.title) || d.title, t.containerId ?? d.containerId, nowIso(), id]);
    return this.get(id);
  }

  /** Brings an older version back as the newest one. */
  async restore(id: number, index: number) {
    const d = await this.get(id);
    const v = d.versions[index];
    if (!v) throw new HttpError(404, 'Nie ma takiej wersji.');
    return this.saveTurn(id, { messages: [], html: v.html, note: `Przywrócono wersję ${index + 1}` });
  }

  /** The HTML with kb://ID image references turned into inline data, so pictures from the knowledge base show up. */
  async render(kb: Knowledge, id: number, version?: number) {
    const d = await this.get(id);
    const v = version !== undefined && d.versions[version] ? d.versions[version] : d.versions[d.versions.length - 1];
    if (!v) return { title: d.title, html: '<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;color:#667;display:grid;place-items:center;height:90vh">Napisz w czacie, co mam przygotować.</body>' };
    const ids = [...new Set([...v.html.matchAll(/kb:\/\/(\d+)/g)].map((m) => Number(m[1])))];
    let html = v.html;
    for (const kid of ids.slice(0, 20)) {
      const f = await kb.file(kid).catch(() => null);
      if (!f || !/^image\//.test(f.mime) || f.data.length > 3_000_000) continue;
      html = html.split(`kb://${kid}`).join(`data:${f.mime};base64,${Buffer.from(f.data).toString('base64')}`);
    }
    return { title: d.title, html };
  }
}
