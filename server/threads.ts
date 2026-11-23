/**
 * Chats: conversations brought over from Claude plus new ones started in Opal5. The assistant reads them
 * for context and style, and files what it writes into the right one — so a mail written from the mic
 * shows up in the B2B chat too.
 */
import type { DB, Row } from './db.js';
import { nowIso } from './db.js';
import { HttpError } from './crm.js';
import { THREAD_MODES, longTxt, txt, type Thread, type ThreadMessage, type ThreadMode, type ThreadSummary } from '../shared/domain.js';

const MAX_MESSAGES = 600;
const MAX_CHARS = 400_000;

const parse = (raw: unknown): ThreadMessage[] => { try { const v = JSON.parse(String(raw)); return Array.isArray(v) ? v : []; } catch { return []; } };
const mode = (m: unknown): ThreadMode => ((THREAD_MODES as readonly string[]).includes(String(m)) ? m as ThreadMode : 'other');

/** Keeps the newest messages within the size budget. */
function trim(msgs: ThreadMessage[]): ThreadMessage[] {
  let out = msgs.slice(-MAX_MESSAGES);
  let size = out.reduce((n, m) => n + m.text.length, 0);
  while (size > MAX_CHARS && out.length > 2) { size -= out[0].text.length; out = out.slice(1); }
  return out;
}

const clean = (m: Partial<ThreadMessage>): ThreadMessage => ({
  role: m.role === 'assistant' ? 'assistant' : 'user', text: longTxt(m.text).slice(0, 60_000), at: txt(m.at) || nowIso(),
  ...(m.via ? { via: m.via } : {}),
});

/** A first guess at what a chat is for, from its name. */
export function guessMode(title: string): ThreadMode {
  if (/b2b|firm|partner|biznes|sponsor|multisport|oferta dla/i.test(title)) return 'b2b';
  if (/conversation|rozmow|rodzic|parent|nauczyc|teacher|zesp/i.test(title)) return 'casual';
  return 'other';
}

export class Threads {
  constructor(private db: DB) {}

  private toThread(r: Row): Thread {
    return { id: Number(r.id), title: r.title, mode: mode(r.mode), source: r.source === 'claude' ? 'claude' : 'opal', messages: parse(r.messages), updatedAt: r.updated_at };
  }

  async list(): Promise<ThreadSummary[]> {
    const rows = await this.db.all('SELECT * FROM crm.threads ORDER BY updated_at DESC');
    return rows.map((r) => {
      const msgs = parse(r.messages);
      const last = msgs[msgs.length - 1]?.text || '';
      return { id: Number(r.id), title: r.title, mode: mode(r.mode), source: r.source, count: msgs.length, last: last.slice(0, 140), updatedAt: r.updated_at };
    });
  }

  async get(id: number): Promise<Thread> {
    const r = await this.db.get('SELECT * FROM crm.threads WHERE id = ?', [id]);
    if (!r) throw new HttpError(404, `Nie ma czatu ${id}.`);
    return this.toThread(r);
  }

  async create(d: { title?: string; mode?: string; source?: string; messages?: Partial<ThreadMessage>[]; updatedAt?: string }) {
    const title = txt(d.title) || 'Nowy czat';
    const now = nowIso();
    const msgs = trim((d.messages || []).filter((m) => txt(m?.text)).map(clean));
    const r = await this.db.get(`INSERT INTO crm.threads (title, mode, source, messages, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?) RETURNING id`, [title, d.mode ? mode(d.mode) : guessMode(title), d.source === 'claude' ? 'claude' : 'opal',
      JSON.stringify(msgs), now, txt(d.updatedAt) || now]);
    return this.get(Number(r!.id));
  }

  async update(id: number, d: { title?: string; mode?: string }) {
    await this.get(id);
    if (d.title !== undefined) await this.db.run('UPDATE crm.threads SET title = ? WHERE id = ?', [txt(d.title) || 'Bez tytułu', id]);
    if (d.mode !== undefined) await this.db.run('UPDATE crm.threads SET mode = ? WHERE id = ?', [mode(d.mode), id]);
    return this.get(id);
  }

  async remove(id: number) {
    if (!(await this.db.run('DELETE FROM crm.threads WHERE id = ?', [id]))) throw new HttpError(404, `Nie ma czatu ${id}.`);
    return { ok: true };
  }

  async append(id: number, msgs: Partial<ThreadMessage>[]) {
    const t = await this.get(id);
    const all = trim([...t.messages, ...msgs.filter((m) => txt(m?.text)).map(clean)]);
    await this.db.run('UPDATE crm.threads SET messages = ?, updated_at = ? WHERE id = ?', [JSON.stringify(all), nowIso(), id]);
    return this.get(id);
  }

  /** The newest part of a chat as plain text, for the assistant. */
  async excerpt(id: number, chars = 30_000) {
    const t = await this.get(id);
    let text = t.messages.map((m) => `${m.role === 'user' ? 'Ja' : 'Asystent'}: ${m.text}`).join('\n\n');
    if (text.length > chars) text = '…\n' + text.slice(-chars);
    return { title: t.title, mode: t.mode, text };
  }
}
