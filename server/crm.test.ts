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
