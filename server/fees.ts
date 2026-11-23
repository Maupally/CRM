/** The fee book: defaults from shared/fees.ts, edits made in Opal5 stored in settings. */
import type { Crm } from './crm.js';
import { HttpError } from './crm.js';
import { CITIES, CITY_NAME, DEFAULT_FEES, materialsText, mergeFees, pln, schoolYear, yearFor, type City, type FeeYear, type FeesView } from '../shared/fees.js';

const KEY = 'fees.book';

async function saved(crm: Crm): Promise<Partial<Record<City, Record<string, FeeYear>>>> {
  try { return JSON.parse(await crm.setting(KEY)) || {}; } catch { return {}; }
}

export async function getFees(crm: Crm): Promise<FeesView> {
  const s = await saved(crm);
  const edited = CITIES.flatMap((c) => Object.keys(s[c] || {}).map((y) => `${c}:${y}`));
  return { book: mergeFees(s), edited, current: schoolYear(crm.today()) };
}

const YEAR = /^\d{4}\/\d{2}$/;
const num = (v: unknown) => { const n = Number(String(v ?? '').replace(/[^\d.,-]/g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined; };

function clean(v: any): FeeYear {
  const bi = (x: any) => ({ pl: String(x?.pl ?? '').trim(), en: String(x?.en ?? x?.pl ?? '').trim() });
  const items = (a: any) => (Array.isArray(a) ? a : []).map((i: any) => ({ label: bi(i.label), value: bi(i.value), ...(i.note?.pl || i.note?.en ? { note: bi(i.note) } : {}) })).filter((i) => i.label.pl);
  const list = (a: any) => ({ pl: (a?.pl || []).map((x: any) => String(x).trim()).filter(Boolean), en: (a?.en || []).map((x: any) => String(x).trim()).filter(Boolean) });
  const rows = (Array.isArray(v?.rows) ? v.rows : []).map((r: any) => ({
    level: bi(r.level), monthly: num(r.monthly) || 0, months: num(r.months), enrol: num(r.enrol), materials: num(r.materials),
    materialsPer: r.materialsPer === 'month' ? 'month' as const : 'year' as const,
  })).filter((r: any) => r.level.pl && r.monthly);
  if (!rows.length) throw new HttpError(400, 'Cennik musi mieć choć jeden poziom z czesnym.');
  return {
    status: v?.status === 'draft' ? 'draft' : 'confirmed', source: String(v?.source || 'Edytowane w Opal5').trim(), hours: String(v?.hours || '').trim() || undefined,
    rows, discounts: items(v?.discounts), extras: items(v?.extras), included: list(v?.included), notIncluded: list(v?.notIncluded),
    note: String(v?.note || '').trim() || undefined,
  };
}

/** Saves one city's price list for one school year (a new year is added). */
export async function saveFeeYear(crm: Crm, city: string, year: string, v: unknown) {
  if (!CITIES.includes(city as City)) throw new HttpError(400, `Nie ma miasta ${city}.`);
  if (!YEAR.test(year)) throw new HttpError(400, 'Rok szkolny w formacie 2027/28.');
  const s = await saved(crm);
  s[city as City] = { ...(s[city as City] || {}), [year]: clean(v) };
  await crm.setSetting(KEY, JSON.stringify(s));
  return getFees(crm);
}

/** Drops the edits: back to the default list (or removes a year that only existed as an edit). */
export async function resetFeeYear(crm: Crm, city: string, year: string) {
  const s = await saved(crm);
  if (s[city as City]) delete s[city as City]![year];
  await crm.setSetting(KEY, JSON.stringify(s));
  return getFees(crm);
}

/** For Claude: the price list that applies to a start date (or a year), with the other year for comparison. */
export async function feesText(crm: Crm, input: { city?: string; start_date?: string; year?: string }) {
  const { book } = await getFees(crm);
  const cities = input.city ? CITIES.filter((c) => c === input.city || CITY_NAME[c].toLowerCase() === String(input.city).toLowerCase()) : ['katowice' as City];
  if (!cities.length) throw new Error(`Nie ma cennika dla ${input.city}. Miasta: ${CITIES.join(', ')}.`);
  const start = /^\d{4}-\d{2}-\d{2}$/.test(input.start_date || '') ? input.start_date! : crm.today();
  return JSON.stringify(cities.map((c) => {
    const year = input.year && book[c][input.year] ? input.year : yearFor(book, c, start);
    const f = book[c][year];
    return {
      city: CITY_NAME[c], school_year: year, why: input.year ? 'rok wskazany' : `start ${start} → rok szkolny ${schoolYear(start)}`,
      status: f.status === 'draft' ? 'ROBOCZY — ceny do potwierdzenia, uprzedź użytkownika' : 'potwierdzony', note: f.note, hours: f.hours,
      levels: f.rows.map((r) => ({ level: r.level.pl, monthly: pln(r.monthly), months: r.months, enrolment_fee: r.enrol ? pln(r.enrol) : undefined, materials: materialsText(r) || undefined })),
      discounts: f.discounts.map((d) => `${d.label.pl}: ${d.value.pl}${d.note ? ` — ${d.note.pl}` : ''}`),
      extras: f.extras.map((d) => `${d.label.pl}: ${d.value.pl}`),
      included: f.included.pl, not_included: f.notIncluded.pl,
      other_years: Object.keys(book[c]).filter((y) => y !== year),
    };
  }));
}

export { DEFAULT_FEES };
