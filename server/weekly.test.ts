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

describe('weekly report memory', () => {
  it('writes the funnel line in Polish and keeps rules and the last sent report', async () => {
    const { funnelLine, WeeklyMemory, DEFAULT_WEEKLY_RULES } = await import('./weekly.js');
    expect(funnelLine({ new: 0, contacting: 16, 'scheduled visit': 1, negotiation: 1, active: 15, disqualified: 0 } as any))
      .toBe('Lejek B2B: 16 firm w kontakcie, 1 umówiona wizyta, 1 negocjacja, 15 aktywnych partnerstw.');
    expect(funnelLine({ new: 0, contacting: 2, 'scheduled visit': 3, negotiation: 4, active: 22, disqualified: 0 } as any))
      .toBe('Lejek B2B: 2 firmy w kontakcie, 3 umówione wizyty, 4 negocjacje, 22 aktywne partnerstwa.');
    const { openDb } = await import('./db.js');
    const { Crm } = await import('./crm.js');
    const { Assistant } = await import('./assistant.js');
    const crm = new Crm(await openDb('memory://'), 'Martin', () => '2026-10-23');
    const a = new Assistant(crm, 'unused');
    await a.mcpCall('save_weekly_report', { text: 'Tematy w toku\n- Benefit Systems – czekamy na poprawki umowy.', lessons: ['Bez dostawców i zakupów (agencje reklamowe, drukarnie, gadżety) — to nie są tematy partnerskie.', 'Nowa zasada testowa'] });
    const r = JSON.parse((await a.mcpCall('get_weekly_items', {})).text);
    expect(r.last_sent.text).toContain('Benefit Systems');
    expect(r.rules).toHaveLength(DEFAULT_WEEKLY_RULES.length + 1);
    expect(r.funnel).toMatch(/^Lejek B2B: /);
    expect((await new WeeklyMemory(crm).sent())).toHaveLength(1);
  });
});
