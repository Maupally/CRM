import { describe, expect, it } from 'vitest';
import { openDb } from './db.js';
import { Crm } from './crm.js';
import { Assistant } from './assistant.js';
import { namedGroups, topicOf } from '../shared/topics.js';

describe('task groups', () => {
  it('saves a topic, groups by it and suggests it for a similar new task', async () => {
    const crm = new Crm(await openDb('memory://'), 'Martin', () => '2026-10-20');
    const a = new Assistant(crm, 'unused');
    await a.mcpCall('create_task', { task: 'Mail do parafii św. Józefa', topic: 'Związki wyznaniowe' });
    await crm.saveTask({ task: 'Zadzwonić do parafii Mariackiej', topic: 'Związki wyznaniowe' });
    const loose = await crm.saveTask({ task: 'Kupić tusz do drukarki' });
    const tasks = await crm.listTasks();
    const g = namedGroups(tasks);
    expect(topicOf(tasks.find((t) => t.topic)!, g)).toMatchObject({ key: 'T:Związki wyznaniowe', kind: 'project' });
    expect(topicOf(tasks.find((t) => t.id === loose.id)!, g).key).toBe('other');

    const r = JSON.parse((await a.mcpCall('suggest_task_group', { task: 'Wysłać ofertę do parafii ewangelickiej' })).text);
    expect(r.suggestions[0]).toMatchObject({ kind: 'project', set: { topic: 'Związki wyznaniowe' }, open_tasks: 2 });
    const none = JSON.parse((await a.mcpCall('suggest_task_group', { task: 'Xyzzy' })).text);
    expect(none.suggestions).toEqual([]);

    // moving a loose task into the group, and clearing it again
    await a.mcpCall('update_task', { task_id: loose.id, topic: 'Biuro' });
    expect((await crm.listTasks()).find((t) => t.id === loose.id)!.topic).toBe('Biuro');
    await a.mcpCall('update_task', { task_id: loose.id, topic: '' });
    expect((await crm.listTasks()).find((t) => t.id === loose.id)!.topic).toBe('');
  });
});
