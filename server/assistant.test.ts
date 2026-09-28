import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { openDb, type DB } from './db.js';
import { Crm } from './crm.js';
import { Assistant } from './assistant.js';

/** Plays back scripted model turns and records every request the assistant makes. */
function fakeClient(turns: any[]) {
  const requests: any[] = [];
  return {
    requests,
    beta: { messages: { create: async (req: any) => {
      requests.push(JSON.parse(JSON.stringify(req)));
      const t = turns.shift();
      if (!t) throw new Error('no more scripted turns');
      return t;
    } } },
  };
}
const toolUse = (id: string, name: string, input: any) => ({ type: 'tool_use', id, name, input });

describe('assistant', () => {
  let db: DB;
  let crm: Crm;
  beforeAll(async () => {
    db = await openDb('memory://');
    crm = new Crm(db, 'Martin', () => '2026-09-28');
    await crm.saveSegment({ name: 'LOGISTYKA', weight: 2 });
    await crm.createLead({ company: 'Cichoń Dressage', city: 'Katowice', phone: '515606189' });
  });
  afterAll(() => db.close());

  it('turns a dictated sentence into proposals and writes only after approval', async () => {
    const a = new Assistant(crm, 'test-key');
    const fake = fakeClient([
      { stop_reason: 'tool_use', content: [toolUse('t1', 'find_companies', { query: 'cichon dresaż' })] },
      { stop_reason: 'tool_use', content: [
        { type: 'text', text: 'Mam to.' },
        toolUse('t2', 'log_activity', { id: 'L001', type: 'Call', result: 'no answer', summary: 'Nikt nie odebrał.',
          follow_up: { date: '2026-10-02', type: 'Call', note: 'ponowić' } }),
        toolUse('t3', 'create_company', { company: 'Kowalski Logistyka', city: 'Gliwice', phone: '600 100 200', segment: 'LOGISTYKA' }),
        toolUse('t4', 'plan_activity', { id: 'NEW1', type: 'Call', date: '2026-09-29', note: 'pierwszy telefon' }),
      ] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Przygotowałem trzy zmiany.' }] },
    ]);
    (a as any).client = fake;

    const r = await a.ask('dzwoniłem do cichoń nie odebrali, spróbuj w piątek. dodaj kowalski logistyka z gliwic', [], 'L001');
    expect(r.reply).toBe('Przygotowałem trzy zmiany.');
    expect(r.proposals.map((p) => p.tool)).toEqual(['log_activity', 'create_company', 'plan_activity']);
    expect(r.proposals[0].lines.join(' ')).toMatch(/nie odebrał.*Następny krok/s);

    // request shape: model, fallbacks, cached static prompt, context of the open card
    const req = fake.requests[0];
    expect(req.model).toBe('claude-opus-5');
    expect(req.fallbacks).toBe('default');
    expect(req.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(req.system[1].text).toContain('L001');
    // search result came back to the model
    const found = fake.requests[1].messages.at(-1).content[0].content;
    expect(found).toContain('Cichoń Dressage');

    // nothing written yet
    expect((await crm.getLead('L001')).stage).toBe('new');
    expect((await crm.listLeads()).length).toBe(1);

    const done = await a.execute(r.proposals.map((p) => ({ tool: p.tool, input: p.input })));
    expect(done.results.every((x) => x.ok)).toBe(true);
    const cichon = await crm.getLead('L001');
    expect(cichon).toMatchObject({ stage: 'contacting', nextContact: '2026-10-02' });
    const kowalski = (await crm.listLeads()).find((l) => l.company === 'Kowalski Logistyka')!;
    expect(kowalski).toMatchObject({ city: 'Gliwice', phone: '600 100 200', segment: 'LOGISTYKA', nextContact: '2026-09-29' });
  });

  it('reports bad tool input back to the model instead of proposing it', async () => {
    const a = new Assistant(crm, 'test-key');
    const fake = fakeClient([
      { stop_reason: 'tool_use', content: [toolUse('t1', 'change_stage', { id: 'L001', stage: 'disqualified' })] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Podaj powód odrzucenia.' }] },
    ]);
    (a as any).client = fake;
    const r = await a.ask('odrzuć cichoń');
    expect(r.proposals).toHaveLength(0);
    const res = fake.requests[1].messages.at(-1).content[0];
    expect(res.is_error).toBe(true);
    expect(res.content).toMatch(/powodu/);
  });
});

describe('assistant coaching', () => {
  it('feeds the segment playbook and company history into the call script', async () => {
    const db = await openDb('memory://');
    const crm = new Crm(db, 'Martin', () => '2026-09-28');
    await crm.saveSegment({ name: 'STADNINY', weight: 2, opening: 'Dzień dobry, dzwonię z Maple Bear.', objections: "'Za daleko' - autokar" });
    const l = await crm.createLead({ company: 'Arabka', segment: 'STADNINY', person: 'p. Celina' });
    await crm.logActivity(l.id, { type: 'Call', result: 'reached', note: 'Zainteresowani wycieczkami klas.' });
    const a = new Assistant(crm, 'test-key');
    const requests: any[] = [];
    const turns: any[] = [
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'get_pitch', input: { id: l.id } }] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: '1) Dzień dobry, pani Celino…' }] },
    ];
    (a as any).client = { beta: { messages: { create: async (r: any) => { requests.push(JSON.parse(JSON.stringify(r))); return turns.shift(); } } } };
    const r = await a.ask('jak zagadać?', [], l.id);
    expect(r.proposals).toHaveLength(0);
    const pitch = JSON.parse(requests[1].messages.at(-1).content[0].content);
    expect(pitch.playbook.opening).toContain('Maple Bear');
    expect(pitch.person).toBe('p. Celina');
    expect(pitch.history[0].note).toContain('wycieczkami');
    await db.close();
  });
});
