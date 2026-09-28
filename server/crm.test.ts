import { describe, expect, it, beforeEach } from 'vitest';
import { openDb } from './db.ts';
import { Crm, HttpError } from './crm.ts';
import { autoStage, companyKey, normDate, normPhone, normUrl, priority, quickDates } from '../shared/domain.ts';

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
  let day = '2026-09-28';
  beforeEach(() => {
    day = '2026-09-28';
    crm = new Crm(openDb(':memory:'), 'Martin', () => day);
    crm.saveSegment({ name: 'PRZEMYSŁ', weight: 3, why: 'Benefit for employees' });
  });

  it('blocks duplicate companies', () => {
    crm.createLead({ company: 'Acme Sp. z o.o.', segment: 'PRZEMYSŁ', phone: '+48 600 100 200' });
    expect(() => crm.createLead({ company: 'ACME' })).toThrow(/Already in the base/);
  });

  it('derives next/last contact from activities instead of storing them twice', () => {
    const l = crm.createLead({ company: 'Acme', segment: 'PRZEMYSŁ', phone: '600100200', email: 'a@acme.pl' });
    expect(l.priority).toBe(6);
    expect(l.why).toBe('Benefit for employees');
    expect(l.lastContact).toBe('');

    let card = crm.logActivity(l.id, { type: 'Call', result: 'no answer', followUp: { date: '2026-09-30' } });
    expect(card.lead.stage).toBe('contacting');
    expect(card.lead.nextContact).toBe('2026-09-30');
    expect(card.lead.lastContact).toBe('');                 // a missed call is not a contact

    const planned = card.activities.find((a) => a.result === 'planned')!;
    day = '2026-10-01';                                     // ticked a day late
    card = crm.completeActivity(planned.id, { result: 'reached', note: 'wants a visit', stage: 'scheduled visit' });
    const done = card.activities.find((a) => a.id === planned.id)!;
    expect(done.date).toBe('2026-10-01');
    expect(done.note).toMatch(/planned for 2026-09-30/);
    expect(done.stageTo).toBe('scheduled visit');
    expect(card.lead.lastContact).toBe('2026-10-01');
    expect(card.lead.nextContact).toBe('');
    expect(card.lead.priority).toBe(9);
  });

  it('requires a reason to disqualify and cancels open follow-ups', () => {
    const l = crm.createLead({ company: 'Beta' });
    crm.logActivity(l.id, { type: 'Call', result: 'planned', date: '2026-10-05' });
    expect(() => crm.setStage(l.id, 'disqualified')).toThrow(HttpError);
    const card = crm.setStage(l.id, 'disqualified', 'Too small');
    expect(card.lead.nextContact).toBe('');
    expect(card.activities.some((a) => a.result === 'cancelled')).toBe(true);
    const rep = crm.report('2026-09-22', '2026-09-28').text;
    expect(rep).toContain('Beta - Too small');
  });

  it('refuses to log something finished in the future', () => {
    const l = crm.createLead({ company: 'Gamma' });
    expect(() => crm.logActivity(l.id, { type: 'Call', result: 'reached', date: '2026-10-10' })).toThrow(/future/);
  });

  it('builds a weekly report', () => {
    const a = crm.createLead({ company: 'Alfa' });
    crm.logActivity(a.id, { type: 'Call', result: 'reached' });
    crm.logActivity(a.id, { type: 'Email', result: 'done' });
    const text = crm.report('2026-09-22', '2026-09-28').text;
    expect(text).toContain('Contacted 1 company');
    expect(text).toContain('Call 1');
    expect(text).toContain('Contacting - contact attempted (1)');
  });

  it('renames a segment together with its leads', () => {
    const l = crm.createLead({ company: 'Delta', segment: 'PRZEMYSŁ' });
    crm.saveSegment({ originalName: 'PRZEMYSŁ', name: 'INDUSTRY', weight: 3 });
    expect(crm.getLead(l.id).segment).toBe('INDUSTRY');
    expect(() => crm.deleteSegment('INDUSTRY')).toThrow(/still use/);
  });

  it('numbers events and tasks and cascades deletes', () => {
    const e = crm.saveEvent({ title: 'Open day', date: '2026-10-21' });
    expect(e.id).toBe('EV-0001');
    const t = crm.saveTask({ eventId: e.id, task: 'Posters', due: '2026-10-10' });
    expect(crm.toggleTask(t.id).completed).toBe('2026-09-28');
    crm.deleteEvent(e.id);
    expect(crm.listTasks()).toHaveLength(0);
  });
});
