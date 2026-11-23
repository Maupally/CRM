/**
 * CALL REPORT — the weekly phone-activity report from Plus call recording (nagrywanie.plus.pl), moved over from
 * the Google Apps Script v5.0 with the same rules: people matched by recordingNumber (falling back to department
 * names), internal calls = both ends on the blacklist of own numbers, receptions count all traffic as external,
 * paging with retry on 429. Login and password come only from the environment (PLUS_REC_USER / PLUS_REC_PASSWORD).
 * People, own numbers and recipients live in settings and can be taken straight from the old script.
 */
import type { Crm } from './crm.js';
import { HttpError } from './crm.js';
import { addDays, isIsoDay, txt } from '../shared/domain.js';

export interface CallPerson { person: string; group: 'sales' | 'admin'; recordingNumber: string | null; departmentNames: string[]; treatAllAsExternal: boolean }
export interface CallConfig { baseUrl: string; people: CallPerson[]; blacklist: string[]; recipients: string[] }
interface Rec { recordingNumber?: string; departmentName?: string; callingUserPart?: string; calledUserPart?: string; callDirection?: string; status?: string; length?: number }

const KEY = 'callreport.config';
const DEFAULT_URL = 'https://nagrywanie.plus.pl/recordingApi/recordingsPaged/';

export const callReportReady = () => !!(process.env.PLUS_REC_USER && process.env.PLUS_REC_PASSWORD);

export async function getCallConfig(crm: Crm): Promise<CallConfig> {
  try {
    const v = JSON.parse(await crm.setting(KEY));
    return { baseUrl: v.baseUrl || DEFAULT_URL, people: v.people || [], blacklist: v.blacklist || [], recipients: v.recipients || [] };
  } catch {
    return { baseUrl: DEFAULT_URL, people: [], blacklist: [], recipients: [] };
  }
}

export async function saveCallConfig(crm: Crm, c: Partial<CallConfig>): Promise<CallConfig> {
  const cur = await getCallConfig(crm);
  const people = (c.people ?? cur.people).map((p) => ({
    person: txt(p.person), group: p.group === 'admin' ? 'admin' as const : 'sales' as const,
    recordingNumber: txt(p.recordingNumber) || null, departmentNames: (p.departmentNames || []).map(txt).filter(Boolean),
    treatAllAsExternal: !!p.treatAllAsExternal,
  })).filter((p) => p.person);
  const next: CallConfig = {
    baseUrl: txt(c.baseUrl) || cur.baseUrl,
    people,
    blacklist: [...new Set((c.blacklist ?? cur.blacklist).map((n) => String(n).replace(/\D/g, '')).filter(Boolean))],
    recipients: [...new Set((c.recipients ?? cur.recipients).map((e) => txt(e).toLowerCase()).filter((e) => /@/.test(e)))],
  };
  await crm.setSetting(KEY, JSON.stringify(next));
  return next;
}

/**
 * Reads CONFIG out of the old Apps Script: people, blacklist, recipients, baseUrl. The login and password
 * in it are deliberately ignored — they belong in Vercel's environment variables.
 */
export function parseScriptConfig(script: string): Partial<CallConfig> {
  const src = script.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1');
  const block = (name: string) => {
    const i = src.search(new RegExp(`\\b${name}\\s*:\\s*\\[`));
    if (i < 0) return null;
    let depth = 0;
    const start = src.indexOf('[', i);
    for (let j = start; j < src.length; j++) {
      if (src[j] === '[') depth++;
      else if (src[j] === ']' && --depth === 0) return src.slice(start, j + 1);
    }
    return null;
  };
  const toJson = (lit: string) => JSON.parse(lit
    .replace(/'([^'\\]*)'/g, (_m, s) => JSON.stringify(s))
    .replace(/([{,]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":')
    .replace(/,\s*([}\]])/g, '$1'));
  const out: Partial<CallConfig> = {};
  const people = block('people');
  if (people) out.people = toJson(people);
  const bl = block('blacklist');
  if (bl) out.blacklist = toJson(bl);
  const rc = block('recipients');
  if (rc) out.recipients = toJson(rc);
  const url = src.match(/baseUrl\s*:\s*["']([^"']+)["']/);
  if (url) out.baseUrl = url[1];
  if (!out.people && !out.blacklist && !out.recipients) throw new HttpError(400, 'Nie znalazłem w skrypcie CONFIG (people / blacklist / recipients).');
  return out;
}

/* ------------------------------------------------------------------ the numbers, as in the script */

const cln = (n: unknown) => (n ? String(n).replace(/\D/g, '').slice(-9) : '');
const isFailed = (r: Rec) => r.status === 'FAILED';
const isInternal = (r: Rec, bl: string[]) => bl.includes(cln(r.callingUserPart)) && bl.includes(cln(r.calledUserPart));

function matchPerson(all: Rec[], p: CallPerson) {
  if (p.recordingNumber) {
    const target = cln(p.recordingNumber);
    return all.filter((r) => cln(r.recordingNumber) === target);
  }
  const names = p.departmentNames.map((n) => n.trim().toLowerCase());
  return all.filter((r) => names.includes((r.departmentName || '').trim().toLowerCase()));
}

export function computeStats(recs: Rec[], bl: string[], allExternal: boolean) {
  const real = recs.filter((r) => !isFailed(r));
  const failed = recs.length - real.length;
  const internal = real.filter((r) => isInternal(r, bl));
  const external = real.filter((r) => !isInternal(r, bl));
  const int = { total: internal.length, out: 0, in: 0, missed: 0, dur: 0, rec: 0 };
  for (const r of internal) {
    if (r.callDirection === 'MO') int.out++;
    else { int.in++; if (r.status === 'MISSED') int.missed++; }
    if (r.status === 'RECORDED') { int.rec++; int.dur += r.length || 0; }
  }
  const analyzed = allExternal ? real : external;
  const s = { total: analyzed.length, rec: 0, in: 0, out: 0, recIn: 0, recOut: 0, notRecIn: 0, notRecOut: 0, missedIn: 0, missedOut: 0, dur: 0 };
  for (const r of analyzed) {
    const out = r.callDirection === 'MO';
    if (out) s.out++; else s.in++;
    if (r.status === 'RECORDED') { s.rec++; s.dur += r.length || 0; if (out) s.recOut++; else s.recIn++; }
    else if (r.status === 'NOT_RECORDED') { if (out) s.notRecOut++; else s.notRecIn++; }
    else if (r.status === 'MISSED') { if (out) s.missedOut++; else s.missedIn++; }
  }
  const totalDurMs = s.dur + int.dur;
  const recCount = s.rec + int.rec;
  return {
    totalAll: real.length, internal: int.total, external: s.total, answered: s.rec,
    success: s.total ? +(s.rec / s.total * 100).toFixed(1) : 0,
    outTotal: s.out + int.out, inTotal: s.in + int.in, extOut: s.out, extIn: s.in, intOut: int.out, intIn: int.in,
    extOutAnswered: s.recOut + s.notRecOut, extInAnswered: s.recIn + s.notRecIn, failed,
    totalMin: +(totalDurMs / 60000).toFixed(1), avgMin: recCount ? +(totalDurMs / recCount / 60000).toFixed(1) : 0,
  };
}
export type CallStats = ReturnType<typeof computeStats>;

/** The script's week: Friday–Thursday, ending on the latest Thursday (today included). */
export function lastReportWeek(today: string) {
  let to = today;
  while (new Date(`${to}T12:00:00Z`).getUTCDay() !== 4) to = addDays(to, -1);
  return { from: addDays(to, -6), to };
}

async function fetchAll(c: CallConfig, from: string, to: string) {
  const auth = 'Basic ' + Buffer.from(`${process.env.PLUS_REC_USER}:${process.env.PLUS_REC_PASSWORD}`).toString('base64');
  const all: Rec[] = [];
  const warnings: string[] = [];
  let page = 0;
  let last = false;
  while (!last && page < 100) {
    const url = `${c.baseUrl}?size=500&page=${page}&dateFrom=${from}T00:00:00&dateTo=${to}T23:59:59`;
    let res: Response | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      res = await fetch(url, { headers: { Authorization: auth, Accept: 'application/json' } });
      if (res.status !== 429) break;
      const wait = Number(res.headers.get('retry-after')) || 2 * (attempt + 1);
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
    if (!res || res.status !== 200) {
      if (res?.status === 401 || res?.status === 403) throw new HttpError(502, 'Plus odrzucił logowanie — sprawdź PLUS_REC_USER i PLUS_REC_PASSWORD w Vercel.');
      if (page === 0) throw new HttpError(502, `API nagrywania Plusa odpowiedziało błędem ${res?.status ?? '?'}.`);
      warnings.push(`Pobieranie przerwane na stronie ${page} (błąd ${res?.status}) — dane mogą być niekompletne.`);
      break;
    }
    const json = await res.json() as { content?: Rec[]; last?: boolean };
    all.push(...(json.content || []));
    last = !!json.last;
    page++;
  }
  return { all, warnings };
}

export async function callReport(crm: Crm, opts: { from?: string; to?: string; records?: Rec[] } = {}) {
  const c = await getCallConfig(crm);
  if (!c.people.length) throw new HttpError(400, 'Brak osób w konfiguracji raportu — wklej swój skrypt w „Konfiguracja”.');
  const week = isIsoDay(opts.from) && isIsoDay(opts.to) ? { from: opts.from, to: opts.to } : lastReportWeek(crm.today());
  if (!opts.records && !callReportReady()) throw new HttpError(400, 'Brak danych logowania do nagrywania Plusa — dodaj PLUS_REC_USER i PLUS_REC_PASSWORD w Vercel (Settings → Environment Variables) i zrób Redeploy.');
  const { all, warnings } = opts.records ? { all: opts.records, warnings: [] as string[] } : await fetchAll(c, week.from, week.to);
  const bl = c.blacklist.map(cln);
  const rows = c.people.map((p) => {
    const recs = matchPerson(all, p);
    if (!recs.length) warnings.push(`0 połączeń dla „${p.person}” (${p.recordingNumber ? `numer ${p.recordingNumber}` : `działy: ${p.departmentNames.join(' | ')}`}).`);
    return { person: p.person, group: p.group, stats: computeStats(recs, bl, p.treatAllAsExternal) };
  });
  return { ...week, label: week.from, fetched: all.length, warnings, sales: rows.filter((r) => r.group === 'sales'), admin: rows.filter((r) => r.group === 'admin') };
}
export type CallReport = Awaited<ReturnType<typeof callReport>>;

/* ------------------------------------------------------------------ the e-mail, as in the script */

const chip = (v: string | number, bg: string, fg: string) =>
  `<span style="display:inline-block;min-width:28px;padding:3px 10px;border-radius:12px;background:${bg};color:${fg};font-size:12px;font-weight:700;">${v}</span>`;
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

function table(title: string, rows: CallReport['sales']) {
  const td = 'padding:9px 10px;text-align:right;border-bottom:1px solid #eee;';
  const body = rows.map((r, i) => `<tr style="background:${i % 2 ? '#fafafa' : '#ffffff'};">
      <td style="padding:9px 10px;font-size:12px;font-weight:600;color:#004d40;border-bottom:1px solid #eee;">${esc(r.person)}</td>
      <td style="${td}">${chip(r.stats.totalAll, '#e0e0e0', '#333')}</td>
      <td style="${td}">${chip(r.stats.outTotal, '#fff3e0', '#e65100')}</td>
      <td style="${td}">${chip(r.stats.inTotal, '#e8f5e9', '#2e7d32')}</td>
      <td style="${td}">${chip(r.stats.external, '#e3f2fd', '#1565c0')}</td>
      <td style="${td}">${chip(r.stats.internal, '#f3e5f5', '#6a1b9a')}</td>
      <td style="${td}">${chip(`${r.stats.totalMin.toFixed(1)} min`, '#fce4ec', '#ad1457')}</td>
      <td style="${td}">${chip(`${r.stats.avgMin.toFixed(1)} min`, '#e0f7fa', '#00838f')}</td></tr>`).join('');
  const th = (t: string, color = '#888', right = true) => `<td style="padding:6px 10px;font-size:10px;color:${color};font-weight:bold;${right ? 'text-align:right;' : ''}">${t}</td>`;
  return `<div style="max-width:640px;margin:auto;border:1px solid #ddd;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
  <div style="background:#004d40;padding:10px 16px;"><h3 style="margin:0;font-size:13px;letter-spacing:1.5px;text-transform:uppercase;color:#fff;">${title}</h3></div>
  <table width="100%" cellspacing="0" cellpadding="0"><tr style="background:#f5f5f5;">${th('Osoba', '#888', false)}${th('Wszystkie')}${th('Wychodzące', '#e65100')}${th('Przychodzące', '#2e7d32')}${th('Zewnętrzne', '#1565c0')}${th('Wewnętrzne', '#6a1b9a')}${th('Łączny czas', '#ad1457')}${th('Śr. czas', '#00838f')}</tr>${body}</table></div>`;
}

export function callReportHtml(r: CallReport, generatedAt: string) {
  return `<html><body style="background:#f0f0f0;padding:20px;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="text-align:center;font-size:12px;color:#888;margin-bottom:20px;">${r.from} → ${r.to}</div>
  ${table('Sales', r.sales)}<div style="margin:24px 0;"></div>${table('Admin', r.admin)}
  <div style="text-align:center;margin-top:30px;font-size:11px;color:#aaa;">Raport wygenerowany w Opal5 • ${generatedAt}</div></body></html>`;
}

export const callReportSubject = (r: CallReport) => `CALL REPORT: AKTYWNOŚĆ [${r.label}]`;

/** Sends the report through the CRM's mail (Resend) to the configured recipients. */
export async function sendCallReport(crm: Crm, r: CallReport, html: string) {
  const c = await getCallConfig(crm);
  if (!c.recipients.length) throw new HttpError(400, 'Brak odbiorców w konfiguracji raportu.');
  if (!(process.env.RESEND_API_KEY && process.env.MAIL_FROM)) throw new HttpError(400, 'Wysyłka z Opal5 nie jest włączona (RESEND_API_KEY, MAIL_FROM) — pobierz raport i wyślij ze swojej poczty.');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM, to: c.recipients, bcc: process.env.CALL_REPORT_BCC || undefined, subject: callReportSubject(r), html,
      reply_to: process.env.MAIL_REPLY_TO || undefined }),
  });
  if (!res.ok) throw new HttpError(502, `Nie udało się wysłać: ${res.status} ${await res.text().catch(() => '')}`.slice(0, 300));
  return { ok: true, sent: c.recipients.length };
}
