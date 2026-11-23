import { describe, expect, it } from 'vitest';
import { openDb } from './db.js';
import { Crm } from './crm.js';
import { Assistant } from './assistant.js';
import { estimatePoints, snapPoints } from '../shared/domain.js';
import { capacity } from '../shared/capacity.js';

describe('story points and capacity', () => {
  it('estimates from wording, snaps to Fibonacci and sums per week', async () => {
    expect(estimatePoints('Zadzwonić do Pani Michnickiej')).toBe(1);
    expect(estimatePoints('Wysłać mail do parafii')).toBe(2);
    expect(estimatePoints('Strona internetowa warsztatów + formularz zapisów')).toBe(5);
    expect(estimatePoints('Rozbicie eventu na potrzeby')).toBe(8);
    expect(snapPoints(4)).toBe(3);
    expect(snapPoints(10)).toBe(8);
    expect(snapPoints(0)).toBe(0);

    let day = '2026-10-20';
    const crm = new Crm(await openDb('memory://'), 'Martin', () => day);
    const a = new Assistant(crm, 'unused');
    const r = await a.mcpCall('create_task', { task: 'Landing page zimowych warsztatów', due: '2026-10-22', points: 8 });
    expect(r.text).toContain('8 pkt');
    const t1 = (await crm.listTasks())[0];
    expect(t1).toMatchObject({ points: 8, pointsAuto: false });
    const t2 = await crm.saveTask({ task: 'Zadzwonić do RIG', due: '2026-10-19' });
    expect(t2).toMatchObject({ points: 1, pointsAuto: true });
    await crm.saveTask({ task: 'Kampania', due: '2026-10-28', points: 21 });
    // saving an edit with the shown estimate does not freeze it
    await crm.saveTask({ ...t2, task: 'Zadzwonić do RIG — termin', pointsAuto: true });
    expect((await crm.listTasks()).find((t) => t.id === t2.id)).toMatchObject({ pointsAuto: true });
    day = '2026-10-14';
    const old = await crm.saveTask({ task: 'Mail do Gminy', due: '2026-10-14' });
    await crm.saveTask({ id: old.id, status: 'done' });
    day = '2026-10-20';

    const c = capacity(await crm.listTasks(), day);
    expect(c.thisWeek.planned).toBe(9);          // 8 this week + 1 overdue
    expect(c.ahead[0].planned).toBe(21);
    expect(c.past.at(-1)!.done).toBe(2);
    expect(c.velocity).toBe(1);                   // 2 points over 4 weeks, rounded
    expect(c.tooBig.map((t) => t.points)).toEqual([21]);
    const my = JSON.parse((await a.mcpCall('get_my_day', {})).text);
    expect(my.capacity.this_week_planned_points).toBe(9);
  });
});
