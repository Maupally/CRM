/**
 * The story of a project: an e-mail thread pasted in (Ctrl+A, Ctrl+C from the mail) becomes a few dated lines —
 * who wrote, which way, what it said — under a company, an event or a topic. Pasting the same thread again later
 * adds only the new messages, so the story grows as the conversation goes on. Only short summaries are kept,
 * never whole mails.
 */
import type { Crm } from './crm.js';
import { nowIso } from './db.js';
import { HttpError } from './crm.js';
import { addDays, isIsoDay, longTxt, txt, type StoryDirection, type StoryItem } from '../shared/domain.js';

export interface StoryDraft { day: string; who: string; direction: StoryDirection; text: string }
export interface StoryTarget { leadId?: string; eventId?: string; topic?: string }
export interface ParsedThread { subject: string; items: StoryDraft[]; emails: string[]; tasks?: { task: string; due?: string }[] }

const MAX_TEXT = 600;
const short = (s: string, n = MAX_TEXT) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/* ------------------------------------------------------------ parsing a pasted thread (no AI) */

const MONTHS: Record<string, number> = {
  sty: 1, jan: 1, lut: 2, feb: 2, mar: 3, kwi: 4, apr: 4, maj: 5, may: 5, cze: 6, jun: 6, lip: 7, jul: 7, sie: 8, aug: 8,
  wrz: 9, sep: 9, paz: 10, 'paź': 10, oct: 10, lis: 11, nov: 11, gru: 12, dec: 12,
};
const pad = (n: number) => String(n).padStart(2, '0');

/** A date somewhere in a header line: 2026-10-20, 20.10.2026, „20 paź 2026”, „Oct 20, 2026”, „wt., 20 paź, 15:15”. */
export function findDate(line: string, today: string): string {
  const l = line.toLowerCase();
  let m = l.match(/\b(20\d\d)-(\d\d)-(\d\d)\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = l.match(/\b(\d{1,2})[./](\d{1,2})[./](20\d\d|\d\d)\b/);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  const mon = (w: string) => MONTHS[w.slice(0, 3)] || MONTHS[w.slice(0, 3).normalize('NFD').replace(/[̀-ͯ]/g, '')];
  const withYear = (d: number, mo: number, y?: string) => {
    if (!mo || !d || d > 31) return '';
    if (y) return `${y}-${pad(mo)}-${pad(d)}`;
    // no year (Gmail, this year): the latest such day that is not in the future
    const year = Number(today.slice(0, 4));
    const day = `${year}-${pad(mo)}-${pad(d)}`;
    return day > today ? `${year - 1}-${pad(mo)}-${pad(d)}` : day;
  };
  m = l.match(/\b(\d{1,2})\s+([a-ząćęłńóśźż]{3,})\.?,?\s*(20\d\d)?/);
  if (m && mon(m[2])) return withYear(+m[1], mon(m[2]), m[3]);
  m = l.match(/\b([a-z]{3,})\.?\s+(\d{1,2}),?\s*(20\d\d)?/);
  if (m && mon(m[1])) return withYear(+m[2], mon(m[1]), m[3]);
  if (/\b(today|dzisiaj|dziś)\b/.test(l) || /\b\d{1,2}:\d\d\b/.test(l) && /(ago|temu)/.test(l)) return today;
  return '';
}

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const HEADER = /^(from|od|nadawca)\s*:/i;
const GMAIL_SENDER = /^[^<>:]{2,80}<[\w.+-]+@[\w-]+\.[\w.-]+>\s*$/;
const META = /^(to|do|cc|dw|bcc|udw|sent|wysłano|date|data|subject|temat|reply-to|odpowiedz do)\s*:|^(to me|do mnie|to: me|me)$|^(do|to)\s+(mnie|me)\b|^(inbox|odebrane|skrzynka odbiorcza)$/i;
const QUOTE = /^(on .{3,120} wrote:|w dniu .{3,160} napisał[a]?\(?a?\)?:?|.{3,120} napisał\(a\):|-{3,}\s*(original message|wiadomość oryginalna|forwarded message|przekazana wiadomość)|_{5,})/i;

/** Splits a pasted conversation into messages: who, when, which way and the first part of what they wrote. */
export function parseThread(raw: string, today: string, ownMail: (email: string) => boolean = (e) => /maplebear/i.test(e)): ParsedThread {
  const text = raw.replace(/\r/g, '').replace(/ /g, ' ');
  const lines = text.split('\n').map((l) => l.trim());
  const emails = [...new Set((text.match(EMAIL) || []).map((e) => e.toLowerCase()))];
  const subjectLine = lines.find((l) => /^(subject|temat)\s*:/i.test(l));
  const starts: number[] = [];
  lines.forEach((l, i) => { if (HEADER.test(l) || GMAIL_SENDER.test(l)) starts.push(i); });
  const subject = short((subjectLine ? subjectLine.replace(/^(subject|temat)\s*:\s*/i, '') : lines.find((l) => l && !HEADER.test(l) && !GMAIL_SENDER.test(l)) || '')
    .replace(/^(re|odp|fwd|pd|fw)\s*:\s*/gi, ''), 140);
  const segments = starts.length ? starts.map((s, k) => lines.slice(s, starts[k + 1] ?? lines.length)) : [lines];

  let lastDay = '';
  const items: StoryDraft[] = [];
  for (const seg of segments) {
    const head = seg[0] || '';
    const sender = head.replace(HEADER, '').trim();
    const mail = (sender.match(EMAIL) || [''])[0].toLowerCase();
    const who = short(sender.replace(/<[^>]*>/g, '').replace(/["']/g, '').trim() || mail, 80);
    let day = '';
    const body: string[] = [];
    let inHead = true;
    for (const l of seg.slice(starts.length ? 1 : 0)) {
      if (inHead && (!l || META.test(l) || (!day && (day = findDate(l, today)) && l.length < 80))) continue;
      inHead = false;
      if (QUOTE.test(l) || HEADER.test(l)) break;
      if (l.startsWith('>')) continue;
      body.push(l);
    }
    const t = short(body.filter(Boolean).join(' '));
    if (!t && !who) continue;
    day = day || lastDay || today;
    lastDay = day;
    items.push({ day, who, direction: mail && ownMail(mail) ? 'out' : starts.length ? 'in' : 'note', text: t });
  }
  return { subject, items, emails };
}

/* ------------------------------------------------------------ storage */

const DIRS: StoryDirection[] = ['in', 'out', 'note'];

export class Stories {
  constructor(private crm: Crm) {}

  private toItem(r: any): StoryItem {
    return {
      id: Number(r.id), leadId: r.lead_id, eventId: r.event_id, topic: r.topic, thread: r.thread, day: r.day, who: r.who,
      direction: r.direction, text: r.text, createdAt: r.created_at, company: r.company || undefined, eventTitle: r.event_title || undefined,
    };
  }

  async list(t: StoryTarget = {}): Promise<StoryItem[]> {
    const where: string[] = [];
    const args: string[] = [];
    if (t.leadId) { where.push('s.lead_id = ?'); args.push(t.leadId); }
    if (t.eventId) { where.push('s.event_id = ?'); args.push(t.eventId); }
    if (t.topic) { where.push('s.topic = ?'); args.push(t.topic); }
    const rows = await this.crm.db.all(`SELECT s.*, l.company, e.title AS event_title FROM crm.story s
      LEFT JOIN crm.leads l ON l.id = s.lead_id LEFT JOIN crm.events e ON e.id = s.event_id
      ${where.length ? `WHERE ${where.join(' OR ')}` : ''} ORDER BY s.day, s.id LIMIT 3000`, args);
    return rows.map((r) => this.toItem(r));
  }

  /**
   * Adds a thread's messages to the story. A thread pasted again adds only what is new: per (thread, day, sender)
   * the messages already stored are skipped, so the same conversation can be pasted after every reply.
   */
  async add(target: StoryTarget, thread: string, drafts: Partial<StoryDraft>[]): Promise<{ added: number; skipped: number; items: StoryItem[] }> {
    const leadId = txt(target.leadId);
    const eventId = txt(target.eventId);
    const topic = txt(target.topic);
    if (!leadId && !eventId && !topic) throw new HttpError(400, 'Wybierz, do czego to należy: firma, wydarzenie albo temat.');
    if (leadId && !(await this.crm.db.get('SELECT 1 AS x FROM crm.leads WHERE id = ?', [leadId]))) throw new HttpError(404, `Nie ma firmy ${leadId}.`);
    if (eventId && !(await this.crm.db.get('SELECT 1 AS x FROM crm.events WHERE id = ?', [eventId]))) throw new HttpError(404, `Nie ma wydarzenia ${eventId}.`);
    const th = short(txt(thread), 140);
    const today = this.crm.today();
    const clean = drafts.map((d) => ({
      day: isIsoDay(d.day) && d.day! <= addDays(today, 1) ? d.day! : today,
      who: short(txt(d.who), 80),
      direction: (DIRS.includes(d.direction as StoryDirection) ? d.direction : 'in') as StoryDirection,
      text: short(longTxt(d.text)),
    })).filter((d) => d.text || d.who);
    if (!clean.length) throw new HttpError(400, 'Nie znalazłem w tym tekście żadnej wiadomości.');
    const have = await this.crm.db.all(`SELECT day, who FROM crm.story WHERE lead_id = ? AND event_id = ? AND topic = ? AND thread = ?`, [leadId, eventId, topic, th]);
    const count = new Map<string, number>();
    for (const h of have) { const k = `${h.day}|${String(h.who).toLowerCase()}`; count.set(k, (count.get(k) || 0) + 1); }
    let added = 0;
    const now = nowIso();
    for (const d of clean.sort((a, b) => a.day.localeCompare(b.day))) {
      const k = `${d.day}|${d.who.toLowerCase()}`;
      const left = count.get(k) || 0;
      if (left > 0) { count.set(k, left - 1); continue; }
      await this.crm.db.run(`INSERT INTO crm.story (lead_id, event_id, topic, thread, day, who, direction, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [leadId, eventId, topic, th, d.day, d.who, d.direction, d.text, now]);
      added++;
    }
    return { added, skipped: clean.length - added, items: await this.list({ leadId, eventId, topic }) };
  }

  async remove(id: number) {
    await this.crm.db.run('DELETE FROM crm.story WHERE id = ?', [id]);
    return { ok: true };
  }

  /** Which companies the thread is with — by the e-mail addresses (or their company domain) in it. */
  async companiesFor(emails: string[]): Promise<{ id: string; company: string }[]> {
    const free = /@(gmail|googlemail|wp|o2|onet|interia|op|yahoo|outlook|hotmail|icloud|poczta)\./i;
    const out = new Map<string, string>();
    const leads = await this.crm.listLeads();
    for (const e of emails) {
      if (/maplebear/i.test(e)) continue;
      const dom = free.test(e) ? '' : e.split('@')[1];
      for (const l of leads) {
        const le = (l.email || '').toLowerCase();
        if (le && (le.includes(e) || (dom && le.endsWith(`@${dom}`)))) out.set(l.id, l.company);
      }
    }
    return [...out].slice(0, 5).map(([id, company]) => ({ id, company }));
  }
}
