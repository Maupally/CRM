import { describe, expect, it } from 'vitest';
import { buildBoard, count, kindOfExport, sanitizeBoard } from '../shared/classboard.js';

const ay = (g: Record<string, string>) => JSON.stringify(Object.entries(g).map(([academic_year, grade]) => ({ academic_year, grade, stage: null })));

describe('class board', () => {
  it('places attending, leaving, joining and potential children by class, youngest first, with no personal data', () => {
    const students = [
      { status: 'invoiced', birthday: '2020-03-02', gender: 'Female', academic_year_data: ay({ 2627: 'grade_0' }), first_name: 'Ala' },
      { status: 'invoiced', birthday: '2023-05-01', gender: 'Male', academic_year_data: ay({ 2627: 'nursery' }) },
      { status: 'leaving_cy', birthday: '2022-04-13', gender: 'Male', academic_year_data: ay({ 2627: 'jk' }) },
      { status: 'starting_ny', birthday: '2023-01-25', gender: 'Female', start_date: '2027-09-01', academic_year_data: ay({ 2627: 'nursery', 2728: 'jk' }) },
      { status: 'dropped_out', birthday: '2019-01-01', gender: 'Male', academic_year_data: ay({ 2627: 'grade_1' }) },
    ];
    const leads = [
      { status: 'active', grade: 'grade_0', academic_year: '2627', pipeline_status: 'meeting_booked', lead_score: '30', title: 'Jan Kowalski', contact_1_email: 'x@y.pl' },
      { status: 'future_lead', grade: 'grade_1', academic_year: '2728', pipeline_status: 'contacted', title: 'mama@x.pl' },
      { status: 'future_lead', grade: null, academic_year: null, pipeline_status: 'contacted' },
      { status: 'disqualified', grade: 'sk', academic_year: '2627' },
      { status: 'enrolled', grade: 'sk', academic_year: '2627' },
    ];
    expect(kindOfExport(['id', 'birthday', 'academic_year_data'])).toBe('students');
    expect(kindOfExport(['id', 'grade', 'pipeline_status'])).toBe('leads');
    const b = buildBoard(students, leads, '2627', '2026-10-23');
    expect(b.columns.map((c) => c.label)).toEqual(['Nursery', 'JK', 'SK', 'Grade 0', 'Bez klasy']);
    const [nursery, jk, , g0] = b.columns;
    expect([count(nursery, 'current'), count(nursery, 'joining')]).toEqual([1, 1]);
    expect(count(jk, 'leaving')).toBe(1);
    // a 27/28 Grade 1 lead is today's Grade 0 cohort
    expect([count(g0, 'current'), count(g0, 'potential')]).toEqual([1, 2]);
    expect(nursery.cohort).toBe('rocznik 2023');
    expect(g0.entries.filter((e) => e.kind === 'potential').map((e) => e.chance)).toEqual([30, 0]);
    expect(b.skipped).toMatchObject({ dropped: 1, disqualified: 1 });
    // names are there for the screen only; contacts never
    expect(nursery.entries.length).toBeGreaterThan(0);
    expect(JSON.stringify(b)).toMatch(/Kowalski/);
    expect(JSON.stringify(b)).not.toMatch(/x@y|mama@x/);
    expect(JSON.stringify(sanitizeBoard(b, '2627'))).not.toMatch(/Ala|Kowalski/);
    // the server keeps only the anonymous fields, even if something else is sent
    const evil = { ...b, columns: [{ ...b.columns[0], entries: [{ kind: 'current', born: '2023-05', name: 'Ala', stage: 'Ala Kowalska' }] }] } as any;
    expect(JSON.stringify(sanitizeBoard(evil, '2627'))).not.toMatch(/Ala/);
  });
});
