import { describe, expect, it } from 'vitest';
import { openDb } from './db.js';
import { Crm } from './crm.js';
import { Assistant } from './assistant.js';

describe('update_event', () => {
  it('renames an event, changes its kind and partner, keeps the rest', async () => {
    const crm = new Crm(await openDb('memory://'), 'Martin', () => '2026-10-21');
    const a = new Assistant(crm, 'unused');
    const l = await crm.createLead({ company: 'Sobczyk', city: 'Katowice' });
    const e = await crm.saveEvent({ title: 'Wizyta Sobuły', date: '2026-10-28', time: '10:00', location: 'Szkoła', leadId: l.id });
    const r = await a.mcpCall('update_event', { id: e.id, title: 'Wizyta Sobczyk', type: 'Meeting' });
    expect(r.text).toContain('Wizyta Sobczyk');
    let x = (await crm.listEvents()).find((y) => y.id === e.id)!;
    expect(x).toMatchObject({ title: 'Wizyta Sobczyk', type: 'Meeting', time: '10:00', location: 'Szkoła', leadId: l.id, company: 'Sobczyk' });
    await a.mcpCall('update_event', { id: e.id, lead_id: '' });
    x = (await crm.listEvents()).find((y) => y.id === e.id)!;
    expect(x).toMatchObject({ leadId: '', company: '' });
    await expect(a.mcpCall('update_event', { id: e.id, title: ' ' })).resolves.toMatchObject({ isError: true });
  });
});
