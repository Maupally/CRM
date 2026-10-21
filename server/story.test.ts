import { describe, expect, it } from 'vitest';
import { openDb } from './db.js';
import { Crm } from './crm.js';
import { Assistant } from './assistant.js';
import { Stories, findDate, parseThread } from './story.js';

const GMAIL = `Spotkanie członkowskie RIG w szkole
Odebrane

Marlena Miąsko <mmiasko@rig.katowice.pl>
wt., 13 paź, 09:12
do mnie

Dzień dobry, proponujemy spotkanie członkowskie u Państwa 12 listopada o 10:00. Czy termin pasuje?

Pozdrawiam
Marlena

Martin <martin@maplebear.pl>
śr., 14 paź, 11:40
do Marlena

Dzień dobry, 12.11 pasuje. Przygotujemy salę na 30 osób.

W dniu wt., 13 paź 2026 o 09:12 Marlena Miąsko <mmiasko@rig.katowice.pl> napisała:
> Dzień dobry, proponujemy spotkanie
`;

describe('project story', () => {
  it('reads dates in the forms mail clients use', () => {
    expect(findDate('wt., 13 paź, 09:12', '2026-10-21')).toBe('2026-10-13');
    expect(findDate('Tue, Oct 20, 3:15 PM (1 day ago)', '2026-10-21')).toBe('2026-10-20');
    expect(findDate('Wysłano: 2 listopada 2025 10:00', '2026-10-21')).toBe('2025-11-02');
    expect(findDate('Date: 20.10.2026', '2026-10-21')).toBe('2026-10-20');
    expect(findDate('15 gru', '2026-10-21')).toBe('2025-12-15');
  });

  it('splits a pasted Gmail thread into messages, without the quoted part', () => {
    const p = parseThread(GMAIL, '2026-10-21');
    expect(p.subject).toBe('Spotkanie członkowskie RIG w szkole');
    expect(p.items).toHaveLength(2);
    expect(p.items[0]).toMatchObject({ day: '2026-10-13', who: 'Marlena Miąsko', direction: 'in' });
    expect(p.items[0].text).toContain('12 listopada');
    expect(p.items[1]).toMatchObject({ day: '2026-10-14', direction: 'out' });
    expect(p.items[1].text).not.toContain('proponujemy');
    expect(p.emails).toContain('mmiasko@rig.katowice.pl');
  });

  it('stores it under a company, adds only new messages when pasted again, and answers get_story', async () => {
    const crm = new Crm(await openDb('memory://'), 'Martin', () => '2026-10-21');
    const l = await crm.createLead({ company: 'RIG', city: 'Katowice', email: 'biuro@rig.katowice.pl' });
    const st = new Stories(crm);
    expect(await st.companiesFor(['mmiasko@rig.katowice.pl', 'jan@gmail.com'])).toEqual([{ id: l.id, company: 'RIG' }]);
    const p = parseThread(GMAIL, '2026-10-21');
    expect((await st.add({ leadId: l.id }, p.subject, p.items.slice(0, 1))).added).toBe(1);
    const again = await st.add({ leadId: l.id }, p.subject, p.items);
    expect(again).toMatchObject({ added: 1, skipped: 1 });
    await expect(st.add({}, 'x', p.items)).rejects.toThrow(/firma, wydarzenie albo temat/);

    const a = new Assistant(crm, 'unused');
    const r = await a.mcpCall('save_story', { topic: 'Związki wyznaniowe', thread: 'Parafia św. Józefa', messages: [
      { date: '2026-10-19', from: 'ks. Adam', direction: 'in', summary: 'Zgoda na plakat w gablocie.' },
    ] });
    expect(r.text).toContain('dopisano 1');
    const g = JSON.parse((await a.mcpCall('get_story', { topic: 'Związki wyznaniowe' })).text);
    expect(g[0]).toMatchObject({ who: 'ks. Adam', thread: 'Parafia św. Józefa' });
    expect((await st.list({ leadId: l.id }))[0].company).toBe('RIG');
  });
});
