import { describe, expect, it } from 'vitest';
import { openDb } from './db.js';
import { Crm } from './crm.js';
import { Assistant } from './assistant.js';

describe('Na później', () => {
  it('saves loose ideas and brings them back by topic, date and now and then', async () => {
    let day = '2026-10-14';
    const crm = new Crm(await openDb('memory://'), 'Martin', () => day);
    const a = new Assistant(crm, 'unused');
    const saved = await a.mcpCall('run_action', { action: 'save_idea', input: {
      title: 'Dzika Droga — zajęcia survivalowe dla szkół', topic: 'zajęcia dodatkowe', owner: 'dyrekcja',
      when_relevant: 'przy ustalaniu zajęć dodatkowych na 2027/28', url: 'https://www.dzikadroga.pl/oferta/szkoly-przedszkola-instytucje',
    } });
    expect(saved.isError).toBeFalsy();
    expect(saved.text).toContain('Na później');
    await a.mcpCall('save_idea', { title: 'Influencerka od pani Michnickiej', topic: 'promocja', remind_on: '2026-11-01' });

    expect((await a.mcpCall('get_ideas', { query: 'nowe zajęcia dodatkowe dla dzieci' })).text).toContain('Dzika Droga');
    expect((await a.mcpCall('get_ideas', { query: 'catering' })).text).toContain('Nic');
    expect((await a.mcpCall('find_help', { need: 'zajęcia survivalowe' })).text).toContain('from_later_list');

    // nothing on the day it was saved; three weeks later one reminder in passing; on its date the dated one is due
    expect((await a.mcpCall('get_my_day', {})).text).not.toContain('later_list');
    day = '2026-11-01';
    const my = (await a.mcpCall('get_my_day', {})).text;
    expect(my).toContain('later_list_due');
    expect(my).toContain('Influencerka');
    await a.mcpCall('save_idea', { id: 2, status: 'used' });
    day = '2026-11-10';
    expect((await a.mcpCall('get_my_day', {})).text).toContain('later_list_reminder');
    expect((await a.mcpCall('get_my_day', {})).text).not.toContain('later_list_reminder');
  });
});
