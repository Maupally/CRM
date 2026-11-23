import { describe, expect, it } from 'vitest';
import { openDb } from './db.js';
import { Crm } from './crm.js';
import { Assistant } from './assistant.js';
import { createApp } from './app.js';

describe('marketing', () => {
  it('content calendar, report and partner backlog through the connector', async () => {
    const crm = new Crm(await openDb('memory://'), 'Martin', () => '2026-11-10');
    const a = new Assistant(crm, 'unused');
    const e = await crm.saveEvent({ title: 'Lekcja pokazowa', date: '2026-11-21' });
    await a.mcpCall('save_content', { day: '2026-11-12', channel: 'Instagram', kind: 'Rolka / wideo', title: 'Rolka: zaproszenie', owner: 'Roma', event_id: e.id, status: 'production' });
    await a.mcpCall('save_content', { day: '2026-11-08', channel: 'Grupy FB', kind: 'Udostępnienie', title: 'Sharing na grupach', owner: 'Gosia' });
    const r = await a.mcpCall('save_content', { title: 'Nazwa lekcji — do wymyślenia', status: 'idea' });
    expect(r.text).toContain('bez daty');
    const plan = JSON.parse((await a.mcpCall('get_content_plan', {})).text);
    expect(plan).toHaveLength(3);
    expect(plan.find((x: any) => x.title === 'Sharing na grupach').late).toBe(true);
    const id = plan.find((x: any) => x.owner === 'Roma').id;
    await a.mcpCall('save_content', { id, status: 'published', link: 'https://instagram.com/p/x' });
    const { rows, published } = await (await import('./marketing.js')).Marketing.prototype.contentReport.call(new (await import('./marketing.js')).Marketing(crm), '2026-11');
    expect(rows.find((x) => x.owner === 'Roma')).toMatchObject({ planned: 1, published: 1, late: 0 });
    expect(rows.find((x) => x.owner === 'Gosia')).toMatchObject({ late: 1 });
    expect(published[0].publishedOn).toBe('2026-11-10');

    await a.mcpCall('save_partner_idea', { who: 'Ania — nauczycielka tańca', reach: 'klienci szkoły tańca', idea: 'powie o sobotnich warsztatach', event_id: e.id, owner: 'Patryk' });
    const back = JSON.parse((await a.mcpCall('get_partner_backlog', {})).text);
    expect(back[0]).toMatchObject({ who: 'Ania — nauczycielka tańca', status: 'idea', event: 'Lekcja pokazowa' });
  });

  it('a team link opens only the two lists, records who added what and can be switched off', async () => {
    const crm = new Crm(await openDb('memory://'), 'Martin', () => '2026-11-10');
    const app = createApp({ crm: async () => crm, password: 'tajne-haslo-123' });
    const call = (path: string, init?: RequestInit) => app.request(`/api${path}`, init);
    const post = (path: string, body: unknown) => call(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

    expect((await call('/marketing/links')).status).toBe(401);       // the owner's side needs the login
    const { Marketing } = await import('./marketing.js');
    const link = await new Marketing(crm).addLink('Roma');
    const t = link.token;
    expect(await (await call(`/share/${t}`)).json()).toMatchObject({ name: 'Roma' });
    const c = await (await post(`/share/${t}/content`, { title: 'Rolka', day: '2026-11-12' })).json();
    expect(c.createdBy).toBe('Roma');
    expect((await call(`/share/${t}/content?from=2026-11-01&to=2026-11-30`)).status).toBe(200);
    // nothing else of Opal5 with the team link
    expect((await call(`/share/${t}/leads`)).status).toBe(401);
    expect((await call('/leads')).status).toBe(401);
    // removes only what they added themselves
    const p = await new Marketing(crm).savePartner({ who: 'Kasia' });
    expect((await call(`/share/${t}/partners/${p.id}`, { method: 'DELETE' })).status).toBe(403);
    expect((await call(`/share/${t}/content/${c.id}`, { method: 'DELETE' })).status).toBe(200);
    await new Marketing(crm).revokeLink(t);
    expect((await call(`/share/${t}`)).status).toBe(404);
    expect((await call('/share/zly-link-1234567890')).status).toBe(404);
  });
});
