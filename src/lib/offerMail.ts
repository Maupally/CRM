/**
 * The offer / newsletter e-mail for parents — the same table-based HTML the old Szablony tool built
 * (it pastes into Gmail with its layout), with prices taken from the fee book for the chosen school year.
 */
import { CITY_NAME, materialsText, pln, type City, type FeeYear } from '../../shared/fees';
import { MOD_ORDER, PLACES, T } from './szablonyData';
import { forms, greetingLine, type Greet } from '../../shared/greeting';

type Lang = 'pl' | 'en';
export interface MailOpts {
  city: City;
  lang: Lang;
  mods: string[];
  year: string;
  fees: FeeYear;
  /** also show the next school year's list (a family starting now that stays past September) */
  next?: { year: string; fees: FeeYear };
  /** the parent we write to: opening line "Dzień dobry Pani Julio," and Pan / Pani forms in the text */
  greet?: Greet;
}

// Looks like a mail typed by hand in Gmail: no banner, no coloured boxes — plain lines, a bold heading now and then,
// simple lists, fees in a plain table and materials as light outlined buttons. Gmail's own markup is <div>s with an empty <div><br></div> between paragraphs.
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const P = (t: string) => `<div>${t}</div><div><br></div>`;
const H = (t: string) => `<div><b>${t}</b></div>`;
const UL = (items: string[]) => (items.length ? `<ul style="margin:0 0 0 0;padding-left:24px">${items.map((i) => `<li>${i}</li>`).join('')}</ul><div><br></div>` : '');
const OL = (items: string[]) => (items.length ? `<ol style="margin:0;padding-left:24px">${items.map((i) => `<li>${i}</li>`).join('')}</ol><div><br></div>` : '');
const LINK = '#1a73e8';
const A = (href: string, text: string) => `<a href="${href}" style="color:${LINK}">${text}</a>`;
/** a light outlined button — so it is clear there is something to open */
const RED = 'rgb(192,20,15)';
const BTN = (href: string, text: string) =>
  `<a href="${href}" style="display:inline-block;padding:6px 12px;border:1px solid ${RED};border-radius:6px;color:${RED};text-decoration:none;font-weight:bold;white-space:nowrap">${text}</a>`;
const TD = 'padding:6px 12px 6px 0;border-bottom:1px solid #e5e5e5;vertical-align:top';
const TABLE = (head: string[], rows: string[][], right: number[] = []) =>
  `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:4px 0 0;color:inherit;font-size:inherit;font-family:inherit">` +
  (head.length ? `<tr>${head.map((h, i) => `<td style="${TD};font-weight:bold;color:#555;font-size:12px${right.includes(i) ? ';text-align:right' : ''}">${h}</td>`).join('')}</tr>` : '') +
  rows.map((r) => `<tr>${r.map((c, i) => `<td style="${TD}${right.includes(i) ? ';text-align:right;white-space:nowrap' : ''}">${c}</td>`).join('')}</tr>`).join('') +
  `</table><div><br></div>`;
/** "Pobierz prezentację →" → "Pobierz prezentację" — arrows are what a template looks like, not a person */
const noArrow = (t: string) => t.replace(/\s*[→»>]+\s*$/, '');
const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const sentence = (t: string) => (/[.!?:]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);
const docItem = (m: any) => `<div style="margin:0 0 8px">${BTN(m.link, m.title)}${m.desc ? `<div style="margin:3px 0 0;color:#555;font-size:12px">${m.desc}</div>` : ""}</div>`;
const docs = (items: any[]) => items.map(docItem).join('') + '<div><br></div>';

function priceTable(f: FeeYear, l: Lang) {
  const mat = f.rows.some((r) => materialsText(r, l));
  const en = l === 'en';
  const head = [en ? 'Stage' : 'Etap', en ? 'Tuition / month' : 'Czesne / mies.', en ? 'Enrolment fee' : 'Opłata rekrutacyjna', ...(mat ? [en ? 'Materials' : 'Materiały'] : [])];
  const rows = f.rows.map((r) => [
    `${esc(r.level[l])}${r.months ? `<br><span style="color:#777;font-size:12px">${r.months} ${en ? 'months a year' : 'mies. w roku'}</span>` : ''}`,
    `<b>${pln(r.monthly, l)}</b>`, r.enrol ? pln(r.enrol, l) : '—', ...(mat ? [materialsText(r, l) || '—'] : []),
  ]);
  return TABLE(head, rows, mat ? [1, 2, 3] : [1, 2]);
}
const itemTable = (items: FeeYear['discounts'], l: Lang) =>
  TABLE([], items.map((r) => [`${esc(r.label[l])}${r.note?.[l] ? `<br><span style="color:#777;font-size:12px">${esc(r.note[l])}</span>` : ''}`, `<b>${esc(r.value[l])}</b>`]), [1]);

const yearTitle = (year: string, l: Lang, when?: 'now' | 'next') => {
  const start = year.split('/')[0];
  const hint = when === 'now' ? (l === 'en' ? ' (starting now)' : ' (start teraz)')
    : when === 'next' ? (l === 'en' ? ` (from September ${start})` : ` (od września ${start})`) : '';
  return `${l === 'en' ? 'Fees' : 'Cennik'} ${year}${hint}`;
};

function section(id: string, o: MailOpts): string {
  const l = o.lang;
  const d = PLACES[o.city];
  if (id === 'confirm') return T.confirm_body[l].split('\n').map(P).join('');
  if (id === 'enrollment_confirm') {
    return P(T.enrollment_intro[l]) + H(T.enrollment_sign_title[l]) + UL(T.enrollment_sign_options[l]) +
      P(T.enrollment_payment[l]) + P(T.enrollment_question[l]);
  }
  if (id === 'welcome_aboard') {
    return T.welcome_body[l].split('\n\n').map(P).join('');
  }
  if (id === 'hello') {
    const intro = o.mods.includes('confirm') ? '' : P(T.hello_body[l]);
    return intro + H(T.pillars_title[l]) + UL(T.pillars[l]) + H(T.materials_title[l]) + `<div style="height:6px"></div>` + docs(T.mat_items[l]);
  }
  if (id === 'pricing') {
    const one = (year: string, f: FeeYear, when?: 'now' | 'next') => H(yearTitle(year, l, when)) + priceTable(f, l) +
      (f.extras.length ? H(l === 'en' ? 'Paid extras' : 'Dodatkowo płatne') + itemTable(f.extras, l) : '');
    return one(o.year, o.fees, o.next ? 'now' : undefined) + (o.next ? one(o.next.year, o.next.fees, 'next') : '') +
      (o.fees.discounts.length ? H(T.discounts_title[l]) + itemTable(o.fees.discounts, l) : '');
  }
  if (id === 'included') {
    const f = o.fees;
    return H(T.included_title[l]) + UL(f.included[l].map(esc)) +
      (f.notIncluded[l].length ? H(l === 'pl' ? 'Nie jest wliczone w czesne' : 'Not included in tuition') + UL(f.notIncluded[l].map(esc)) : '');
  }
  if (id === 'process') {
    const p = d.process[l];
    return H(T.process_title[l]) + P(p.intro).replace(/<div><br><\/div>$/, '') + OL(p.steps.map((s: any) => `<b>${s.title}.</b> ${s.body}`));
  }
  if (id === 'directions') {
    const dir = d.directions[l];
    return H(T.directions_title[l]) + `<div style="margin:0 0 6px">${dir.address}</div><div>${BTN(d.mapsLink, l === 'en' ? 'Open in Google Maps' : 'Otwórz w Google Maps')}</div><div><br></div>` +
      UL(dir.items.map((it: any) => `<b>${it.title}</b> – ${it.body}`));
  }
  if (id === 'schedule') {
    return H(T.sched_title[l]) + P(T.sched_desc[l]) + docs(T.sched_items[l].map((n: string, i: number) => ({ link: T.sched_links[i], title: n, type: 'pdf', desc: '' })));
  }
  if (id === 'od') return H(T.od_title[l]) + UL(T.od_items[l].map((r: string[]) => `${r[0]} – ${r[1]}`));
  if (id === 'trial') {
    return H(T.trial_title[l]) + `<div>${sentence(T.trial_start[l])} ${T.trial_bring_title[l]}</div>` + UL(T.trial_items[l]) + P(T.trial_meals[l]);
  }
  if (id === 'after_visit') return H(T.after_title[l]) + P(T.after_intro[l]) + docs(T.after_items[l]);
  if (id === 'survey') return H(T.survey_title[l]) + `<div>${T.survey_intro[l]}</div>` + OL(T.survey_items[l]);
  if (id === 'visit_cta') return `<div style="margin:0 0 8px">${T.visit_cta_desc[l].trim()}</div><div>${BTN(d.calLink, noArrow(T.visit_btn[l]))}</div><div><br></div>`;
  return '';
}

export function offerMailHtml(o: MailOpts): string {
  const sections = MOD_ORDER.filter((id) => o.mods.includes(id)).map((id) => section(id, o)).join('');
  const g = o.greet || { name: '', title: 'pan' };
  const greeting = g.name.trim() ? greetingLine(g, o.lang) : '';
  return forms(`<div>${greeting ? P(esc(greeting)) : ''}${sections}<div>${T.closing[o.lang]}</div></div>`, g);
}

/** The short SMS sent with the e-mail ("check your SPAM folder"). */
export const companionSms = (lang: Lang, signature: string, greet?: Greet) =>
  forms(`${T.companion_msg[lang]}\n\n${signature}`, greet || { name: '', title: 'pan' });

export const PRESETS: { label: string; mods: string[] }[] = [
  { label: 'Hello email', mods: ['hello', 'pricing', 'included', 'process', 'visit_cta'] },
  { label: 'Potwierdzenie wizyty', mods: ['confirm', 'hello'] },
  { label: 'Cennik', mods: ['hello', 'pricing', 'included', 'visit_cta'] },
  { label: 'Po dniu otwartym', mods: ['hello', 'process', 'directions', 'visit_cta'] },
  { label: 'Ankieta', mods: ['survey', 'visit_cta'] },
  { label: 'Prawie na miejscu!', mods: ['enrollment_confirm'] },
  { label: 'Witamy na pokładzie!', mods: ['welcome_aboard'] },
];

/** Internal "new contract signed" notice for the team (English, as before). */
export interface Handover {
  name: string; group: string; start: string; enrol: string; tuition: string; tuitionFreq: 'monthly' | 'semiannual' | 'annual';
  materials: string; materialsFreq: 'monthly' | 'yearly'; link: string; referral: boolean; referrer: string; referrerLink: string; notes: string;
  city: City; year: string;
}

export function handoverHtml(h: Handover): string {
  const FREQ = { monthly: '/ month', semiannual: '/ semester', annual: '/ year' };
  const MFREQ = { monthly: '/ month', yearly: '/ year' };
  const start = h.start ? new Date(h.start + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '[start date]';
  let ref = 'No';
  if (h.referral) ref = `Yes, referred by ${esc(h.referrer || '[referrer name]')}${h.referrerLink ? ` (${A(esc(h.referrerLink), 'link')})` : ''}`;
  const lines = [
    `Student: ${esc(h.name || '[name]')}`, `Grade: ${esc(h.group || '[group]')}`, `Start date: ${start}`, `Price list: school year ${h.year}`,
    `Enrollment fee: ${esc(h.enrol || '[enrollment fee]')}`, `Tuition: ${esc(h.tuition || '[tuition]')} ${FREQ[h.tuitionFreq]}`,
    `Materials fee: ${h.materials ? `${esc(h.materials)} ${MFREQ[h.materialsFreq]}` : '-'}`, `Referral: ${ref}`,
  ];
  return `<div>${P(`Hi team, a new family has signed a contract with us (${CITY_NAME[h.city]}).`)}${UL(lines)}` +
    (h.link ? P(BTN(esc(h.link), 'Student in Evvotek')) : '') + (h.notes ? P(`Notes: ${esc(h.notes)}`) : '') + `</div>`;
}

/** Copies HTML so it pastes into Gmail with its formatting (plain text as a fallback). */
export async function copyHtml(html: string, plain: string) {
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) })]);
      return;
    }
  } catch { /* fall through */ }
  const el = document.createElement('div');
  el.innerHTML = html;
  el.style.position = 'fixed'; el.style.left = '-9999px'; el.style.color = '#222'; el.style.background = '#fff';
  document.body.appendChild(el);
  const r = document.createRange(); r.selectNodeContents(el);
  const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r);
  try { document.execCommand('copy'); } finally { s?.removeAllRanges(); el.remove(); }
}
