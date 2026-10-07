import { describe, expect, it, beforeAll, beforeEach, afterAll } from 'vitest';
import { openDb, type DB } from './db.js';
import { Crm, HttpError } from './crm.js';
import { autoStage, companyKey, normDate, normPhone, normUrl, priority, quickDates } from '../shared/domain.js';

describe('normalisation', () => {
  it('formats Polish phone numbers', () => {
    expect(normPhone('+48 607257376')).toBe('607 257 376');
    expect(normPhone('0048-607-257-376')).toBe('607 257 376');
    expect(normPhone('607 257 376 // 32 123 45 67')).toBe('607 257 376');
    expect(normPhone('12345')).toBe('');
  });
  it('treats legal forms and diacritics as noise in company names', () => {
    expect(companyKey('Żabka Polska Sp. z o.o.')).toBe(companyKey('zabka'));
    expect(companyKey('ABC S.A.')).toBe('abc');
  });
  it('reads the date formats people type', () => {
    expect(normDate('10.09.2026')).toBe('2026-09-10');
    expect(normDate('1/2/2026')).toBe('2026-02-01');
    expect(normDate('2026-9-3')).toBe('2026-09-03');
    expect(normDate('soon')).toBe('');
  });
  it('drops URL placeholders', () => {
    expect(normUrl('szukaj w Google')).toBe('');
    expect(normUrl('firma.pl')).toBe('https://firma.pl');
  });
  it('offers follow-up dates that are never today', () => {
    for (const q of quickDates('2026-10-02')) expect(q.date > '2026-10-02').toBe(true); // a Friday
  });
});

describe('rules', () => {
  it('computes priority like the sheet formula', () => {
    expect(priority({ stage: 'new', phone: 'x', email: 'y' }, 3)).toBe(6);
    expect(priority({ stage: 'negotiation', phone: '', email: '' }, undefined)).toBe(4);
    expect(priority({ stage: 'disqualified', phone: 'x', email: 'y' }, 3)).toBe(0);
  });
  it('moves stage forward only on real outreach', () => {
    expect(autoStage('new', 'Call', 'no answer')).toBe('contacting');
    expect(autoStage('new', 'Call', 'planned')).toBe('new');
    expect(autoStage('new', 'Note', 'done')).toBe('new');
    expect(autoStage('contacting', 'Meeting', 'reached')).toBe('scheduled visit');
    expect(autoStage('negotiation', 'Visit', 'done')).toBe('negotiation');
  });
});

describe('Crm', () => {
  let crm: Crm;
  let db: DB;
  let day = '2026-09-28';
  beforeAll(async () => { db = await openDb('memory://'); });
  afterAll(() => db.close());
  beforeEach(async () => {
    day = '2026-09-28';
    await db.exec('TRUNCATE crm.activities, crm.tasks, crm.events, crm.leads, crm.segments, crm.templates RESTART IDENTITY');
    crm = new Crm(db, 'Martin', () => day);
    await crm.saveSegment({ name: 'PRZEMYSŁ', weight: 3, why: 'Benefit for employees' });
  });

  it('blocks duplicate companies', async () => {
    await crm.createLead({ company: 'Acme Sp. z o.o.', segment: 'PRZEMYSŁ', phone: '+48 600 100 200' });
    await expect(crm.createLead({ company: 'ACME' })).rejects.toThrow(/już jest w bazie/);
  });

  it('derives next/last contact from activities instead of storing them twice', async () => {
    const l = await crm.createLead({ company: 'Acme', segment: 'PRZEMYSŁ', phone: '600100200', email: 'a@acme.pl' });
    expect(l.priority).toBe(6);
    expect(l.why).toBe('Benefit for employees');
    expect(l.lastContact).toBe('');

    let card = await crm.logActivity(l.id, { type: 'Call', result: 'no answer', followUp: { date: '2026-09-30' } });
    expect(card.lead.stage).toBe('contacting');
    expect(card.lead.nextContact).toBe('2026-09-30');
    expect(card.lead.lastContact).toBe('');                 // a missed call is not a contact

    const planned = card.activities.find((a) => a.result === 'planned')!;
    day = '2026-10-01';                                     // ticked a day late
    card = await crm.completeActivity(planned.id, { result: 'reached', note: 'wants a visit', stage: 'scheduled visit' });
    const done = card.activities.find((a) => a.id === planned.id)!;
    expect(done.date).toBe('2026-10-01');
    expect(done.note).toMatch(/plan: 2026-09-30/);
    expect(done.stageTo).toBe('scheduled visit');
    expect(card.lead.lastContact).toBe('2026-10-01');
    expect(card.lead.nextContact).toBe('');
    expect(card.lead.priority).toBe(9);
  });

  it('requires a reason to disqualify and cancels open follow-ups', async () => {
    const l = await crm.createLead({ company: 'Beta' });
    await crm.logActivity(l.id, { type: 'Call', result: 'planned', date: '2026-10-05' });
    await expect(crm.setStage(l.id, 'disqualified')).rejects.toThrow(HttpError);
    const card = await crm.setStage(l.id, 'disqualified', 'Too small');
    expect(card.lead.nextContact).toBe('');
    expect(card.activities.some((a) => a.result === 'cancelled')).toBe(true);
    const rep = (await crm.report('2026-09-22', '2026-09-28')).text;
    expect(rep).toContain('Beta - Too small');
  });

  it('refuses to log something finished in the future', async () => {
    const l = await crm.createLead({ company: 'Gamma' });
    await expect(crm.logActivity(l.id, { type: 'Call', result: 'reached', date: '2026-10-10' })).rejects.toThrow(/przyszłości/);
  });

  it('builds a weekly report', async () => {
    const a = await crm.createLead({ company: 'Alfa' });
    await crm.logActivity(a.id, { type: 'Call', result: 'reached' });
    await crm.logActivity(a.id, { type: 'Email', result: 'done' });
    const text = (await crm.report('2026-09-22', '2026-09-28')).text;
    expect(text).toContain('Contacted 1 company');
    expect(text).toContain('Call 1');
    expect(text).toContain('Contacting - contact attempted (1)');
    expect(text).toContain('Pipeline now:');
    // a lead last touched before the period stays out of the list, even though it is in "contacting"
    const old = await crm.createLead({ company: 'Stara Firma' });
    await crm.logActivity(old.id, { type: 'Call', result: 'reached', date: '2026-09-10' });
    const again = (await crm.report('2026-09-22', '2026-09-28')).text;
    expect(again).not.toContain('Stara Firma');
    expect(again).toContain('Alfa - Call, Email [new -> contacting]');
  });

  it('renames a segment together with its leads', async () => {
    const l = await crm.createLead({ company: 'Delta', segment: 'PRZEMYSŁ' });
    await crm.saveSegment({ originalName: 'PRZEMYSŁ', name: 'INDUSTRY', weight: 3 });
    expect((await crm.getLead(l.id)).segment).toBe('INDUSTRY');
    await expect(crm.deleteSegment('INDUSTRY')).rejects.toThrow(/nadal ma segment/);
  });

  it('numbers events and tasks and cascades deletes', async () => {
    const e = await crm.saveEvent({ title: 'Open day', date: '2026-10-21' });
    expect(e.id).toBe('EV-0001');
    const t = await crm.saveTask({ eventId: e.id, task: 'Posters', due: '2026-10-10' });
    expect((await crm.toggleTask(t.id)).completed).toBe('2026-09-28');
    await crm.deleteEvent(e.id);
    expect(await crm.listTasks()).toHaveLength(0);
  });

  it('keeps people, ties tasks to them and keeps an email subject out of the body', async () => {
    const p = await crm.savePerson({ name: 'Patryk Nowak', role: 'Dyrektor', email: 'Patryk@Szkola.pl', aliases: 'dyrektor' });
    expect(p.email).toBe('patryk@szkola.pl');
    const t = await crm.saveTask({ task: 'Wyślij dyrektorowi plan biegu', due: '2026-09-25', personId: p.id,
      materials: [{ title: 'Mail do dyrektora', body: 'Temat: Plan biegu\n\nDzień dobry,\nprzesyłam plan.' }] });
    expect(t.person).toMatchObject({ name: 'Patryk Nowak', email: 'patryk@szkola.pl' });
    expect(t.materials[0]).toEqual({ title: 'Mail do dyrektora', subject: 'Plan biegu', body: 'Dzień dobry,\nprzesyłam plan.' });

    // overdue project tasks reach the dashboard; ticking one off counts a contact with the person
    expect((await crm.dashboard()).tasks.map((x) => x.id)).toContain(t.id);
    await crm.toggleTask(t.id);
    expect((await crm.getPerson(p.id)).contacts).toBe(1);
    expect((await crm.dashboard()).tasksDoneToday).toBe(1);
    await crm.deletePerson(p.id);
    expect((await crm.listTasks()).find((x) => x.id === t.id)!.personId).toBe(0);
  });
});

describe('import from the sheet', () => {
  it('reads the original workbook layout', async () => {
    const XLSX = (await import('xlsx')).default;
    const { importWorkbook } = await import('./spreadsheet.js');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['ID', 'Segment', 'Firma', 'Telefon', 'Email', 'Status', 'Ostatni kontakt', 'Następny kontakt'],
      ['L001', 'PRZEMYSŁ', 'Acme', '+48 600100200', 'a@acme.pl', 'contacting', '10.09.2026', '2026-10-01'],
      ['L002', 'NOWY', 'Beta', '', '', 'new', '', ''],
    ]), 'CRM');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['ID', 'Lead ID', 'Date', 'Type', 'Note', 'Owner', 'Result'],
      ['H1', 'L001', '2026-09-10', 'Note', 'new → contacting', 'Martin', 'done'],
      ['H2', 'L999', '2026-09-10', 'Call', 'orphan', 'Martin', 'done'],
    ]), 'History');
    const db = await openDb('memory://');
    const rep = await importWorkbook(db, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), '2026-09-28', 'Martin');
    expect(rep).toMatchObject({ leads: 2, activities: 1, carriedOver: 1, skippedActivities: 1 });
    const crm = new Crm(db, 'Martin', () => '2026-09-28');
    const acme = await crm.getLead('L001');
    expect(acme).toMatchObject({ phone: '600 100 200', lastContact: '2026-09-10', nextContact: '2026-10-01' });
    const card = await crm.leadCard('L001');
    expect(card.activities.find((a) => a.stageTo)?.stageTo).toBe('contacting');
    await db.close();
  });
});

describe('connection strings', () => {
  it('drops libpq-only options that postgres.js would forward', async () => {
    const { cleanUrl } = await import('./db.js');
    expect(cleanUrl('postgres://u:p@h.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x'))
      .toBe('postgres://u:p@h.supabase.com:6543/postgres');
    expect(cleanUrl('postgresql://u:p@ep-x.neon.tech/db?sslmode=require&channel_binding=require&application_name=crm'))
      .toBe('postgresql://u:p@ep-x.neon.tech/db?application_name=crm');
  });
});

describe('login', () => {
  it('online without a password serves nothing; with one it needs the login', async () => {
    const { createApp } = await import('./app.js');
    const db = await openDb('memory://');
    const crm = new Crm(db, 'Martin', () => '2026-10-07');
    const open = createApp({ crm: async () => crm, requirePassword: true });
    expect(await (await open.request('/api/me')).json()).toMatchObject({ setupNeeded: true, authenticated: false });
    expect((await open.request('/api/leads')).status).toBe(503);
    expect((await open.request('/api/mcp/x', { method: 'POST', body: '{}' })).status).toBe(503);

    const locked = createApp({ crm: async () => crm, password: 'tajne-haslo-123', requirePassword: true });
    expect((await locked.request('/api/leads')).status).toBe(401);
    expect((await locked.request('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'zle' }) })).status).toBe(401);
    const ok = await locked.request('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'tajne-haslo-123' }) });
    const cookie = ok.headers.get('set-cookie')!.split(';')[0];
    expect((await locked.request('/api/leads', { headers: { cookie } })).status).toBe(200);
  });
});

describe('network of people', () => {
  it('keeps who does what, links them to events and finds help for a need', async () => {
    const db = await openDb('memory://');
    const crm = new Crm(db, 'Martin', () => '2026-10-07');
    const ev = await crm.saveEvent({ title: 'Bieg Terry\'ego Foxa', date: '2026-10-10' });
    const marta = await crm.savePerson({ name: 'Marta', kind: 'external', role: 'Animatorka', services: 'animacje dla dzieci, malowanie twarzy' });
    const marcin = await crm.savePerson({ name: 'Marcin', kind: 'external', company: 'Event 360', services: 'ławy, stoły, namioty' });
    await crm.savePerson({ name: 'Patryk Kundera', role: 'Wicedyrektor', services: 'tatuaże, grafika' });
    await crm.createLead({ company: 'Drukarnia Logo-Print', city: 'Katowice', industry: 'druk reklamowy, nadruki z logo' });

    await crm.linkPersonEvent(ev.id, marta.id, 'animacje');
    await crm.linkPersonEvent(ev.id, marcin.id, 'ławy i stoły');
    await crm.linkPersonEvent(ev.id, marta.id, '');             // again without a role keeps the role
    expect((await crm.eventPeople(ev.id)).map((p) => `${p.name}:${p.role}`)).toEqual(['Marcin:ławy i stoły', 'Marta:animacje']);
    expect((await crm.getPerson(marta.id)).events).toEqual([{ eventId: ev.id, title: 'Bieg Terry\'ego Foxa', date: '2026-10-10', role: 'animacje' }]);
    expect((await crm.getPerson(marcin.id))).toMatchObject({ kind: 'external', company: 'Event 360' });

    const anim = await crm.findHelp('animacje na piknik wielokulturowy');
    expect(anim.people[0].name).toBe('Marta');
    expect(anim.people[0].past_events[0]).toContain('Bieg');
    const print = await crm.findHelp('wydrukować rzeczy z logotypem');
    expect(print.companies[0].company).toBe('Drukarnia Logo-Print');
    expect((await crm.findHelp('stoły')).people[0].name).toBe('Marcin');

    await crm.deletePerson(marta.id);
    expect(await crm.eventPeople(ev.id)).toHaveLength(1);
  });

  it('puts active partners into the network on their own', async () => {
    const db = await openDb('memory://');
    const crm = new Crm(db, 'Martin', () => '2026-10-07');
    const armada = await crm.createLead({ company: 'Armada Klub Golfowy', person: 'Jan Nowak', phone: '600 100 200', industry: 'golf' });
    const ev360 = await crm.createLead({ company: 'Event 360' });
    const marcin = await crm.savePerson({ name: 'Marcin (Event 360)', role: 'wypożyczenie ław i stołów', services: 'ławy, stoły' });
    expect(await crm.listPeople()).toHaveLength(1);

    await crm.setStage(armada.id, 'active');
    await crm.setStage(ev360.id, 'active');
    const people = await crm.listPeople();
    expect(people).toHaveLength(2);                                   // Marcin linked, not duplicated
    expect(people.find((p) => p.name === 'Jan Nowak')).toMatchObject({ kind: 'external', company: 'Armada Klub Golfowy', leadId: armada.id, partner: true, services: 'golf' });
    expect(await crm.getPerson(marcin.id)).toMatchObject({ leadId: ev360.id, partner: true, company: 'Event 360', kind: 'external' });
    expect(await crm.listPeople()).toHaveLength(2);                   // idempotent

    await crm.setStage(armada.id, 'negotiation');
    expect((await crm.listPeople()).find((p) => p.name === 'Jan Nowak')!.partner).toBe(false);
  });
});

describe('procedures', () => {
  it('runs steps in order, starts the next one, shows who has what and where it is stuck', async () => {
    const { Processes } = await import('./processes.js');
    const db = await openDb('memory://');
    let today = '2026-10-07';
    const crm = new Crm(db, 'Martin', () => today);
    const pr = new Processes(crm);
    const patryk = await crm.savePerson({ name: 'Patryk' });
    const roma = await crm.savePerson({ name: 'Roma' });
    const lead = await crm.createLead({ company: 'Armada' });
    const proc = await pr.save({ name: 'Nowy partner', steps: [
      { title: 'Umowa partnerska', personId: patryk.id, days: 3, doneWhen: 'podpisana przez obie strony' },
      { title: 'Post o partnerstwie', personId: roma.id, days: 2 },
      { title: 'Logo na stronie', personId: 0, days: 5 },
    ] });
    const run = await pr.start({ processId: proc.id, title: 'Nowy partner: Armada', leadId: lead.id });
    expect(run.current).toBe(1);
    expect(run.steps.map((s) => [s.person, s.due])).toEqual([['Patryk', '2026-10-10'], ['Roma', ''], ['', '']]);

    // Roma's step waits for Patryk — and cannot be ticked off before
    const romaWork = await pr.personWork(roma.id);
    expect(romaWork.items[0].state).toContain('czeka na krok 1');
    await expect(crm.toggleTask(run.steps[1].taskId)).rejects.toThrow(/najpierw musi być zrobiony krok 1/);

    // Patryk late → stuck; blocked reason shows too
    today = '2026-10-12';
    expect((await pr.run(run.id)).stuck).toEqual(['spóźnione o 2 dni']);
    await crm.saveTask({ id: run.steps[0].taskId, blocked: 'Armada nie odesłała skanu' });
    expect((await pr.run(run.id)).stuck[0]).toContain('Armada nie odesłała');
    expect(await pr.status(true)).toContain('UTKNĘŁO');

    // done → next step starts with its own clock
    await crm.toggleTask(run.steps[0].taskId);
    const after = await pr.run(run.id);
    expect(after.current).toBe(2);
    expect(after.steps[1]).toMatchObject({ due: '2026-10-14', started: '2026-10-12' });
    expect((await pr.personWork(roma.id)).items[0].state).toBe('teraz jego/jej ruch');
    expect((await crm.listTasks()).find((t) => t.id === run.steps[1].taskId)!.run).toEqual({ title: 'Nowy partner: Armada', process: 'Nowy partner', steps: 3 });

    await crm.toggleTask(run.steps[1].taskId);
    expect((await pr.run(run.id)).stuck).toEqual(['nikt nie jest przypisany']);
    await crm.toggleTask(run.steps[2].taskId);
    expect(await pr.run(run.id)).toMatchObject({ status: 'done', current: 0, finished: '2026-10-12' });
    await expect(pr.remove(proc.id)).resolves.toEqual({ ok: true });
  });
});

describe('learning procedures from history', () => {
  it('proposes a procedure from repeated checklists, when to start it, and fixes from finished runs', async () => {
    const { suggestProcesses } = await import('./suggest.js');
    const { Processes } = await import('./processes.js');
    const db = await openDb('memory://');
    let today = '2026-10-07';
    const crm = new Crm(db, 'Martin', () => today);
    const roma = await crm.savePerson({ name: 'Roma' });
    const patryk = await crm.savePerson({ name: 'Patryk' });
    for (const [title, date] of [['Dzień otwarty wrzesień', '2026-09-10'], ['Dzień otwarty czerwiec', '2026-06-12']] as const) {
      const e = await crm.saveEvent({ title, type: 'Open day', date, status: 'done' });
      await crm.saveTask({ eventId: e.id, task: 'Post na Facebooku o dniu otwartym', personId: roma.id, due: new Date(Date.parse(date) - 14 * 864e5).toISOString().slice(0, 10) });
      await crm.saveTask({ eventId: e.id, task: 'Zamówić catering', personId: patryk.id, due: new Date(Date.parse(date) - 7 * 864e5).toISOString().slice(0, 10) });
      await crm.saveTask({ eventId: e.id, task: 'Wydrukować plakaty', personId: patryk.id, due: new Date(Date.parse(date) - 10 * 864e5).toISOString().slice(0, 10) });
    }
    const next = await crm.saveEvent({ title: 'Dzień otwarty październik', type: 'Open day', date: '2026-10-21' });

    let s = await suggestProcesses(crm);
    const fresh = s.find((x) => x.kind === 'new')!;
    expect(fresh.title).toBe('Przygotowanie: Dzień otwarty');
    expect(fresh.steps!.map((x) => [x.title, x.person, x.daysBefore])).toEqual([
      ['Post na Facebooku o dniu otwartym', 'Roma', 14], ['Wydrukować plakaty', 'Patryk', 10], ['Zamówić catering', 'Patryk', 7]]);
    expect(s.find((x) => x.kind === 'start')).toMatchObject({ eventId: next.id });

    // once saved, the "new" one goes away and "start" points at it
    const pr = new Processes(crm);
    const proc = await pr.save({ name: 'Przygotowanie: Dzień otwarty', steps: fresh.steps!.map((x) => ({ title: x.title, personId: x.personId, days: 2 })) });
    s = await suggestProcesses(crm);
    expect(s.some((x) => x.kind === 'new')).toBe(false);
    expect(s.find((x) => x.kind === 'start')).toMatchObject({ processId: proc.id });

    // two runs where step 1 took 6 days instead of 2 → adjust
    for (const t of ['A', 'B']) {
      today = '2026-10-01';
      const run = await pr.start({ processId: proc.id, title: t });
      today = '2026-10-07';
      for (const st of run.steps) await crm.toggleTask(st.taskId);
    }
    s = await suggestProcesses(crm);
    expect(s.find((x) => x.kind === 'adjust')!.changes![0]).toContain('w praktyce zwykle 6');
  });
});
