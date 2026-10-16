import { describe, expect, it } from 'vitest';
import { openDb } from './db.js';
import { Crm } from './crm.js';
import { weeklyItems } from './weekly.js';

describe('weekly report tiles', () => {
  it('proposes topics by stage, active partners, events held and next week', async () => {
    const crm = new Crm(await openDb('memory://'), 'Martin', () => '2026-10-16');
    const bs = await crm.createLead({ company: 'Benefit Systems', stage: 'negotiation' });
    await crm.logActivity(bs.id, { type: 'Email', result: 'reached', note: 'Wzór umowy przesłany, czeka na akceptację Grzegorza', date: '2026-10-14', stage: 'negotiation',
      followUp: { date: '2026-10-19', type: 'Call', note: 'decyzja' } });
    const kj = await crm.createLead({ company: 'Klub Jeździecki Profit', stage: 'active' });
    await crm.logActivity(kj.id, { type: 'Call', result: 'reached', note: 'Turniej 17.10 potwierdzony', date: '2026-10-13', stage: 'active' });
    const quiet = await crm.createLead({ company: 'Cicha Firma', stage: 'active' });
    await crm.createLead({ company: 'Nowa Firma' });
    await crm.saveEvent({ title: "Bieg Terry'ego Foxa", date: '2026-10-10', location: 'Park Kościuszki', status: 'done' });
    await crm.saveEvent({ title: 'Instytut Onkologii Gliwice', date: '2026-10-21', time: '11:30' });
    await crm.saveEvent({ title: 'Dzień otwarty', date: '2026-11-05' });
    const kbz = await crm.createLead({ company: 'KBZ Legal' });
    await crm.logActivity(kbz.id, { type: 'Call', result: 'reached', date: '2026-10-15', followUp: { date: '2026-10-21', type: 'Meeting', note: '10:00 Katowice' } });

    const r = await weeklyItems(crm, '2026-10-10', '2026-10-16');
    const sec = (s: string) => r.items.filter((i) => i.section === s).map((i) => i.title);
    expect(sec('topics')).toContain('Benefit Systems');
    expect(r.items.find((i) => i.title === 'Benefit Systems')!.line).toMatch(/^[^0-9]*Grzegorza[^0-9]*$/);
    expect(sec('partners')).toEqual(['Klub Jeździecki Profit']);
    expect(sec('partners')).not.toContain(quiet.company);
    expect(sec('held')).toEqual(["Bieg Terry'ego Foxa"]);
    expect(sec('next').some((t) => /KBZ Legal/.test(t))).toBe(true);
    expect(sec('next')).toContain('Instytut Onkologii Gliwice');
    expect(sec('next')).not.toContain('Dzień otwarty');
    expect(r.pipeline.active).toBe(2);
  });
});
