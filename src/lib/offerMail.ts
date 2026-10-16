/**
 * The offer / newsletter e-mail for parents — the same table-based HTML the old Szablony tool built
 * (it pastes into Gmail with its layout), with prices taken from the fee book for the chosen school year.
 */
import { CITY_NAME, materialsText, pln, type City, type FeeYear } from '../../shared/fees';
import { MOD_ORDER, PLACES, T } from './szablonyData';

type Lang = 'pl' | 'en';
export interface MailOpts {
  city: City;
  lang: Lang;
  mods: string[];
  year: string;
  fees: FeeYear;
  /** also show the next school year's list (a family starting now that stays past September) */
  next?: { year: string; fees: FeeYear };
}

const RED = 'rgb(192,20,15)';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const secLabel = (t: string) => `<tr><td style="padding:9px 24px;text-align:center;border-bottom:1px solid #ece9e4"><p style="margin:0;font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${RED}">${t}</p></td></tr>`;
const docItem = (m: any) => `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px"><tr><td style="background:#f9f7f5;border-radius:8px;border-left:3px solid ${RED};padding:10px 14px"><p style="margin:0 0 1px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${RED}">${m.type}</p><p style="margin:0 0 3px;font-size:12px;font-weight:700;color:#111">${m.title}</p><p style="margin:0 0 6px;font-size:11px;color:#000;line-height:1.4">${m.desc}</p><a href="${m.link}" style="color:${RED};font-size:11px;font-weight:700;text-decoration:none">${m.cta}</a></td></tr></table>`;
const th = (t: string, right = false) => `<td style="font-size:10px;font-weight:700;color:${RED};text-transform:uppercase;letter-spacing:0.06em;padding-bottom:8px${right ? ';text-align:right' : ''}">${t}</td>`;
const box = (inner: string) => `<tr><td style="padding:16px 24px;border-bottom:1px solid #ece9e4">${inner}</td></tr>`;

function priceTable(f: FeeYear, l: Lang) {
  const mat = f.rows.some((r) => r.materials);
  const head = `<tr>${th(l === 'en' ? 'Stage' : 'Etap')}${th(l === 'en' ? 'Tuition / mo' : 'Czesne / mies.', true)}${th(l === 'en' ? 'Enrolment fee' : 'Opłata rekrutacyjna', true)}${mat ? th(l === 'en' ? 'Materials' : 'Materiały', true) : ''}</tr>`;
  const body = f.rows.map((r) => `<tr style="background:#f7f5f3"><td style="padding:7px 10px;font-size:12px;font-weight:700;color:#111;border-radius:6px 0 0 6px">${esc(r.level[l])}${r.months ? `<br><span style="font-weight:400;font-size:10px;color:#555">${r.months} ${l === 'en' ? 'months / year' : 'mies. w roku'}</span>` : ''}</td>` +
    `<td style="padding:7px 10px;font-size:12px;color:#000;text-align:right;white-space:nowrap">${pln(r.monthly, l)}</td>` +
    `<td style="padding:7px 10px;font-size:12px;color:#000;text-align:right;white-space:nowrap${mat ? '' : ';border-radius:0 6px 6px 0'}">${r.enrol ? pln(r.enrol, l) : '—'}</td>` +
    (mat ? `<td style="padding:7px 10px;font-size:11px;color:#000;text-align:right;white-space:nowrap;border-radius:0 6px 6px 0">${materialsText(r, l) || '—'}</td>` : '') +
    `</tr><tr><td colspan="4" style="height:4px"></td></tr>`).join('');
  return `<table width="100%" cellpadding="0" cellspacing="0"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function itemRows(items: FeeYear['discounts'], l: Lang) {
  return items.map((r) => `<tr><td colspan="2" style="padding-bottom:4px"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:7px 10px;font-size:12px;font-weight:700;color:#111;background:#f7f5f3;border-radius:6px 0 0 6px;width:55%">${esc(r.label[l])}</td><td style="padding:7px 10px;font-size:12px;font-weight:700;color:${RED};background:#f7f5f3;text-align:right;border-radius:0 6px 6px 0">${esc(r.value[l])}</td></tr></table></td></tr>` +
    (r.note?.[l] ? `<tr><td colspan="2" style="padding:0 0 2px;font-size:11px;color:#000;line-height:1.4">${esc(r.note[l])}</td></tr>` : '') +
    `<tr><td colspan="2" style="height:8px"></td></tr>`).join('');
}

const yearTitle = (year: string, l: Lang, when?: 'now' | 'next') => {
  const start = year.split('/')[0];
  const hint = when === 'now' ? (l === 'en' ? ` · start now` : ' · start teraz')
    : when === 'next' ? (l === 'en' ? ` · from September ${start}` : ` · od września ${start}`) : '';
  return `${l === 'en' ? 'Pricing' : 'Cennik'} ${year}${hint}`;
};

function section(id: string, o: MailOpts): string {
  const l = o.lang;
  const d = PLACES[o.city];
  if (id === 'confirm') {
    return `<tr><td style="padding:18px 24px;border-bottom:1px solid #ece9e4">${T.confirm_body[l].split('\n').map((p: string) => `<p style="margin:0 0 8px;font-size:13px;color:#000;line-height:1.7">${p}</p>`).join('')}</td></tr>`;
  }
  if (id === 'enrollment_confirm') {
    const sign = T.enrollment_sign_options[l].map((x: string) => `<tr><td style="padding:3px 0;font-size:12.5px;color:#000;line-height:1.5">&#8226;&nbsp; ${x}</td></tr>`).join('');
    return `<tr><td style="padding:22px 24px 6px"><p style="margin:0;font-size:19px;font-weight:800;color:${RED}">${T.enrollment_title[l]}</p></td></tr>` +
      `<tr><td style="padding:6px 24px 14px"><p style="margin:0;font-size:13px;color:#000;line-height:1.7">${T.enrollment_intro[l]}</p></td></tr>` +
      `<tr><td style="padding:0 24px 14px"><p style="margin:0 0 6px;font-size:12.5px;font-weight:700;color:#000">${T.enrollment_sign_title[l]}</p><table width="100%" cellpadding="0" cellspacing="0">${sign}</table></td></tr>` +
      `<tr><td style="padding:0 24px 18px;border-bottom:1px solid #ece9e4"><p style="margin:0;font-size:13px;color:#000;line-height:1.7">${T.enrollment_payment[l]}</p></td></tr>` +
      `<tr><td style="padding:16px 24px;background:#f7f5f3"><p style="margin:0;font-size:12.5px;color:#000;line-height:1.6;font-style:italic">${T.enrollment_question[l]}</p></td></tr>`;
  }
  if (id === 'welcome_aboard') {
    return `<tr><td style="padding:22px 24px 6px"><p style="margin:0;font-size:19px;font-weight:800;color:${RED}">${T.welcome_title[l]}</p></td></tr>` +
      `<tr><td style="padding:6px 24px 14px">${T.welcome_body[l].split('\n\n').map((p: string) => `<p style="margin:0 0 10px;font-size:13px;color:#000;line-height:1.7">${p}</p>`).join('')}</td></tr>` +
      `<tr><td style="padding:0 24px 20px;border-bottom:1px solid #ece9e4"><p style="margin:0;font-size:13px;color:#000;line-height:1.7">${T.welcome_closing[l]}</p></td></tr>`;
  }
  if (id === 'hello') {
    const pillars = T.pillars[l].map((p: string, i: number) => `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px"><tr><td width="34" valign="top" style="padding-top:9px"><div style="width:26px;height:26px;background:${RED};border-radius:6px;text-align:center;line-height:26px;font-size:12px;font-weight:800;color:#fff">${i + 1}</div></td><td style="background:#f7f5f3;border-radius:8px;padding:9px 12px"><p style="margin:0;font-size:11px;color:#000;line-height:1.5">${p}</p></td></tr></table>`).join('');
    const intro = o.mods.includes('confirm') ? '' : `<tr><td style="padding:18px 24px;border-bottom:1px solid #ece9e4"><p style="margin:0;font-size:13px;color:#000;line-height:1.7">${T.hello_body[l]}</p></td></tr>`;
    return intro + secLabel(T.pillars_title[l]) + box(pillars) + secLabel(T.materials_title[l]) + box(T.mat_items[l].map(docItem).join(''));
  }
  if (id === 'pricing') {
    const one = (year: string, f: FeeYear, when?: 'now' | 'next') => secLabel(yearTitle(year, l, when)) + box(priceTable(f, l) +
      (f.extras.length ? `<p style="margin:12px 0 6px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#000">${l === 'en' ? 'Paid extras' : 'Dodatkowo płatne'}</p><table width="100%" cellpadding="0" cellspacing="0">${itemRows(f.extras, l)}</table>` : ''));
    const now = one(o.year, o.fees, o.next ? 'now' : undefined);
    const next = o.next ? one(o.next.year, o.next.fees, 'next') : '';
    return now + next + secLabel(T.discounts_title[l]) + box(`<table width="100%" cellpadding="0" cellspacing="0">${itemRows(o.fees.discounts, l)}</table>`);
  }
  if (id === 'included') {
    const f = o.fees;
    const yes = f.included[l].map((i) => `<tr><td style="padding:4px 0;font-size:12px;color:#000;line-height:1.5">&#10003;&nbsp; ${esc(i)}</td></tr>`).join('');
    const no = f.notIncluded[l].map((i) => `<tr><td style="padding:4px 0;font-size:12px;color:#000;line-height:1.5">&#10007;&nbsp; ${esc(i)}</td></tr>`).join('');
    return secLabel(T.included_title[l]) + box(`<table width="100%" cellpadding="0" cellspacing="0">${yes}</table>` +
      (no ? `<p style="margin:12px 0 6px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#000">${l === 'pl' ? 'Nie jest wliczone w czesne' : 'Not included in tuition'}</p><table width="100%" cellpadding="0" cellspacing="0">${no}</table>` : ''));
  }
  if (id === 'process') {
    const p = d.process[l];
    const steps = p.steps.map((s: any) => `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px"><tr><td width="38" valign="top" style="padding-top:2px"><div style="width:30px;height:30px;background:${RED};border-radius:50%;text-align:center;line-height:30px;font-size:13px;font-weight:800;color:#fff">${s.n}</div></td><td style="background:#f7f5f3;border-radius:8px;padding:10px 12px"><p style="margin:0 0 3px;font-size:12px;font-weight:700;color:#111">${s.title}</p><p style="margin:0;font-size:11px;color:#000;line-height:1.55">${s.body}</p></td></tr></table>`).join('');
    return secLabel(T.process_title[l]) + box(`<p style="margin:0 0 14px;font-size:12px;color:#000;line-height:1.6">${p.intro}</p>${steps}`);
  }
  if (id === 'directions') {
    const dir = d.directions[l];
    const items = dir.items.map((it: any) => `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px"><tr><td width="34" valign="top" style="padding-top:2px;font-size:18px">${it.icon}</td><td style="background:#f7f5f3;border-radius:8px;padding:10px 12px"><p style="margin:0 0 3px;font-size:12px;font-weight:700;color:#111">${it.title}</p><p style="margin:0;font-size:11px;color:#000;line-height:1.55">${it.body}</p></td></tr></table>`).join('');
    const btn = `<a href="${d.mapsLink}" style="display:inline-block;background:${RED};color:#fff;font-size:11px;font-weight:700;text-decoration:none;padding:9px 18px;border-radius:6px;margin-top:4px">${T.navigate_btn[l]}</a>`;
    return secLabel(T.directions_title[l]) + `<tr><td style="padding:16px 24px;border-bottom:1px solid #ece9e4;text-align:center"><p style="margin:0 0 12px;font-size:11px;font-weight:700;color:${RED};text-align:left">&#128205; ${dir.address}</p><div style="text-align:left">${items}</div>${btn}</td></tr>`;
  }
  if (id === 'schedule') {
    const links = T.sched_items[l].map((n: string, i: number) => `<a href="${T.sched_links[i]}" style="display:block;color:${RED};font-size:11px;font-weight:700;text-decoration:none;margin-bottom:5px">${T.sched_cta[l]} - ${n}</a>`).join('');
    return secLabel(T.sched_title[l]) + box(`<p style="margin:0 0 10px;font-size:12px;color:#000">${T.sched_desc[l]}</p>${links}`);
  }
  if (id === 'od') {
    const rows = T.od_items[l].map((r: string[]) => `<div style="display:flex;gap:10px;margin-bottom:8px"><div style="font-weight:700;color:${RED};font-size:12px;min-width:65px;flex-shrink:0">${r[0]}</div><div style="font-size:12px;color:#000;line-height:1.5">${r[1]}</div></div>`).join('');
    return secLabel(T.od_title[l]) + box(rows);
  }
  if (id === 'trial') {
    const items = T.trial_items[l].map((it: string, i: number) => `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px"><tr><td width="30" valign="top"><div style="width:22px;height:22px;background:${RED};border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:800;color:#fff">${i + 1}</div></td><td style="font-size:12px;color:#000;padding-top:3px;padding-left:4px">${it}</td></tr></table>`).join('');
    return secLabel(T.trial_title[l]) + box(`<p style="margin:0 0 12px;font-size:12px;font-weight:700;color:#111">${T.trial_start[l]}</p><p style="margin:0 0 10px;font-size:11px;font-weight:700;color:${RED};text-transform:uppercase;letter-spacing:0.08em">${T.trial_bring_title[l]}</p>${items}<p style="margin:8px 0 0;font-size:11px;color:#000">${T.trial_meals[l]}</p>`);
  }
  if (id === 'after_visit') {
    return secLabel(T.after_title[l]) + box(`<p style="margin:0 0 12px;font-size:12px;color:#000">${T.after_intro[l]}</p>${T.after_items[l].map(docItem).join('')}`);
  }
  if (id === 'survey') {
    const qs = T.survey_items[l].map((q: string, i: number) => `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:6px"><tr><td width="28" valign="top" style="padding-top:1px"><div style="width:20px;height:20px;background:#f7f5f3;border:1.5px solid ${RED};border-radius:50%;text-align:center;line-height:18px;font-size:10px;font-weight:800;color:${RED}">${i + 1}</div></td><td style="font-size:12px;color:#000;line-height:1.5;padding-left:4px">${q}</td></tr></table>`).join('');
    return secLabel(T.survey_title[l]) + box(`<p style="margin:0 0 12px;font-size:12px;color:#000;line-height:1.6">${T.survey_intro[l]}</p>${qs}`);
  }
  if (id === 'visit_cta') {
    return `<tr><td style="padding:20px 24px;background:#f7f5f3;text-align:center"><p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#111">${T.visit_cta_title[l]}</p><p style="margin:0 0 14px;font-size:12px;color:#000">${T.visit_cta_desc[l]}</p><a href="${d.calLink}" style="display:inline-block;background:${RED};color:#fff;font-size:12px;font-weight:700;text-decoration:none;padding:10px 24px;border-radius:6px">${T.visit_btn[l]}</a></td></tr>`;
  }
  return '';
}

export function offerMailHtml(o: MailOpts): string {
  const sections = MOD_ORDER.filter((id) => o.mods.includes(id)).map((id) => section(id, o)).join('');
  return `<table width="460" cellpadding="0" cellspacing="0" border="0" style="max-width:460px;font-family:Arial,Helvetica,sans-serif;color:#000"><tbody>` +
    `<tr><td style="background:${RED};padding:18px 24px;text-align:center"><p style="margin:0 0 3px;font-size:20px;font-weight:800;color:#fff">MapleBear</p><p style="margin:0 0 8px;font-size:11px;color:rgba(255,170,170,1);letter-spacing:0.08em;text-transform:uppercase">Canadian School - ${CITY_NAME[o.city]}</p></td></tr>` +
    sections + `<tr><td style="padding:18px 24px"><p style="margin:0;font-size:13px;color:#000;line-height:1.7">${T.closing[o.lang]}</p></td></tr></tbody></table>`;
}

/** The short SMS sent with the e-mail ("check your SPAM folder"). */
export const companionSms = (lang: Lang, signature: string) => `${T.companion_msg[lang]}\n\n${signature}`;

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
  const row = (label: string, value: string) => `<tr><td style="padding:8px 0;font-size:12px;color:#000;width:150px;vertical-align:top;border-bottom:1px solid #eee">${label}</td><td style="padding:8px 0;font-size:13px;color:#000;font-weight:600;border-bottom:1px solid #eee">${value}</td></tr>`;
  const start = h.start ? new Date(h.start + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '[start date]';
  let ref = 'No';
  if (h.referral) ref = `Yes - referred by ${esc(h.referrer || '[referrer name]')}${h.referrerLink ? ` (<a href="${esc(h.referrerLink)}" style="color:${RED}">link</a>)` : ''}`;
  const link = h.link ? `<tr><td colspan="2" style="padding:16px 0 0"><a href="${esc(h.link)}" style="display:inline-block;background:${RED};color:#fff;font-size:12px;font-weight:700;text-decoration:none;padding:9px 18px;border-radius:6px">Open student in Evvotek →</a></td></tr>` : '';
  return `<table width="460" cellpadding="0" cellspacing="0" border="0" style="max-width:460px;font-family:Arial,Helvetica,sans-serif;color:#000"><tbody>` +
    `<tr><td style="background:${RED};padding:18px 24px"><p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,.75)">Internal notice · ${CITY_NAME[h.city]}</p><p style="margin:4px 0 0;font-size:19px;font-weight:800;color:#fff">New Contract Signed</p></td></tr>` +
    `<tr><td style="padding:18px 24px 6px"><p style="margin:0;font-size:13px;color:#000;line-height:1.6">Hi team, a new family has signed a contract with us.</p></td></tr>` +
    `<tr><td style="padding:6px 24px 18px"><table width="100%" cellpadding="0" cellspacing="0">` +
    row('Student', esc(h.name || '[name]')) + row('Grade', esc(h.group || '[group]')) + row('Start date', start) + row('Price list', `School year ${h.year}`) +
    row('Enrollment fee', esc(h.enrol || '[enrollment fee]')) + row('Tuition', `${esc(h.tuition || '[tuition]')} ${FREQ[h.tuitionFreq]}`) +
    row('Materials fee', h.materials ? `${esc(h.materials)} ${MFREQ[h.materialsFreq]}` : '-') + row('Referral', ref) + link +
    `</table></td></tr>` +
    `<tr><td style="padding:14px 24px 20px;background:#f7f5f3"><p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${RED}">Additional notes</p><p style="margin:0;font-size:12.5px;color:#000;line-height:1.55">${esc(h.notes || '-')}</p></td></tr>` +
    `</tbody></table>`;
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
  el.style.position = 'fixed'; el.style.left = '-9999px';
  document.body.appendChild(el);
  const r = document.createRange(); r.selectNodeContents(el);
  const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(r);
  try { document.execCommand('copy'); } finally { s?.removeAllRanges(); el.remove(); }
}
