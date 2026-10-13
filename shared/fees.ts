/**
 * Fee structure (cennik) per city and school year. A family that starts now pays the current year's
 * prices (2026/27); one that starts in September 2027 pays 2027/28 — two separate price lists.
 * The defaults below come from the marketing plans 2026/27 (fees 2027/28) and the old templates tool
 * (fees 2026/27); edits made in Opal5 are stored and win over them.
 */
export const CITIES = ['katowice', 'krakow', 'wroclaw'] as const;
export type City = (typeof CITIES)[number];
export const CITY_NAME: Record<City, string> = { katowice: 'Katowice', krakow: 'Kraków', wroclaw: 'Wrocław' };

export interface Bi { pl: string; en: string }
export interface FeeRow {
  level: Bi;
  /** monthly tuition, PLN */
  monthly: number;
  /** how many months a year tuition is paid (empty = not stated) */
  months?: number;
  /** one-time enrolment fee, PLN */
  enrol?: number;
  /** educational materials (SLM), PLN */
  materials?: number;
  materialsPer?: 'year' | 'month';
}
export interface FeeItem { label: Bi; value: Bi; note?: Bi }
export interface FeeYear {
  /** confirmed = taken from an official price list; draft = assumed, check before sending */
  status: 'confirmed' | 'draft';
  source: string;
  hours?: string;
  rows: FeeRow[];
  discounts: FeeItem[];
  /** paid extras (aftercare, extra classes, camps…) */
  extras: FeeItem[];
  included: { pl: string[]; en: string[] };
  notIncluded: { pl: string[]; en: string[] };
  /** what to watch out for — shown next to the price list */
  note?: string;
}
export type FeeBook = Record<City, Record<string, FeeYear>>;
/** What Opal5 serves: the merged book, which city:year lists were edited, and today's school year. */
export interface FeesView { book: FeeBook; edited: string[]; current: string }

const L = (pl: string, en: string): Bi => ({ pl, en });
const LEVELS = {
  pre: L('Przedszkole (3-5 lat)', 'Kindergarten (3-5 yrs)'),
  g0: L('Zerówka (6 lat)', 'Grade 0 (6 yrs)'),
  g13: L('Klasy 1-3 (7-9 lat)', 'Grades 1-3 (7-9 yrs)'),
  g46: L('Klasy 4-6 (10-12 lat)', 'Grades 4-6 (10-12 yrs)'),
  g78: L('Klasy 7-8 (13-14 lat)', 'Grades 7-8 (13-14 yrs)'),
};
const levels = [LEVELS.pre, LEVELS.g0, LEVELS.g13, LEVELS.g46, LEVELS.g78];
const rows = (monthly: number[], enrol: number[], materials: number[] = [], per: 'year' | 'month' = 'year', months: number[] = []): FeeRow[] =>
  levels.map((level, i) => ({
    level, monthly: monthly[i], enrol: enrol[i], ...(materials[i] ? { materials: materials[i], materialsPer: per } : {}), ...(months[i] ? { months: months[i] } : {}),
  }));
const same = (n: number) => [n, n, n, n, n];

const D = {
  annual: { label: L('Płatność roczna', 'Annual payment'), value: L('-6%', '-6%'), note: L('Jednorazowa opłata za cały rok szkolny z góry.', 'One-time upfront payment for the full school year.') },
  second: { label: L('Drugie dziecko', 'Second child'), value: L('-25%', '-25%'), note: L('Zniżka na czesne dla drugiego dziecka zapisanego do Maple Bear.', 'Tuition discount for a second child enrolled at Maple Bear.') },
  third: { label: L('Trzecie dziecko', 'Third child'), value: L('-50%', '-50%'), note: L('Zniżka na czesne dla trzeciego dziecka.', 'Tuition discount for a third child.') },
};

const KTW_INCLUDED = {
  pl: ['Opieka 7:30-17:30', 'Psycholog, pedagog, logopeda', '5 zajęć dodatkowych/tydzień', 'Pakiet startowy (4 mundurki + plecak)', 'Ubezpieczenie NNW', 'Trzy posiłki dziennie', 'Materiały szkolne (1. rok)'],
  en: ['Care 7:30-17:30', 'Psychologist, pedagogue, speech therapist', '5 extra activities/week', 'Starter pack (4 uniforms + backpack)', 'Accident insurance', 'Three meals per day', 'School materials (1st year)'],
};
const KTW_DISCOUNTS: FeeItem[] = [
  D.second, D.third, D.annual,
  { label: L('Ambassadors Club - polecający', 'Ambassadors Club - referrer'), value: L('1 zł / mies.', 'PLN 1 / mo.'), note: L('Za każdą poleconą rodzinę, która podpisze umowę - miesiąc czesnego za 1 zł. Brak limitu poleceń.', 'For each referred family that signs a contract - one month tuition for PLN 1. No limit on referrals.') },
  { label: L('Nowa rodzina z polecenia', 'New family via referral'), value: L('1 zł', 'PLN 1'), note: L('Opłata rekrutacyjna 1 zł przy zapisie przez polecenie.', 'Enrolment fee of PLN 1 when joining via referral.') },
];

const KRK_INCLUDED = {
  pl: ['Opieka 7:30-17:30 (rok szkolny)', 'Psycholog, pedagog, logopeda', '5 zajęć dodatkowych/tydzień (przedszkole)', '3 zajęcia/tydzień (kl. 0-3)', 'Pakiet startowy (4 mundurki + plecak)', 'Ubezpieczenie NNW', 'Przerwa zimowa: 1 tydzień, pozostałe dni 8:00-16:00', 'Sierpień: 2 tygodnie przerwy, pozostałe dni 8:00-16:00'],
  en: ['Care 7:30-17:30 (school year)', 'Psychologist, pedagogue, speech therapist', '5 extra activities/week (preschool)', '3 activities/week (grades 0-3)', 'Starter pack (4 uniforms + backpack)', 'Accident insurance', 'Winter break: 1 week, other days 8:00-16:00', 'August: 2 weeks off, other days 8:00-16:00'],
};
const KRK_NOT = {
  pl: ['Wyżywienie', 'Wycieczki i zielone szkoły', 'Mundurki (poza pakietem startowym)', 'Zajęcia dodatkowe powyżej limitu', 'Materiały edukacyjne (płatne osobno - patrz cennik)'],
  en: ['Meals', 'Field trips and green schools', 'Uniforms (beyond starter pack)', 'Additional classes beyond the limit', 'Educational materials (paid separately - see price list)'],
};
const KRK_SUMMER = { label: L('Nieobecność wakacyjna', 'Summer absence'), value: L('-50% (VII-VIII)', '-50% (Jul-Aug)'), note: L('Przy nieobecności przez 20 dni roboczych w lipcu/sierpniu (zgłoszenie do końca maja).', 'For 20 working days absence in July/August (must be reported by end of May).') };

const WRO_INCLUDED = {
  pl: ['Opieka 7:30-16:00', '5 zajęć dodatkowych/tydzień', 'Ubezpieczenie NNW', 'Pakiet startowy (4 mundurki + plecak)', 'Udział w półkoloniach szkolnych'],
  en: ['Care 7:30-16:00', '5 extra activities/week', 'Accident insurance', 'Starter pack (4 uniforms + backpack)', 'School-organised day camps'],
};
const WRO_VOUCHER = { label: L('Voucher na mundurki', 'Uniform voucher'), value: L('2 × 600 PLN', '2 × PLN 600'), note: L('600 PLN na początku każdego półrocza, odliczane od czesnego.', 'PLN 600 at the start of each semester, deducted from tuition.') };

export const DEFAULT_FEES: FeeBook = {
  katowice: {
    '2026/27': {
      status: 'confirmed', source: 'Narzędzie Szablony (Cennik 2026/2027) + Marketing Plan Katowice 2026/27', hours: '7:30-17:30',
      rows: rows([3349, 3649, 3949, 4149, 4349], same(3400), [1700, 1900, 1900, 1900, 1900]),
      discounts: KTW_DISCOUNTS, extras: [], included: KTW_INCLUDED, notIncluded: { pl: [], en: [] },
    },
    '2027/28': {
      status: 'draft', source: 'Marketing Plan Katowice 2026/27 — slajd „Fee structure” (bez roku)', hours: '7:30-17:30',
      rows: rows([3349, 3649, 3949, 4149, 4349], same(3400), [1700, 1900, 1900, 1900, 1900]),
      discounts: KTW_DISCOUNTS, extras: [], included: KTW_INCLUDED, notIncluded: { pl: [], en: [] },
      note: 'Prezentacja Katowic nie podaje roku przy cenniku, a kwoty są takie same jak 2026/27. Wpisz ceny od września 2027, gdy będą ustalone.',
    },
  },
  krakow: {
    '2026/27': {
      status: 'confirmed', source: 'Narzędzie Szablony (Cennik 2026/2027)', hours: '7:30-17:30',
      rows: rows([2858, 3638, 3794, 3993, 4176], same(3000), [1700, 1900, 1900, 2000, 2300]),
      discounts: [D.second, D.annual, KRK_SUMMER], extras: [], included: KRK_INCLUDED, notIncluded: KRK_NOT,
    },
    '2027/28': {
      status: 'confirmed', source: 'Marketing Plan Kraków 2026/27 — „Tuition and enrollment fees 27/28”', hours: '7:30-17:30',
      rows: rows([2944, 3747, 3908, 4113, 4301], same(3000), [1700, 1900, 1900, 2000, 2300]),
      discounts: [D.second, D.third, D.annual, KRK_SUMMER],
      extras: [{ label: L('Obozy edukacyjne', 'Educational camps'), value: L('900 PLN / tydzień', 'PLN 900 / week') }],
      included: { pl: [...KRK_INCLUDED.pl], en: [...KRK_INCLUDED.en] }, notIncluded: KRK_NOT,
    },
  },
  wroclaw: {
    '2026/27': {
      status: 'confirmed', source: 'Narzędzie Szablony (Cennik 2026/2027)', hours: '7:30-16:00',
      rows: rows([2808, 3442, 3442, 3533, 3558], [3000, 3000, 3500, 3500, 3500]),
      discounts: [D.second, D.annual,
        { label: L('Upust wakacyjny', 'Summer discount'), value: L('-80% (1 mies.)', '-80% (1 month)'), note: L('Przy nieobecności przez 20 dni roboczych (VII-VIII), po zgłoszeniu do końca maja.', 'For 20 working days absence (Jul-Aug), must be reported by end of May.') },
        WRO_VOUCHER,
        { label: L('Ambassadors Club', 'Ambassadors Club'), value: L('1 zł / mies.', 'PLN 1 / mo.'), note: L('Za polecenie nowego ucznia - miesiąc czesnego za 1 zł.', 'For recommending a new student - one month tuition for PLN 1.') }],
      extras: [{ label: L('Opieka popołudniowa 16:00-17:30', 'Aftercare 16:00-17:30'), value: L('350 PLN/mies. przedszkole i zerówka, 400 PLN/mies. szkoła', 'PLN 350/mo. preschool & grade 0, PLN 400/mo. school') }],
      included: WRO_INCLUDED,
      notIncluded: {
        pl: ['Wyżywienie - według cennika firmy cateringowej', 'Transport szkolny - według cennika firmy przewozowej', 'Opieka popołudniowa 16:00-17:30', 'Mundurki - cennik na wroclawshop.maplebear.pl'],
        en: ['Meals - catering company price list', 'School transport - transport company price list', 'Aftercare 16:00-17:30', 'Uniforms - price list at wroclawshop.maplebear.pl'],
      },
    },
    '2027/28': {
      status: 'confirmed', source: 'Marketing Plan Wrocław 2026/27 — „Tuition and fees 2027/28”', hours: '7:30-16:00',
      rows: rows([2750, 2950, 3350, 3650, 3850], [3000, 3000, 3500, 3500, 3500], [142, 142, 160, 160, 160], 'month', [11, 11, 10, 10, 10]),
      discounts: [
        { ...D.annual, label: L('Płatność jednorazowa z góry', 'One-time payment in advance') }, D.second,
        { label: L('Zniżka B2B', 'B2B discount'), value: L('10-15%', '10-15%'), note: L('Dla pracowników firm partnerskich.', 'For employees of partner companies.') },
        WRO_VOUCHER,
        { label: L('Ambassadors Club', 'Ambassadors Club'), value: L('1 zł', 'PLN 1'), note: L('Za polecenie: miesiąc czesnego za 1 zł dla obu rodzin — polecającej i nowej.', 'Referral: one month of tuition for PLN 1 for both families, the referrer and the new one.') },
      ],
      extras: [
        { label: L('Zajęcia dodatkowe ponad 5 w cenie', 'Extra classes beyond the 5 included'), value: L('120 PLN / mies. za każde', 'PLN 120 / mo. each') },
        { label: L('Opieka popołudniowa 16:00-17:30', 'Aftercare 16:00-17:30'), value: L('350 PLN / mies.', 'PLN 350 / mo.') },
      ],
      included: { pl: ['Opieka 7:30-16:00', 'Do 5 zajęć dodatkowych (Maple Bear Enrichment Programme)', 'Ubezpieczenie NNW', 'Pakiet startowy (4 mundurki + plecak)', 'Udział w półkoloniach szkolnych'],
        en: ['Care 7:30-16:00', 'Up to 5 enrichment classes (Maple Bear Enrichment Programme)', 'Accident insurance', 'Starter pack (4 uniforms + backpack)', 'School-organised day camps'] },
      notIncluded: {
        pl: ['Wyżywienie - według cennika firmy cateringowej', 'Transport szkolny - według cennika firmy przewozowej', 'Opieka popołudniowa 16:00-17:30', 'Materiały i SLM (płatne miesięcznie - patrz cennik)'],
        en: ['Meals - catering company price list', 'School transport - transport company price list', 'Aftercare 16:00-17:30', 'SLM and materials (paid monthly - see price list)'],
      },
      note: 'Prezentacja nie podaje opłaty rekrutacyjnej na 2027/28 — wpisana jak w 2026/27, sprawdź.',
    },
  },
};

/** The school year a start date falls into: September opens a new one. */
export function schoolYear(date: string): string {
  const [y, m] = date.split('-').map(Number);
  const from = m >= 9 ? y : y - 1;
  return `${from}/${String((from + 1) % 100).padStart(2, '0')}`;
}

/** The year whose price list applies for a start date — or the nearest one we have. */
export function yearFor(book: FeeBook, city: City, start: string): string {
  const years = Object.keys(book[city] || {}).sort();
  const want = schoolYear(start);
  if (years.includes(want)) return want;
  return years.filter((y) => y <= want).at(-1) || years[0] || want;
}

const group = (n: number, sep: string) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
export const pln = (n: number | undefined, lang: 'pl' | 'en' = 'pl') =>
  n === undefined || n === null || Number.isNaN(n) ? '—' : `${group(n, lang === 'en' ? ',' : ' ')} PLN`;

export const materialsText = (r: FeeRow, lang: 'pl' | 'en' = 'pl') =>
  r.materials ? `${pln(r.materials, lang)} / ${r.materialsPer === 'month' ? (lang === 'en' ? 'month' : 'mies.') : (lang === 'en' ? 'year' : 'rok')}` : '';

/** Stored edits over the defaults: a year saved in Opal5 replaces the default one as a whole. */
export function mergeFees(saved: Partial<Record<City, Record<string, FeeYear>>> | null | undefined): FeeBook {
  const out = JSON.parse(JSON.stringify(DEFAULT_FEES)) as FeeBook;
  for (const c of CITIES) for (const [y, v] of Object.entries(saved?.[c] || {})) if (v && Array.isArray(v.rows)) out[c][y] = v;
  return out;
}
