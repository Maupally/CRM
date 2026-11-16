/**
 * Personal greeting in templates: "Dzień dobry Panie Damianie," / "Dzień dobry Pani Julio,".
 * The first name goes into the vocative (wołacz) by the usual Polish rules; odd names can be corrected
 * by hand (the `voc` override). Without a name the template keeps its own "Dzień dobry," (Państwo).
 *
 * Texts say who they talk to with {Państwo|Pan|Pani} variants, e.g. "czy {szukają Państwo|szuka Pan|szuka Pani}
 * przedszkola" — with a name the Pan / Pani form is used, without one the Państwo form (the text as before).
 */

export type Title = 'pan' | 'pani';
export interface Greet {
  /** first name as typed, e.g. "Damian" */
  name: string;
  title: Title;
  /** hand-corrected vocative; empty = computed */
  voc?: string;
}

const cap = (s: string) => (s ? s[0].toLocaleUpperCase('pl') + s.slice(1) : s);
const tidy = (s: string) => String(s || '').trim().replace(/\s+/g, ' ');

/** Male names ending in -a and female names not ending in -a — for guessing Pan / Pani. */
const MALE_A = new Set(['kuba', 'barnaba', 'bonawentura', 'kosma', 'jarema', 'zawisza', 'luca']);
const FEMALE_OTHER = new Set(['noemi', 'miriam', 'nicole', 'beatrycze', 'karmen', 'carmen', 'ruth', 'abigail', 'ingrid', 'rachel',
  'iris', 'nel', 'mercedes', 'dolores', 'agnes', 'alice', 'chloe', 'zoe', 'lili', 'gizela']);

/** Pan or Pani from the first name (most Polish women's names end in -a). */
export function guessTitle(name: string): Title {
  const n = tidy(name).split(' ')[0].split('-')[0].toLocaleLowerCase('pl');
  if (!n) return 'pan';
  if (FEMALE_OTHER.has(n)) return 'pani';
  if (MALE_A.has(n)) return 'pan';
  return n.endsWith('a') ? 'pani' : 'pan';
}

/** Names whose vocative doesn't follow the rules below. */
const IRREGULAR: Record<string, string> = {
  paweł: 'Pawle', kacper: 'Kacprze', aleksander: 'Aleksandrze', lew: 'Lwie', alex: 'Aleksie', max: 'Maksie', felix: 'Feliksie',
  ola: 'Olu', ela: 'Elu', ula: 'Ulu', ala: 'Alu', jola: 'Jolu',
};

/** One word in the vocative: Damian → Damianie, Marek → Marku, Anna → Anno, Kasia → Kasiu. */
function vocWord(word: string, title: Title): string {
  const w = word.toLocaleLowerCase('pl');
  if (IRREGULAR[w]) return IRREGULAR[w];
  const stem = (n: number) => word.slice(0, word.length - n);
  const ends = (re: RegExp) => re.test(w);

  // -a: Anna → Anno, Kuba → Kubo; diminutives Kasia, Marysia, Madzia, Ania → -iu (but Ksenia → Ksenio)
  if (ends(/a$/)) {
    if (ends(/(s|c|z)ia$/) || (ends(/nia$/) && w.length <= 5)) return stem(1) + 'u';
    return stem(1) + 'o';
  }
  if (title === 'pani') return word; // women's names outside -a (Noemi, Miriam) don't change

  // men
  if (ends(/[iyoeuąę]$/)) return word; // Jerzy, Antoni, Ignacy, Hugo, Bruno
  if (ends(/st$/)) return stem(2) + 'ście'; // Ernest → Erneście, August → Auguście
  if (ends(/ek$/) && w.length > 3) return stem(2) + 'ku'; // Jacek → Jacku, Wojtek → Wojtku
  if (ends(/(k|g|ch|h)$/)) return word + 'u'; // Patryk, Dominik, Wojciech
  if (ends(/(sz|cz|rz|ż|dż|j|l|c|dz)$/)) return word + 'u'; // Tomasz, Grzegorz, Maciej, Kamil
  if (ends(/[śćńź]$/)) return stem(1) + ({ ś: 'siu', ć: 'ciu', ń: 'niu', ź: 'ziu' } as Record<string, string>)[w.slice(-1)];
  if (ends(/t$/)) return stem(1) + 'cie'; // Robert → Robercie
  if (ends(/d$/)) return stem(1) + 'dzie'; // Dawid → Dawidzie
  if (ends(/r$/)) return word + 'ze'; // Piotr → Piotrze, Wiktor → Wiktorze
  if (ends(/ł$/)) return stem(1) + 'le'; // Michał → Michale, Rafał → Rafale
  if (ends(/x$/)) return stem(1) + 'ksie';
  if (ends(/[nmbpfwsz]$/)) return word + 'ie'; // Damian, Adam, Jakub, Filip, Józef, Stanisław, Borys
  return word;
}

/** First word only — "Anna Nowak" → "Anna" (we greet by first name). */
const first = (name: string) => tidy(name).split(' ')[0] || '';

/** The first name in the vocative, e.g. ("Damian", "pan") → "Damianie". Anna-Maria → Anno-Mario. */
export function vocative(name: string, title: Title): string {
  const n = first(name);
  if (!n) return '';
  return n.split('-').map((p) => (p ? cap(vocWord(p, title)) : p)).join('-');
}

/** "Panie Damianie" / "Pani Anno" — or '' when there is no name. */
export function address(g: Greet): string {
  const n = tidy(g.name);
  if (!n) return '';
  const voc = tidy(g.voc || '') || vocative(n, g.title);
  return `${g.title === 'pani' ? 'Pani' : 'Panie'} ${voc}`;
}

/** The greeting line on its own: "Dzień dobry Panie Damianie," / "Good morning Damian,". */
export function greetingLine(g: Greet, lang: 'pl' | 'en', en = 'Good morning'): string {
  const n = tidy(g.name);
  if (lang === 'en') return n ? `${en} ${cap(first(n))},` : `${en},`;
  return n ? `Dzień dobry ${address(g)},` : 'Dzień dobry,';
}

const FORMS = /\{([^{}|]*)\|([^{}|]*)\|([^{}|]*)\}/g;

/** Picks the {Państwo|Pan|Pani} variant: Pan / Pani when we know the name, Państwo otherwise. */
export function forms(text: string, g: Greet): string {
  const i = !tidy(g.name) ? 1 : g.title === 'pani' ? 3 : 2;
  return String(text ?? '').replace(FORMS, (...m) => m[i]);
}

/**
 * The whole text for one person: {Państwo|Pan|Pani} variants resolved and the name in the opening line —
 * "Dzień dobry," → "Dzień dobry Pani Julio,", "Hi," → "Hi Julia,". Without a name: the Państwo text as before.
 */
export function personalize(text: string, g: Greet, lang: 'pl' | 'en'): string {
  const t = forms(text, g);
  const n = tidy(g.name);
  if (!n) return t;
  if (lang === 'en') return t.replace(/^(Hi|Hello|Good morning|Good afternoon|Dear)\s*([,!])/, (_, w, p) => `${w} ${cap(first(n))}${p}`);
  return t.replace(/^Dzień dobry\s*([,!])/, (_, p) => `Dzień dobry ${address(g)}${p}`);
}

/** Name and title from a CRM contact field like "pani Celina Nowak (HR)" → { name: Celina, title: pani }. */
export function greetFromPerson(person: string): Greet {
  const s = tidy(String(person || '').replace(/\(.*?\)/g, '').split(/[,;/]/)[0]);
  const m = s.match(/^(pani|pan|p\.)\s+(.*)$/i);
  const rest = m ? m[2] : s;
  const name = rest.split(' ')[0] || '';
  if (!/^[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż-]{2,}$/.test(name)) return { name: '', title: 'pan' };
  const title: Title = m && /^pani$/i.test(m[1]) ? 'pani' : m && /^pan$/i.test(m[1]) ? 'pan' : guessTitle(name);
  return { name: cap(name.toLocaleLowerCase('pl')), title };
}
