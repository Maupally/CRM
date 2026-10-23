/**
 * Counter of messages sent from Opal5 templates: every "Kopiuj" on a message, offer mail or SMS is one message
 * going out. Monthly e-mail / SMS totals for the Reports page and the weekly report.
 */
import type { DB } from './db.js';
import { nowIso } from './db.js';
import { HttpError } from './crm.js';
import { MSG_CHANNELS, addDays, isIsoDay, txt, type MsgChannel, type MsgCount, type MsgStats } from '../shared/domain.js';

const zero = (): MsgCount => ({ email: 0, sms: 0, internal: 0, total: 0 });
const add = (c: MsgCount, ch: string, n: number) => {
  if ((MSG_CHANNELS as readonly string[]).includes(ch)) c[ch as MsgChannel] += n;
  c.total += n;
};

export class Messages {
  constructor(private db: DB, private today: () => string) {}

  async log(d: { channel?: string; template?: string; source?: string; lang?: string; city?: string }) {
    const channel = txt(d.channel);
    if (!(MSG_CHANNELS as readonly string[]).includes(channel)) throw new HttpError(400, 'channel: email | sms | internal');
    await this.db.run('INSERT INTO crm.msg_log (day, at, channel, template, source, lang, city) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [this.today(), nowIso(), channel, txt(d.template).slice(0, 120), txt(d.source).slice(0, 40), txt(d.lang).slice(0, 5), txt(d.city).slice(0, 40)]);
    return { ok: true };
  }

  async count(from: string, to: string): Promise<MsgCount & { top: MsgStats['period']['top'] }> {
    const rows = await this.db.all(`SELECT channel, template, COUNT(*) AS n FROM crm.msg_log WHERE day BETWEEN ? AND ?
      GROUP BY channel, template ORDER BY n DESC`, [from, to]);
    const c = zero();
    for (const r of rows) add(c, r.channel, Number(r.n));
    const top = rows.filter((r) => r.template).slice(0, 10).map((r) => ({ template: r.template, channel: r.channel as MsgChannel, n: Number(r.n) }));
    return { ...c, top };
  }

  async stats(from?: string, to?: string): Promise<MsgStats> {
    const t = this.today();
    const b = isIsoDay(to) ? to! : t;
    const a = isIsoDay(from) ? from! : `${b.slice(0, 7)}-01`;
    const [y, m] = t.split('-').map(Number);
    const months: MsgStats['months'] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      months.push({ month: d.toISOString().slice(0, 7), ...zero() });
    }
    const first = `${months[0].month}-01`;
    const rows = await this.db.all(`SELECT substr(day, 1, 7) AS month, channel, COUNT(*) AS n FROM crm.msg_log WHERE day >= ?
      GROUP BY substr(day, 1, 7), channel`, [first]);
    for (const r of rows) { const mo = months.find((x) => x.month === r.month); if (mo) add(mo, r.channel, Number(r.n)); }
    const start = addDays(t, -29);
    const dayRows = await this.db.all('SELECT day, channel, COUNT(*) AS n FROM crm.msg_log WHERE day >= ? GROUP BY day, channel', [start]);
    const daily: MsgStats['daily'] = [];
    for (let i = 0; i < 30; i++) daily.push({ date: addDays(start, i), ...zero() });
    for (const r of dayRows) { const d = daily.find((x) => x.date === r.day); if (d) add(d, r.channel, Number(r.n)); }
    return { months, daily, period: { from: a, to: b, ...(await this.count(a, b)) } };
  }
}
