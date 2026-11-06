import { describe, expect, it } from 'vitest';
import { openDb } from './db.js';
import { Crm } from './crm.js';
import { Assistant } from './assistant.js';
import { BoardStore } from './board.js';

describe('person files and the board', () => {
  it('collects notes under every person they mention and draws threads', async () => {
    const crm = new Crm(await openDb('memory://'), 'Martin', () => '2026-10-15');
    const patryk = await crm.savePerson({ name: 'Patryk Kundera', role: 'Wicedyrektor', aliases: 'Patryk' });
    const marta = await crm.savePerson({ name: 'Marta Kula', role: 'Logopeda' });
    const klaudia = await crm.savePerson({ name: 'Klaudia Wójcik', kind: 'external' });
    const ev = await crm.saveEvent({ title: 'Bieg Terry Foxa', date: '2026-10-10', location: 'Park Kościuszki' });
    await crm.linkPersonEvent(ev.id, marta.id, 'animacje');

    const a = new Assistant(crm, 'unused');
    const r = await a.mcpCall('run_action', { action: 'save_person_note', input: {
      text: 'Patryk i Marta pojechali do Gliwic na spotkanie w sprawie darowizny z biegu.', day: '2026-10-12',
      people: ['Patryk', marta.id], event_ids: [ev.id], places: ['Gliwice'], ref: 'K-005', source: 'czat kwity' } });
    expect(r.isError).toBeFalsy();
    expect(r.text).toContain('Patryk Kundera');
    const l = await a.mcpCall('link_nodes', { a_kind: 'person', a_id: 'Klaudia', b_kind: 'person', b_id: patryk.id, label: 'poleciła mu fundację' });
    expect(l.isError).toBeFalsy();
    expect((await a.mcpCall('save_person_note', { text: 'x', people: ['Nikt Taki'] })).isError).toBe(true);

    const store = new BoardStore(crm);
    const fp = await store.personFile(patryk.id);
    expect(fp.notes).toHaveLength(1);
    expect(fp.notes[0].ref).toBe('K-005');
    expect(fp.connections.map((c) => c.node.label).sort()).toEqual(['Bieg Terry Foxa', 'Gliwice', 'Klaudia Wójcik', 'Marta Kula']);
    expect((await store.personFile(marta.id)).notes).toHaveLength(1);

    const b = await store.board();
    const keys = b.nodes.map((n) => n.key);
    expect(keys).toContain('place:gliwice');
    expect(keys).toContain('place:park-kosciuszki');
    const me = b.edges.find((e) => [e.a, e.b].includes(`person:${marta.id}`) && [e.a, e.b].includes(`event:${ev.id}`))!;
    expect(me.labels).toContain('animacje');
    expect(me.labels.some((x) => x.startsWith('12.10: Patryk i Marta'))).toBe(true);

    const file = JSON.parse((await a.mcpCall('get_person_file', { person: 'Klaudia' })).text);
    expect(file.connections[0]).toMatchObject({ name: 'Patryk Kundera', why: ['poleciła mu fundację'] });
  });
});
