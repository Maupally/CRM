/**
 * Sending email from the CRM through Resend (the same service Dolimatch uses).
 * Needs RESEND_API_KEY and MAIL_FROM ("Martin <martin@twojadomena.pl>", on a domain verified
 * in Resend). Without them nothing is sent — the UI falls back to copying addresses and text.
 */
import type { DB } from './db.js';
import { nowIso } from './db.js';
import type { Crm } from './crm.js';
import type { Knowledge } from './knowledge.js';
import { HttpError } from './crm.js';
import { fillTemplate, longTxt, normEmail, txt } from '../shared/domain.js';

export const mailEnabled = () => !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
const MAX_RECIPIENTS = 200;

export interface Campaign {
  campaign: string;              // a name; the same name never goes twice to one address
  leadIds: string[];
  subject: string;
  body: string;                  // may contain [Firma] [Miasto] [Osoba]
  attachments?: number[];        // knowledge ids
}

function toHtml(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const linked = esc.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#0E1726">${linked
    .split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')}</div>`;
}

export async function sendCampaign(db: DB, crm: Crm, kb: Knowledge, c: Campaign) {
  if (!mailEnabled()) throw new HttpError(503, 'Wysyłka nie jest włączona: dodaj RESEND_API_KEY i MAIL_FROM w Vercel.');
  const subject = txt(c.subject), body = longTxt(c.body), campaign = txt(c.campaign) || subject;
  if (!subject || !body) throw new HttpError(400, 'Brak tematu albo treści.');
  const ids = [...new Set(c.leadIds)].slice(0, MAX_RECIPIENTS);

  const files = await Promise.all((c.attachments || []).map((id) => kb.file(id)));
  const attachments = files.map((f) => ({ filename: f.filename, content: Buffer.from(f.data).toString('base64') }));

  const sent = new Set((await db.all('SELECT email FROM crm.sends WHERE campaign = ? AND status = ?', [campaign, 'sent']))
    .map((r) => String(r.email).toLowerCase()));
  const results: { leadId: string; email: string; ok: boolean; error?: string }[] = [];

  for (const id of ids) {
    const lead = await crm.getLead(id).catch(() => null);
    const email = lead ? normEmail(lead.email) : '';
    if (!lead || !email) { results.push({ leadId: id, email: '', ok: false, error: 'brak adresu' }); continue; }
    if (sent.has(email)) { results.push({ leadId: id, email, ok: false, error: 'już wysłane w tej kampanii' }); continue; }
    const personalBody = fillTemplate(body, lead);
    const personalSubject = fillTemplate(subject, lead);
    let ok = false, error = '';
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.MAIL_FROM, to: [email], subject: personalSubject, text: personalBody,
          html: toHtml(personalBody), reply_to: process.env.MAIL_REPLY_TO || undefined,
          attachments: attachments.length ? attachments : undefined,
        }),
      });
      ok = res.ok;
      if (!ok) error = (await res.text()).slice(0, 300);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    await db.run(`INSERT INTO crm.sends (campaign, lead_id, email, subject, status, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [campaign, id, email, personalSubject, ok ? 'sent' : 'failed', error, nowIso()]);
    if (ok) {
      sent.add(email);
      await crm.logActivity(id, { type: 'Email', result: 'done', note: `Mail (${campaign}): ${personalSubject}\n\n${personalBody}` });
    }
    results.push({ leadId: id, email, ok, error: error || undefined });
    await new Promise((r) => setTimeout(r, 150));     // stay well under Resend's rate limit
  }
  return { sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
}
