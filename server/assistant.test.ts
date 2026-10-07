import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { openDb, type DB } from './db.js';
import { Crm } from './crm.js';
import { Assistant, needsContent, needsWeb } from './assistant.js';

/** Plays back scripted model turns and records every request the assistant makes. */
function fakeClient(turns: any[]) {
  const requests: any[] = [];
  return {
    requests,
    beta: { messages: { stream: (req: any) => {
      requests.push(JSON.parse(JSON.stringify(req)));
      const t = turns.shift();
      return { finalMessage: async () => { if (!t) throw new Error('no more scripted turns'); return t; } };
    } } },
  };
}
const toolUse = (id: string, name: string, input: any) => ({ type: 'tool_use', id, name, input });

describe('request routing', () => {
  it('uses the knowledge base only when content has to be written', () => {
    expect(needsContent('Dzień otwarty: post na Facebooku opublikowany, zaproszenia do partnerów wysłane, odhacz')).toBe(false);
    expect(needsContent('przesuń zadanie na jutro')).toBe(false);
    expect(needsContent('Przygotuj mnie do rozmowy z tą firmą')).toBe(false);
    expect(needsContent('wrzuć mi na dziś, muszę przygotować teksty na biegi')).toBe(true);
    expect(needsContent('napisz zaproszenie do szkół i przedszkoli')).toBe(true);
    expect(needsContent('zmień w nim datę', 'napisz post o biegu')).toBe(true);
    expect(needsContent('co to jest?', '', true)).toBe(true);
    expect(needsWeb('dostałem maila od biuro@armada-golf.pl, co to za firma?')).toBe(true);
    expect(needsWeb('sprawdź w internecie Norlandię')).toBe(true);
    expect(needsWeb('przesuń zadanie na jutro')).toBe(false);
  });
});

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

    const r = await a.ask('dzwoniłem do cichoń nie odebrali, spróbuj w piątek. dodaj kowalski logistyka z gliwic', [], { leadId: 'L001' });
    expect(r.reply).toBe('Przygotowałem trzy zmiany.');
    expect(r.proposals.map((p) => p.tool)).toEqual(['log_activity', 'create_company', 'plan_activity']);
    expect(r.proposals[0].lines.join(' ')).toMatch(/nie odebrał.*Następny krok/s);

    // request shape: model, fallbacks, cached static prompt, context of the open card
    const req = fake.requests[0];
    expect(req.model).toBe('claude-opus-5-5');
    expect(req.fallbacks).toBe('default');
    expect(req.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(req.system[1].text).toContain('L001');
    // bookkeeping goes the quick way: no knowledge base, no file tools, no sandbox, low effort
    const names = req.tools.map((t: any) => t.name);
    expect(names).toContain('log_activity');
    expect(names).not.toContain('search_knowledge');
    expect(names).not.toContain('code_execution');
    expect(req.output_config.effort).toBe('low');
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
    (a as any).client = { beta: { messages: { stream: (r: any) => { requests.push(JSON.parse(JSON.stringify(r))); const t = turns.shift(); return { finalMessage: async () => t }; } } } };
    const r = await a.ask('jak zagadać?', [], { leadId: l.id });
    expect(r.proposals).toHaveLength(0);
    const pitch = JSON.parse(requests[1].messages.at(-1).content[0].content);
    expect(pitch.playbook.opening).toContain('Maple Bear');
    expect(pitch.person).toBe('p. Celina');
    expect(pitch.history[0].note).toContain('wycieczkami');
    await db.close();
  });
});

describe('assistant: groups, mail, events, photos', () => {
  it('queries the base, plans many, drafts a mail and updates an event', async () => {
    const db = await openDb('memory://');
    const crm = new Crm(db, 'Martin', () => '2026-09-28');
    await crm.saveSegment({ name: 'STADNINY', weight: 2 });
    const a1 = await crm.createLead({ company: 'Stajnia A', segment: 'STADNINY', city: 'Katowice', phone: '600000001', email: 'a@a.pl' });
    const a2 = await crm.createLead({ company: 'Stajnia B', segment: 'STADNINY', city: 'Katowice', phone: '600000002' });
    await crm.createLead({ company: 'Stajnia C', segment: 'STADNINY', city: 'Tychy', phone: '600000003' });
    const ev = await crm.saveEvent({ title: "Bieg Terry'ego Foxa", date: '2026-10-10' });

    const as = new Assistant(crm, 'test-key');
    const requests: any[] = [];
    const turns: any[] = [
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'query_companies',
        input: { segment: 'STADNINY', city: 'katowice', has_phone: true, never_contacted: true } }] },
      { stop_reason: 'tool_use', content: [
        { type: 'tool_use', id: 't2', name: 'plan_many', input: { type: 'Call', note: 'pierwszy telefon',
          items: [{ id: a1.id, date: '2026-10-05' }, { id: a2.id, date: '2026-10-06' }] } },
        { type: 'tool_use', id: 't3', name: 'draft_email', input: { id: a1.id, subject: 'Współpraca', body: 'Dzień dobry…' } },
        { type: 'tool_use', id: 't4', name: 'update_event', input: { id: ev.id, status: 'confirmed', add_note: 'Potwierdzone przez organizatora.' } },
      ] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Dwie stadniny z Katowic, zaplanowane.' }] },
    ];
    (as as any).client = { beta: { messages: { stream: (r: any) => { requests.push(JSON.parse(JSON.stringify(r))); const t = turns.shift(); return { finalMessage: async () => t }; } } } };

    const r = await as.ask('które stadniny z katowic nie miały kontaktu? zaplanuj im telefony', [], {
      spoken: true, image: { mediaType: 'image/jpeg', data: 'aGVsbG8=' },
    });
    const found = JSON.parse(requests[1].messages.at(-1).content[0].content);
    expect(found.total).toBe(2);
    expect(requests[0].messages.at(-1).content[0].type).toBe('image');
    expect(requests[0].system[1].text).toContain('głośnomówiący');
    expect(r.proposals.map((p) => p.tool)).toEqual(['plan_many', 'draft_email', 'update_event']);
    expect(r.proposals[1].input.to).toBe('a@a.pl');

    const done = await as.execute(r.proposals.map((p) => ({ tool: p.tool, input: p.input })));
    expect(done.results.every((x) => x.ok)).toBe(true);
    expect((await crm.getLead(a2.id)).nextContact).toBe('2026-10-06');
    expect((await crm.leadCard(a1.id)).activities.some((x) => x.type === 'Email' && x.note.startsWith('Mail: Współpraca') && x.note.split('\n\n').length > 1)).toBe(true);
    const saved = (await crm.listEvents()).find((e) => e.id === ev.id)!;
    expect(saved).toMatchObject({ status: 'confirmed', notes: 'Potwierdzone przez organizatora.' });
    await db.close();
  });
});


describe('knowledge base, files and project tasks', () => {
  it('stores files, finds them, stamps a QR code and drives tasks and campaigns through the assistant', async () => {
    const { PDFDocument, StandardFonts } = await import('pdf-lib');
    const { Knowledge } = await import('./knowledge.js');
    const db = await openDb('memory://');
    const crm = new Crm(db, 'Martin', () => '2026-09-30');
    const kb = new Knowledge(db);

    // a one-page "poster" PDF with real text in it
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]);
    page.drawText('Bieg Terry Foxa 10 pazdziernika Park Kosciuszki', { x: 50, y: 700, size: 18, font: await doc.embedFont(StandardFonts.Helvetica) });
    const poster = await kb.add({ filename: 'plakat-bieg.pdf', mime: 'application/pdf', data: await doc.save() });
    expect(poster.textLength).toBeGreaterThan(10);
    const note = await kb.add({ title: 'Zapisy na bieg', text: 'Link do zapisów: https://maplebear.pl/bieg. Start 10:00, dystans 3 km.' });
    const hits = await kb.search('bieg zapisy link');
    expect(hits[0].id).toBe(note.id);

    const ev = await crm.saveEvent({ title: "Bieg Terry'ego Foxa", date: '2026-10-10' });
    await crm.saveSegment({ name: 'przedszkole/szkoła/żłobek', weight: 3 });
    const school = await crm.createLead({ company: 'Szkoła Podstawowa 1', segment: 'przedszkole/szkoła/żłobek', email: 'sp1@szkola.pl' });
    await crm.createLead({ company: 'Przedszkole bez maila', segment: 'przedszkole/szkoła/żłobek' });

    const as = new Assistant(crm, 'test-key');
    const requests: any[] = [];
    const turns: any[] = [
      { stop_reason: 'tool_use', container: { id: 'cont_1' }, content: [
        { type: 'tool_use', id: 't1', name: 'search_knowledge', input: { query: 'bieg terry fox zapisy' } },
        { type: 'tool_use', id: 't2', name: 'stamp_qr', input: { knowledge_id: poster.id, url: 'https://maplebear.pl/bieg', caption: 'Zapisy online' } },
      ] },
      { stop_reason: 'tool_use', content: [
        { type: 'tool_use', id: 't3', name: 'create_task', input: { task: 'Teksty i gotowce na bieg', due: '2026-09-30', event_id: ev.id,
          materials: [{ title: 'Tekst dla nauczycieli', body: 'Drodzy Państwo, 10 października…' }, { title: 'Post na Facebooka', body: 'Biegniemy!' }],
          attachments: [poster.id] } },
        { type: 'tool_use', id: 't4', name: 'draft_campaign', input: { name: 'Zaproszenie na bieg — szkoły',
          audience: { segments: ['przedszkole/szkoła/żłobek'] }, subject: 'Zaproszenie dla [Firma]', body: 'Zapraszamy [Firma]…', attachments: [poster.id] } },
      ] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Gotowe.' }] },
    ];
    (as as any).client = { beta: { messages: { stream: (r: any) => { requests.push(JSON.parse(JSON.stringify(r))); const t = turns.shift(); return { finalMessage: async () => t }; } } } };

    const r = await as.ask('na dziś przygotuj teksty na bieg i zaproszenie do szkół, dodaj QR do plakatu', [], { containerId: 'cont_0' });
    expect(requests[0].container).toBe('cont_0');
    expect(requests[1].container).toBe('cont_1');
    expect(r.containerId).toBe('cont_1');
    expect(r.files?.map((f) => f.filename)).toEqual(['plakat-bieg-qr.pdf']);
    const stamped = await kb.file(r.files![0].id);
    expect((await PDFDocument.load(stamped.data)).getPageCount()).toBe(1);
    expect(r.proposals.map((p) => p.tool)).toEqual(['create_task', 'draft_campaign']);
    const camp = r.proposals[1];
    expect(camp.input.emails).toEqual(['sp1@szkola.pl']);          // the school without an email is left out
    expect(camp.warnings.join(' ')).toMatch(/bez wcześniejszego kontaktu/);

    const done = await as.execute(r.proposals.map((p) => ({ tool: p.tool, input: p.input })));
    expect(done.results.every((x) => x.ok)).toBe(true);
    const tasks = await crm.listTasks();
    expect(tasks[0]).toMatchObject({ eventId: ev.id, due: '2026-09-30', attachments: [poster.id] });
    expect(tasks[0].materials.map((m) => m.title)).toEqual(['Tekst dla nauczycieli', 'Post na Facebooka']);
    expect(done.results[1].message).toMatch(/ręcznie: 1/);          // no Resend configured → manual sending

    // tick it off with update_task, adding one more material
    const turns2: any[] = [
      { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'u1', name: 'update_task', input: { task_id: tasks[0].id, status: 'done',
        add_materials: [{ title: 'SMS', body: 'Bieg 10.10!' }] } }] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Odhaczone.' }] },
    ];
    (as as any).client = { beta: { messages: { stream: () => { const t = turns2.shift(); return { finalMessage: async () => t }; } } } };
    const r2 = await as.ask('zrobione teksty na bieg');
    await as.execute(r2.proposals.map((p) => ({ tool: p.tool, input: p.input })));
    const after = (await crm.listTasks())[0];
    expect(after.status).toBe('done');
    expect(after.materials).toHaveLength(3);
    expect(school.id).toBeTruthy();
    await db.close();
  });

  it('puts a written summary with the user notes on top of the report', async () => {
    const db = await openDb('memory://');
    const crm = new Crm(db, 'Martin', () => '2026-09-28');
    const a = new Assistant(crm, 'test-key');
    const fake = fakeClient([{ stop_reason: 'end_turn', content: [{ type: 'text', text: '- Two calls with Cichon.\n- Open day posted on Facebook.' }] }]);
    (a as any).client = fake;
    const r = await a.reportWithSummary('2026-09-22', '2026-09-28', 'Dzień otwarty opublikowany na FB');
    expect(r.text.split('\n').slice(0, 6).join('\n')).toContain('SUMMARY');
    expect(r.text).toContain('  - Open day posted on Facebook.');
    expect(fake.requests[0].messages[0].content).toContain('Dzień otwarty opublikowany na FB');
    expect(fake.requests[0].tools).toBeUndefined();
  });
});

describe('writing style', () => {
  it('passes the user style from the Claude project into the prompt', async () => {
    const db = await openDb('memory://');
    const crm = new Crm(db, 'Martin', () => '2026-09-28');
    await crm.saveStyle({ b2b: 'Krótko, per Pan/Pani, zawsze konkretna propozycja spotkania.' });
    const a = new Assistant(crm, 'test-key');
    const fake = fakeClient([{ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }]);
    (a as any).client = fake;
    await a.ask('napisz maila do Armady');
    expect(fake.requests[0].system[1].text).toContain('per Pan/Pani');
    expect(fake.requests[0].system[1].cache_control).toEqual({ type: 'ephemeral' });
  });
});

describe('web lookups', () => {
  it('gives the assistant web search, without the code sandbox, for an unknown address', async () => {
    const db = await openDb('memory://');
    const crm = new Crm(db, 'Martin', () => '2026-09-28');
    const a = new Assistant(crm, 'test-key');
    const fake = fakeClient([{ stop_reason: 'end_turn', content: [{ type: 'text', text: 'To klub golfowy w Siemianowicach.' }] }]);
    (a as any).client = fake;
    await a.ask('kto to jest biuro@armada-golf.pl?');
    const names = fake.requests[0].tools.map((t: any) => t.name);
    expect(names).toEqual(expect.arrayContaining(['web_search', 'web_fetch', 'find_companies', 'create_company']));
    expect(names).not.toContain('code_execution');
    expect(fake.requests[0].betas).not.toContain('code-execution-2025-08-25');
  });
});

describe('connector for Claude chats', () => {
  it('answers MCP requests and writes through the same checks', async () => {
    const { createApp } = await import('./app.js');
    const { mcpToken } = await import('./mcp.js');
    const { createHash } = await import('node:crypto');
    const db = await openDb('memory://');
    const crm = new Crm(db, 'Martin', () => '2026-09-28');
    await crm.createLead({ company: 'Armada Klub Golfowy', city: 'Katowice' });
    const app = createApp({ crm: async () => crm, password: 'pw' } as any);
    const secret = createHash('sha256').update('crm:pw').digest('hex');
    const rpc = (body: unknown, token = mcpToken(secret)) => app.request(`/api/mcp/${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify(body),
    });

    expect((await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, 'wrong')).status).toBe(404);
    const init = await (await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })).json();
    expect(init.result.serverInfo.name).toBe('crm');
    expect((await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);

    const list = await (await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).json();
    const names = list.result.tools.map((t: any) => t.name);
    expect(names).toEqual(expect.arrayContaining(['find_companies', 'get_people', 'create_task', 'add_note']));
    expect(names).not.toContain('draft_campaign');

    const found = await (await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'find_companies', arguments: { query: 'armada' } } })).json();
    expect(found.result.content[0].text).toContain('Armada');
    const task = await (await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'create_task', arguments: {
      task: 'Mail do Armady', due: '2026-10-02', lead_id: 'L001',
      materials: [{ title: 'Mail', subject: 'Współpraca', body: 'Dzień dobry,\nproponuję spotkanie.' }] } } })).json();
    expect(task.result.isError).toBeUndefined();
    expect((await crm.listTasks())[0].materials[0].subject).toBe('Współpraca');
    const bad = await (await rpc({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'add_note', arguments: { id: 'L999', text: 'x' } } })).json();
    expect(bad.result.isError).toBe(true);

    const call = async (id: number, name: string, args: unknown) => {
      const r = (await (await rpc({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } })).json()).result;
      return { text: r.content[0].text as string, isError: r.isError as boolean | undefined };
    };
    // chats, Studio and the knowledge base stay in claude.ai — the connector keeps to the CRM and B2C
    for (const n of ['log_chat', 'save_design', 'save_note', 'list_chats', 'read_chat', 'search_knowledge']) expect(names).not.toContain(n);
    expect((await call(6, 'log_chat', { chat_title: 'x', user_message: 'a', reply: 'b' })).isError).toBe(true);

    // an old address says what to do; the browser check and Settings show the state
    const stale = await (await rpc({ jsonrpc: '2.0', id: 20, method: 'tools/call', params: { name: 'get_people', arguments: {} } }, 'old')).json();
    expect(stale.result.isError).toBe(true);
    expect(stale.result.content[0].text).toContain('nieaktualny');
    expect((await app.request(`/api/mcp/${mcpToken(secret)}`)).status).toBe(200);
    expect((await app.request('/api/mcp/old')).status).toBe(404);
    expect((await app.request(`/api/mcp/${mcpToken(secret)}`, { headers: { Accept: 'text/event-stream' } })).status).toBe(405);
    const { lastMcp } = await import('./mcp.js');
    const seen = await lastMcp(crm);
    expect(seen.last).toMatchObject({ tool: 'log_chat', ok: false });
    expect(seen.badUrl).toMatchObject({ tool: 'tools/call' });

    // the network: a new name gets saved at once, pinned to the event, and found later by what they do
    const ev = await crm.saveEvent({ title: 'Bieg', date: '2026-10-10' });
    expect((await call(30, 'save_person', { name: 'Marta', kind: 'external', role: 'Animatorka', services: 'animacje dla dzieci',
      event_id: ev.id, event_role: 'animacje' })).isError).toBeUndefined();
    expect((await call(31, 'get_events', {})).text).toContain('Marta');
    const help = JSON.parse((await call(32, 'find_help', { need: 'animacje na piknik' })).text);
    expect(help.people[0]).toMatchObject({ name: 'Marta', kind: 'external' });
    expect(help.people[0].past_events[0]).toContain('animacje');
    expect((await call(33, 'link_person_event', { person_id: help.people[0].id, event_id: 'EV-9999' })).isError).toBe(true);

    // procedures by voice: define, start, see who has what, keep the order
    const pat = await crm.savePerson({ name: 'Patryk' });
    const rom = await crm.savePerson({ name: 'Roma' });
    expect((await call(40, 'save_process', { name: 'Nowy partner', steps: [
      { title: 'Umowa', person_id: String(pat.id), days: 3 }, { title: 'Post', person_id: String(rom.id), days: 2 }] })).isError).toBeUndefined();
    expect((await call(41, 'start_process', { process: 'partner', title: 'Nowy partner: Armada', lead_id: 'L001' })).text).toContain('Umowa (Patryk)');
    expect((await call(42, 'get_processes', {})).text).toMatch(/krok 1\/2 „Umowa” — Patryk/);
    const work = JSON.parse((await call(43, 'get_person_work', { person_id: String(rom.id) })).text);
    expect(work.items[0].state).toContain('czeka na krok 1');
    const out = await call(44, 'update_task', { task_id: work.items[0].task_id, status: 'done' });
    expect(out.isError).toBe(true);
    expect(out.text).toContain('najpierw krok 1');

    // B2C progress from claude.ai
    expect((await call(13, 'b2c_save_item', { title: 'Telefony do rodziców', category: 'Rekrutacja', target: 50, unit: 'telefonów' })).text).toContain('id');
    expect((await call(14, 'b2c_progress', { item: 'telefony', amount: 12, note: 'po dniu otwartym' })).text).toContain('12/50 telefonów, zostało 38');
    expect((await call(15, 'b2c_progress', { item: 'nie ma takiej', amount: 1 })).isError).toBe(true);
    expect((await call(16, 'b2c_status', {})).text).toMatch(/12\/50 telefonów \(24%, zostało 38\), w 7 dni \+12/);
  });
});

describe('studio', () => {
  it('writes versions through the assistant, edits them and serves the page with knowledge images', async () => {
    const { Designs } = await import('./designs.js');
    const { Knowledge } = await import('./knowledge.js');
    const db = await openDb('memory://');
    const crm = new Crm(db, 'Martin', () => '2026-10-07');
    const kb = new Knowledge(db);
    const logo = await kb.add({ filename: 'logo.png', mime: 'image/png', data: new Uint8Array([137, 80, 78, 71, 1, 2, 3]) });
    const ds = new Designs(db);
    const d = await ds.create({ title: 'Nowy', kind: 'deck' });

    const a = new Assistant(crm, 'test-key');
    const fake = fakeClient([
      { stop_reason: 'tool_use', content: [toolUse('t1', 'write_document', {
        title: 'Partnerstwa B2B', note: 'Pierwsza wersja', html: `<!doctype html><html><body><section class="slide"><img src="kb://${logo.id}">Slajd 1</section></body></html>` })] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Gotowe: 1 slajd.' }] },
      { stop_reason: 'tool_use', content: [toolUse('t2', 'write_document', {
        note: 'Dodany slajd 2', html: '<!doctype html><html><body><section class="slide">Slajd 1</section><section class="slide">Slajd 2</section></body></html>' })] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Dodałem slajd.' }] },
    ]);
    (a as any).client = fake;

    const v1 = await a.designTurn(ds, d.id, 'zrób prezentację B2B');
    expect(v1).toMatchObject({ title: 'Partnerstwa B2B', versions: [{ note: 'Pierwsza wersja' }] });
    expect(v1.chat.map((m) => m.text)).toEqual(['zrób prezentację B2B', 'Gotowe: 1 slajd.']);
    expect(fake.requests[0].tools.map((t: any) => t.name)).toEqual(expect.arrayContaining(['write_document', 'search_knowledge', 'code_execution']));

    const v2 = await a.designTurn(ds, d.id, 'dodaj slajd 2');
    expect(v2.versions).toHaveLength(2);
    expect(fake.requests[2].messages.at(-1).content.at(-1).text).toContain('Obecna wersja (1)');   // the edit sees the current page

    const fake2 = fakeClient([
      { stop_reason: 'tool_use', content: [toolUse('t3', 'edit_document', { note: 'Tytuł', edits: [{ find: 'Slajd 2', replace: 'Cennik' }] })] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Zmieniłem tytuł.' }] },
    ]);
    (a as any).client = fake2;
    const v3 = await a.designTurn(ds, d.id, 'zmień tytuł drugiego slajdu na Cennik');
    expect(v3.versions.at(-1)!.html).toContain('Cennik');
    expect(v3.versions.at(-1)!.html).toContain('Slajd 1');

    const page = await ds.render(kb, d.id, 0);
    expect(page.html).toContain('data:image/png;base64,');
    expect((await ds.restore(d.id, 0)).versions).toHaveLength(4);
  });
});

describe('chats', () => {
  it('files a mail written from the mic into the B2B chat and talks inside a chat with its history', async () => {
    const { Threads } = await import('./threads.js');
    const db = await openDb('memory://');
    const crm = new Crm(db, 'Martin', () => '2026-10-07');
    const lead = await crm.createLead({ company: 'Multisport', email: 'b2b@multisport.pl' });
    const ts = new Threads(db);
    const b2b = await ts.create({ title: 'B2B maile', source: 'claude', messages: [{ role: 'user', text: 'pisz krótko' }, { role: 'assistant', text: 'Jasne.' }] });
    expect(b2b.mode).toBe('b2b');

    const a = new Assistant(crm, 'test-key');
    const fake = fakeClient([
      { stop_reason: 'tool_use', content: [toolUse('t1', 'read_chat', { chat_id: b2b.id }), toolUse('t2', 'save_to_chat', { chat_id: b2b.id })] },
      { stop_reason: 'tool_use', content: [toolUse('t3', 'draft_email', { id: lead.id, to: 'b2b@multisport.pl', subject: 'Współpraca', body: 'Dzień dobry,\nzapraszamy.' })] },
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Mail gotowy.' }] },
    ]);
    (a as any).client = fake;
    const r = await a.ask('napisz maila do Multisportu');
    expect(r.savedTo).toEqual({ id: b2b.id, title: 'B2B maile' });
    expect(fake.requests[0].system.at(-1).text).toContain('B2B maile');
    expect(fake.requests[1].messages.at(-1).content[0].content).toContain('pisz krótko');      // it read the chat
    const after = await ts.get(b2b.id);
    expect(after.messages.at(-2)).toMatchObject({ role: 'user', text: 'napisz maila do Multisportu', via: 'mikrofon' });
    expect(after.messages.at(-1)!.text).toContain('Temat: Współpraca');

    const fake2 = fakeClient([{ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Krócej: …' }] }]);
    (a as any).client = fake2;
    await a.ask('a teraz krócej', [], { threadId: b2b.id });
    expect(fake2.requests[0].messages.map((m: any) => typeof m.content === 'string' ? m.content : m.content.at(-1).text)).toContain('pisz krótko');
    expect((await ts.get(b2b.id)).messages.at(-1)).toMatchObject({ text: 'Krócej: …', via: 'czat' });
  });
});
