import { describe, expect, it } from 'vitest';
import { openDb } from './db.js';
import { Crm } from './crm.js';
import { Assistant } from './assistant.js';
import { getFees, resetFeeYear, saveFeeYear } from './fees.js';
import { DEFAULT_FEES, pln, schoolYear, yearFor } from '../shared/fees.js';

describe('fee book', () => {
  it('picks the school year from the start date', () => {
    expect(schoolYear('2026-10-13')).toBe('2026/27');
    expect(schoolYear('2027-08-31')).toBe('2026/27');
    expect(schoolYear('2027-09-01')).toBe('2027/28');
    expect(yearFor(DEFAULT_FEES, 'krakow', '2027-02-01')).toBe('2026/27');
    expect(yearFor(DEFAULT_FEES, 'krakow', '2027-09-01')).toBe('2027/28');
    expect(yearFor(DEFAULT_FEES, 'krakow', '2029-09-01')).toBe('2027/28');
    expect(pln(3349)).toBe('3 349 PLN');
    expect(pln(3349, 'en')).toBe('3,349 PLN');
  });

  it('keeps two price lists and saves edits per year', async () => {
    const crm = new Crm(await openDb('memory://'), 'Martin', () => '2026-10-13');
    const v = await getFees(crm);
    expect(v.current).toBe('2026/27');
    expect(v.book.krakow['2026/27'].rows[0].monthly).toBe(2858);
    expect(v.book.krakow['2027/28'].rows[0].monthly).toBe(2944);
    const f = { ...v.book.katowice['2027/28'], status: 'confirmed', rows: v.book.katowice['2027/28'].rows.map((r) => ({ ...r, monthly: r.monthly + 100 })) };
    const after = await saveFeeYear(crm, 'katowice', '2027/28', f);
    expect(after.book.katowice['2027/28'].rows[0].monthly).toBe(3449);
    expect(after.book.katowice['2026/27'].rows[0].monthly).toBe(3349);
    expect(after.edited).toEqual(['katowice:2027/28']);
    await expect(saveFeeYear(crm, 'katowice', '2027', f)).rejects.toThrow(/Rok szkolny/);
    expect((await resetFeeYear(crm, 'katowice', '2027/28')).book.katowice['2027/28'].rows[0].monthly).toBe(3349);

    const a = new Assistant(crm, 'unused');
    const now = await a.mcpCall('get_fees', { city: 'krakow' });
    expect(now.text).toContain('2026/27');
    expect(now.text).toContain('2 858 PLN');
    const sept = await a.mcpCall('run_action', { action: 'get_fees', input: { city: 'wroclaw', start_date: '2027-09-01' } });
    expect(sept.text).toContain('2027/28');
    expect(sept.text).toContain('2 750 PLN');
  });
});
