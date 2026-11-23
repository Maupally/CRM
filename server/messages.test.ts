import { describe, expect, it } from 'vitest';
import { openDb } from './db.js';
import { Crm } from './crm.js';
import { Messages } from './messages.js';

describe('message counter', () => {
  it('counts copied e-mails and SMS per month and puts them in the weekly report', async () => {
    let day = '2026-09-30';
    const crm = new Crm(await openDb('memory://'), 'Martin', () => day);
    const m = new Messages(crm.db, () => day);
    await m.log({ channel: 'email', template: 'Hi 1', source: 'wiadomosci' });
    day = '2026-10-13';
    await m.log({ channel: 'sms', template: 'Hi 1', source: 'wiadomosci' });
    await m.log({ channel: 'sms', template: 'Hi 1', source: 'wiadomosci' });
    await m.log({ channel: 'email', template: 'Mail: Hello email', source: 'mail' });
    await expect(m.log({ channel: 'fax' })).rejects.toThrow();

    const s = await m.stats();
    expect(s.period).toMatchObject({ from: '2026-10-01', to: '2026-10-13', email: 1, sms: 2, total: 3 });
    expect(s.period.top[0]).toMatchObject({ template: 'Hi 1', channel: 'sms', n: 2 });
    expect(s.months.at(-1)).toMatchObject({ month: '2026-10', total: 3 });
    expect(s.months.at(-2)).toMatchObject({ month: '2026-09', email: 1 });
    expect(s.daily).toHaveLength(30);

    const r = await crm.report('2026-10-07', '2026-10-13');
    expect(r.text).toContain('MESSAGES SENT FROM TEMPLATES (3)');
    expect(r.text).toContain('E-mails 1   ·   SMS 2');
    expect(r.text).toContain('Hi 1 (SMS) ×2');
  });
});
