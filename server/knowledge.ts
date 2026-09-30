/**
 * Knowledge base: files (posters, PDFs, Word documents) and notes that the assistant can
 * search, read and attach to tasks and emails. Files live in the database — the set is
 * small (tens of documents), and it keeps the deployment to one moving part.
 */
import type { DB, Row } from './db.js';
import { nowIso } from './db.js';
import { HttpError } from './crm.js';
import { searchKey, txt, longTxt, type KnowledgeItem } from '../shared/domain.js';

export const MAX_FILE = 4 * 1024 * 1024;     // Vercel caps a request body at 4.5 MB
const MAX_TEXT = 200_000;

export interface NewKnowledge {
  title?: string;
  filename?: string;
  mime?: string;
  data?: Uint8Array | null;
  text?: string;
  description?: string;
  tags?: string;
}

/** Pulls plain text out of PDFs, Word files and text files. Images return ''. */
export async function extractText(mime: string, filename: string, data: Uint8Array): Promise<string> {
  const name = filename.toLowerCase();
  try {
    if (mime === 'application/pdf' || name.endsWith('.pdf')) {
      const { extractText: pdf, getDocumentProxy } = await import('unpdf');
      const doc = await getDocumentProxy(new Uint8Array(data));
      const { text } = await pdf(doc, { mergePages: true });
      return longTxt(Array.isArray(text) ? text.join('\n') : text);
    }
    if (name.endsWith('.docx') || mime.includes('wordprocessingml')) {
      const mammoth = (await import('mammoth')).default;
      const { value } = await mammoth.extractRawText({ buffer: Buffer.from(data) });
      return longTxt(value);
    }
    if (mime.startsWith('text/') || /\.(txt|md|csv|html?)$/.test(name)) {
      return longTxt(new TextDecoder().decode(data));
    }
  } catch (e) {
    console.warn('text extraction failed for', filename, e);
  }
  return '';
}

export class Knowledge {
  constructor(private db: DB) {}

  private toItem(r: Row): KnowledgeItem {
    return {
      id: Number(r.id), title: r.title, filename: r.filename, mime: r.mime, size: Number(r.size),
      description: r.description, tags: r.tags, createdAt: r.created_at,
      hasFile: !!r.has_file, textLength: Number(r.text_length) || 0,
    };
  }

  private static COLS = `id, title, filename, mime, size, description, tags, created_at,
    content IS NOT NULL AS has_file, length(text) AS text_length`;

  async list(): Promise<KnowledgeItem[]> {
    return (await this.db.all(`SELECT ${Knowledge.COLS} FROM crm.knowledge ORDER BY created_at DESC`)).map((r) => this.toItem(r));
  }

  async get(id: number): Promise<KnowledgeItem & { text: string }> {
    const r = await this.db.get(`SELECT ${Knowledge.COLS}, text FROM crm.knowledge WHERE id = ?`, [id]);
    if (!r) throw new HttpError(404, `Nie ma materiału ${id} w bazie wiedzy.`);
    return { ...this.toItem(r), text: r.text };
  }

  async file(id: number): Promise<{ filename: string; mime: string; data: Uint8Array }> {
    const r = await this.db.get('SELECT filename, mime, content FROM crm.knowledge WHERE id = ?', [id]);
    if (!r || !r.content) throw new HttpError(404, 'Ten materiał nie ma pliku.');
    return { filename: r.filename || `plik-${id}`, mime: r.mime || 'application/octet-stream', data: new Uint8Array(r.content) };
  }

  async add(d: NewKnowledge): Promise<KnowledgeItem> {
    const data = d.data && d.data.length ? d.data : null;
    if (data && data.length > MAX_FILE) throw new HttpError(400, 'Plik jest za duży (maks. 4 MB). Zmniejsz go albo podziel.');
    const filename = txt(d.filename);
    const mime = txt(d.mime) || (data ? 'application/octet-stream' : 'text/plain');
    let text = longTxt(d.text);
    if (!text && data) text = await extractText(mime, filename, data);
    const title = txt(d.title) || filename.replace(/\.[a-z0-9]+$/i, '') || text.slice(0, 60) || 'Bez tytułu';
    if (!data && !text) throw new HttpError(400, 'Dodaj plik albo tekst.');
    const r = await this.db.get(`INSERT INTO crm.knowledge (title, filename, mime, size, content, text, description, tags, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [title, filename, mime, data?.length || 0, data, text.slice(0, MAX_TEXT), longTxt(d.description), txt(d.tags), nowIso()]);
    return (await this.list()).find((k) => k.id === Number(r!.id))!;
  }

  async update(id: number, d: { title?: string; description?: string; tags?: string; text?: string }) {
    await this.get(id);
    const set: Record<string, string> = {};
    if (d.title !== undefined) set.title = txt(d.title) || 'Bez tytułu';
    if (d.description !== undefined) set.description = longTxt(d.description);
    if (d.tags !== undefined) set.tags = txt(d.tags);
    if (d.text !== undefined) set.text = longTxt(d.text).slice(0, MAX_TEXT);
    const keys = Object.keys(set);
    if (keys.length) await this.db.run(`UPDATE crm.knowledge SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => set[k]), id]);
    return this.get(id);
  }

  async remove(id: number) {
    if (!(await this.db.run('DELETE FROM crm.knowledge WHERE id = ?', [id]))) throw new HttpError(404, `Nie ma materiału ${id}.`);
    return { ok: true };
  }

  /** Word-overlap search over title, tags, description and text, with a snippet around the best hit. */
  async search(query: string, limit = 8) {
    const words = searchKey(query).split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
    const rows = await this.db.all(`SELECT ${Knowledge.COLS}, text FROM crm.knowledge`);
    const scored = rows.map((r) => {
      const head = searchKey(`${r.title} ${r.tags} ${r.description} ${r.filename}`);
      const body = searchKey(r.text);
      let score = 0, at = -1;
      for (const w of words) {
        if (head.includes(w)) score += 5;
        const i = body.indexOf(w);
        if (i > -1) { score += 1 + Math.min(4, body.split(w).length - 1); if (at < 0) at = i; }
      }
      const start = Math.max(0, at - 200);
      return { r, score, snippet: at > -1 ? String(r.text).slice(start, start + 600) : String(r.text).slice(0, 300) };
    });
    const hits = words.length ? scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score) : scored;
    return hits.slice(0, limit).map(({ r, snippet }) => ({ ...this.toItem(r), snippet }));
  }
}
