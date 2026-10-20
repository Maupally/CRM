import { describe, expect, it } from 'vitest';
import { openDb } from './db.js';
import { Crm } from './crm.js';

describe('a call nobody picked up', () => {
  it('counts as the attempt: old planned calls close and overdue call tasks move to the next try', async () => {
    let day = '2026-10-05';
    const crm = new Crm(await openDb('memory://'), 'Martin', () => day);
    const l = await crm.createLead({ company: 'RIG', city: 'Katowice' });
    await crm.logActivity(l.id, { type: 'Call', result: 'planned', date: '2026-10-05', note: 'oferta B2B' });
    await crm.logActivity(l.id, { type: 'Call', result: 'planned', date: '2026-10-07', note: 'termin spotkania' });
    await crm.logActivity(l.id, { type: 'Email', result: 'planned', date: '2026-10-07', note: 'mail' });
    const task = await crm.saveTask({ task: 'Zadzwonić do Marleny z RIG', due: '2026-10-05', leadId: l.id });
    const other = await crm.saveTask({ task: 'Wysłać umowę', due: '2026-10-05', leadId: l.id });

    day = '2026-10-23'; // a Friday
    await crm.logActivity(l.id, { type: 'Call', result: 'no answer', note: 'nie odebrała' });
    const acts = await crm.db.all(`SELECT type, result, date FROM crm.activities WHERE lead_id = ? ORDER BY id`, [l.id]);
    expect(acts.filter((a: any) => a.type === 'Call' && a.result === 'planned')).toEqual([]);
    expect(acts.filter((a: any) => a.result === 'cancelled')).toHaveLength(2);
    // a planned e-mail is a different thing — it stays
    expect(acts.find((a: any) => a.type === 'Email')).toMatchObject({ result: 'planned' });

    const tasks = await crm.listTasks();
    const t = tasks.find((x) => x.id === task.id)!;
    expect(t.due).toBe('2026-10-26'); // next working day
    expect(t.status).toBe('todo');
    expect(t.notes).toContain('Próba 2026-10-23');
    expect(tasks.find((x) => x.id === other.id)!.due).toBe('2026-10-05');
  });

  it('ticking off the planned call as no answer covers the older ones and uses the follow-up date', async () => {
    let day = '2026-10-05';
    const crm = new Crm(await openDb('memory://'), 'Martin', () => day);
    const l = await crm.createLead({ company: 'RIG', city: 'Katowice' });
    await crm.logActivity(l.id, { type: 'Call', result: 'planned', date: '2026-10-05' });
    await crm.logActivity(l.id, { type: 'Call', result: 'planned', date: '2026-10-07' });
    const task = await crm.saveTask({ task: 'Telefon do RIG', due: '2026-10-07', leadId: l.id });
    day = '2026-10-20';
    const [a] = await crm.db.all(`SELECT id FROM crm.activities WHERE lead_id = ? AND date = '2026-10-07'`, [l.id]);
    await crm.completeActivity(Number(a.id), { result: 'no answer', followUp: { date: '2026-10-22' } });
    const acts = await crm.db.all(`SELECT result FROM crm.activities WHERE lead_id = ? AND type = 'Call' ORDER BY id`, [l.id]);
    expect(acts.map((x: any) => x.result)).toEqual(['cancelled', 'no answer', 'planned']);
    expect((await crm.listTasks()).find((x) => x.id === task.id)!.due).toBe('2026-10-22');
  });
});
