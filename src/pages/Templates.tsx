import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Calculator, Check, Copy, MessageSquareText, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { api } from '../api';
import { ErrorBox, Loading, Modal, Seg, copyText, useAction, useToast, useToday } from '../components/ui';
import { CITIES, CITY_NAME, materialsText, pln, schoolYear, yearFor, type City, type FeeBook, type FeeItem, type FeeRow, type FeeYear } from '../../shared/fees';
import { MODULES, SIGNATURE, TEMPLATES, type TplItem } from '../lib/szablonyData';
import { PRESETS, companionSms, copyHtml, handoverHtml, offerMailHtml, type Handover } from '../lib/offerMail';

type Lang = 'pl' | 'en';
type Tab = 'cennik' | 'wiadomosci' | 'mail' | 'umowa';
const TABS = ['cennik', 'wiadomosci', 'mail', 'umowa'] as const;
const TAB_LABEL: Record<Tab, string> = { cennik: 'Cennik i wycena', wiadomosci: 'Wiadomości', mail: 'Mail z ofertą', umowa: 'Nowa umowa' };

const useRemember = <T extends string>(key: string, fallback: T, ok: readonly T[]): [T, (v: T) => void] => {
  const [v, set] = useState<T>(() => { try { const s = localStorage.getItem(key) as T; return ok.includes(s) ? s : fallback; } catch { return fallback; } });
  return [v, (n: T) => { set(n); try { localStorage.setItem(key, n); } catch { /* private mode */ } }];
};

/** "Start teraz" / "od września 2027" — a label for a school year relative to today. */
function yearHint(year: string, current: string) {
  if (year === current) return 'start teraz';
  const start = Number(year.slice(0, 4));
  return start > Number(current.slice(0, 4)) ? `start od września ${start}` : 'poprzedni rok';
}

/**
 * Templates for parents in one place: the fee book (two school years, per city), a quote calculator,
 * ready messages, the offer e-mail and the "new contract" notice — all with prices from the same book.
 */
export function TemplatesPage() {
  const q = useQuery({ queryKey: ['fees'], queryFn: api.fees });
  const [sp, setSp] = useSearchParams();
  const tab = (TABS.includes(sp.get('tab') as Tab) ? sp.get('tab') : 'cennik') as Tab;
  const [city, setCity] = useRemember<City>('szablony.city', 'katowice', CITIES);
  const [lang, setLang] = useRemember<Lang>('szablony.lang', 'pl', ['pl', 'en'] as const);
  const [year, setYear] = useState('');
  const [child, setChild] = useState('');

  const book = q.data?.book;
  const current = q.data?.current || '';
  const years = useMemo(() => (book ? Object.keys(book[city]).sort() : []), [book, city]);
  useEffect(() => {
    if (book && (!year || !book[city][year])) setYear(years.includes(current) ? current : years.at(-1) || '');
  }, [book, city, current, year, years]);

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  if (!book || !year || !book[city][year]) return <Loading />;
  const fees = book[city][year];

  return (
    <>
      <div className="page-head">
        <div><h1>Szablony</h1><div className="sub">Cenniki, wiadomości i maile do rodziców — wszystko z jednego cennika, osobno dla każdego roku szkolnego.</div></div>
        <span className="spacer" />
        <Seg value={tab} options={TABS} labels={TAB_LABEL} onChange={(t) => setSp(t === 'cennik' ? {} : { tab: t }, { replace: true })} />
      </div>

      <section className="card pad row wrap" style={{ gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <Seg value={city} options={CITIES} labels={CITY_NAME} onChange={setCity} className="accent" />
        {tab !== 'umowa' && <Seg value={year} options={years} onChange={setYear}
          labels={Object.fromEntries(years.map((y) => [y, <span key={y}>{y} <span className="faint small">· {yearHint(y, current)}</span></span>]))} />}
        {tab !== 'cennik' && tab !== 'umowa' && <Seg value={lang} options={['pl', 'en'] as const} labels={{ pl: 'PL', en: 'EN' }} onChange={setLang} />}
        {(tab === 'wiadomosci' || tab === 'mail') && (
          <input type="text" placeholder="Imię dziecka (wstawi się w tekst)" value={child} onChange={(e) => setChild(e.target.value)} style={{ maxWidth: 240 }} />
        )}
        {fees.status === 'draft' && <span className="tag today"><AlertTriangle size={12} /> cennik roboczy — sprawdź</span>}
      </section>

      {tab === 'cennik' && <FeesTab book={book} city={city} year={year} edited={q.data!.edited} current={current} onYear={setYear} />}
      {tab === 'wiadomosci' && <MessagesTab lang={lang} child={child} />}
      {tab === 'mail' && <MailTab book={book} city={city} year={year} lang={lang} child={child} />}
      {tab === 'umowa' && <HandoverTab book={book} city={city} onYear={setYear} />}
    </>
  );
}

/* ------------------------------------------------------------------ Cennik */

function FeesTab({ book, city, year, edited, current, onYear }: { book: FeeBook; city: City; year: string; edited: string[]; current: string; onYear: (y: string) => void }) {
  const f = book[city][year];
  const years = Object.keys(book[city]).sort();
  const prev = years[years.indexOf(year) - 1];
  const before = prev ? book[city][prev] : undefined;
  const [edit, setEdit] = useState(false);
  const toast = useToast();
  const reset = useAction(() => api.resetFees(city, year), { ok: 'Przywrócono cennik z prezentacji' });
  const isEdited = edited.includes(`${city}:${year}`);
  const anyMonths = f.rows.some((r) => r.months);
  const anyMat = f.rows.some((r) => r.materials);
  const change = (r: FeeRow) => {
    const o = before?.rows.find((x) => x.level.pl === r.level.pl) || before?.rows[f.rows.indexOf(r)];
    if (!o || !o.monthly) return null;
    const d = (r.monthly - o.monthly) / o.monthly * 100;
    return Math.abs(d) < 0.05 ? '=' : `${d > 0 ? '+' : ''}${d.toFixed(1)}%`;
  };

  return (
    <div className="grid main-side">
      <div className="col" style={{ gap: 16 }}>
        <section className="card">
          <div className="card-head">
            <h2>{CITY_NAME[city]} · cennik {year} <span className="soft small">({yearHint(year, current)})</span></h2>
            <button className="btn sm" onClick={() => { copyText(feesPlain(f, city, year)); toast('Skopiowano cennik'); }}><Copy size={14} /> Kopiuj</button>
            <button className="btn sm" onClick={() => setEdit(true)}><Pencil size={14} /> Edytuj</button>
          </div>
          {f.note && <div className="hint" style={{ padding: '0 20px 10px' }}><AlertTriangle size={13} /> {f.note}</div>}
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr>
                <th>Etap</th><th className="num">Czesne / mies.</th>{anyMonths && <th className="num">Mies.</th>}{anyMonths && <th className="num">Rocznie</th>}
                <th className="num">Wpisowe</th>{anyMat && <th className="num">Materiały</th>}{before && <th className="num">vs {prev}</th>}
              </tr></thead>
              <tbody>
                {f.rows.map((r, i) => (
                  <tr key={i} style={{ cursor: 'default' }}>
                    <td><b>{r.level.pl}</b></td>
                    <td className="num nowrap"><b>{pln(r.monthly)}</b></td>
                    {anyMonths && <td className="num nowrap">{r.months || '—'}</td>}
                    {anyMonths && <td className="num nowrap">{r.months ? pln(r.monthly * r.months) : '—'}</td>}
                    <td className="num nowrap">{r.enrol ? pln(r.enrol) : '—'}</td>
                    {anyMat && <td className="num nowrap">{materialsText(r) || '—'}</td>}
                    {before && <td className="num soft nowrap">{change(r) ?? '—'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="small faint" style={{ padding: '10px 20px 14px' }}>
            Źródło: {f.source}{f.hours ? ` · godziny ${f.hours}` : ''}{isEdited ? ' · edytowany w Opal5' : ''}
            {isEdited && <button className="btn sm ghost" style={{ marginLeft: 8 }} onClick={() => confirm('Wrócić do cennika z prezentacji? Twoje zmiany dla tego roku znikną.') && reset.mutate(undefined)}><RotateCcw size={13} /> Przywróć</button>}
          </div>
        </section>

        <Quote f={f} city={city} year={year} />
      </div>

      <div className="col" style={{ gap: 16 }}>
        <ItemsCard title="Zniżki" items={f.discounts} />
        {f.extras.length > 0 && <ItemsCard title="Dodatkowo płatne" items={f.extras} />}
        <section className="card pad col" style={{ gap: 8 }}>
          <h2>Co w cenie</h2>
          {f.included.pl.map((x) => <div key={x} className="small"><Check size={13} style={{ color: 'var(--ok)' }} /> {x}</div>)}
          {f.notIncluded.pl.length > 0 && <>
            <div className="eyebrow" style={{ marginTop: 8 }}>Nie wliczone</div>
            {f.notIncluded.pl.map((x) => <div key={x} className="small soft">✗ {x}</div>)}
          </>}
        </section>
      </div>

      <FeeEditor open={edit} onClose={() => setEdit(false)} city={city} year={year} f={f} onSaved={onYear} />
    </div>
  );
}

function ItemsCard({ title, items }: { title: string; items: FeeItem[] }) {
  return (
    <section className="card pad col" style={{ gap: 10 }}>
      <h2>{title}</h2>
      {items.map((d, i) => (
        <div key={i} className="col" style={{ gap: 2 }}>
          <div className="row" style={{ gap: 8 }}><b className="small grow">{d.label.pl}</b><span className="tag soon">{d.value.pl}</span></div>
          {d.note && <div className="small soft">{d.note.pl}</div>}
        </div>
      ))}
    </section>
  );
}

function feesPlain(f: FeeYear, city: City, year: string, lang: Lang = 'pl') {
  const en = lang === 'en';
  const lines = [`Maple Bear ${CITY_NAME[city]} — ${en ? 'pricing' : 'cennik'} ${year}`, ''];
  for (const r of f.rows) {
    lines.push(`• ${r.level[lang]}: ${pln(r.monthly, lang)}${en ? '/month' : '/mies.'}${r.months ? ` × ${r.months}` : ''}` +
      `${r.enrol ? `, ${en ? 'enrolment fee' : 'wpisowe'} ${pln(r.enrol, lang)}` : ''}${r.materials ? `, ${en ? 'materials' : 'materiały'} ${materialsText(r, lang)}` : ''}`);
  }
  if (f.discounts.length) lines.push('', en ? 'Discounts:' : 'Zniżki:', ...f.discounts.map((d) => `• ${d.label[lang]}: ${d.value[lang]}`));
  return lines.join('\n');
}

/* A quote for a family: children, siblings and annual payment. */
const pct = (f: FeeYear, re: RegExp) => {
  const d = f.discounts.find((x) => re.test(x.label.pl));
  const m = d?.value.pl.match(/-?\s*(\d+)\s*%/);
  return m ? Number(m[1]) / 100 : 0;
};

function Quote({ f, city, year }: { f: FeeYear; city: City; year: string }) {
  const [kids, setKids] = useState<number[]>([0]);
  const [annual, setAnnual] = useState(false);
  const [lang, setLang] = useState<Lang>('pl');
  const toast = useToast();
  const sib = [0, pct(f, /drugie/i), pct(f, /trzecie/i) || pct(f, /drugie/i)];
  const ann = annual ? pct(f, /roczn|jednorazow/i) : 0;
  const lines = kids.map((li, i) => {
    const r = f.rows[li] || f.rows[0];
    const d = Math.min(i, 2);
    const monthly = Math.round(r.monthly * (1 - sib[d]) * (1 - ann));
    return { r, monthly, sib: sib[d] };
  });
  const total = lines.reduce((n, l) => n + l.monthly, 0);
  const enrol = lines.reduce((n, l) => n + (l.r.enrol || 0), 0);
  const en = lang === 'en';
  const text = [
    en ? 'Good morning,' : 'Dzień dobry,',
    en ? `here is the cost of Maple Bear ${CITY_NAME[city]} for the ${year} school year:` : `przesyłam wycenę Maple Bear ${CITY_NAME[city]} na rok szkolny ${year}:`,
    '',
    ...lines.map((l, i) => `• ${l.r.level[lang]}: ${pln(l.monthly, lang)}${en ? '/month' : '/mies.'}` +
      `${l.sib ? ` (${en ? `${['', 'second', 'third'][Math.min(i, 2)]} child` : `${['', 'drugie', 'trzecie'][Math.min(i, 2)]} dziecko`} -${Math.round(l.sib * 100)}%)` : ''}`),
    ...(kids.length > 1 ? [`${en ? 'Total' : 'Razem'}: ${pln(total, lang)}${en ? '/month' : '/mies.'}`] : []),
    ...(ann ? [en ? `Prices include the -${Math.round(ann * 100)}% annual payment discount.` : `Ceny uwzględniają zniżkę -${Math.round(ann * 100)}% przy płatności za cały rok z góry.`] : []),
    ...(enrol ? [`${en ? 'One-time enrolment fee' : 'Jednorazowa opłata rekrutacyjna'}: ${pln(enrol, lang)}`] : []),
    ...lines.filter((l) => l.r.materials).slice(0, 1).map(() => `${en ? 'Educational materials' : 'Materiały edukacyjne'}: ${lines.map((l) => materialsText(l.r, lang)).filter(Boolean).join(', ')}`),
    '', SIGNATURE[lang],
  ].join('\n');

  return (
    <section className="card">
      <div className="card-head"><h2><Calculator size={16} /> Wycena dla rodziny</h2>
        <Seg value={lang} options={['pl', 'en'] as const} labels={{ pl: 'PL', en: 'EN' }} onChange={setLang} /></div>
      <div className="col" style={{ gap: 10, padding: '0 20px 16px' }}>
        {kids.map((li, i) => (
          <div key={i} className="row" style={{ gap: 8 }}>
            <span className="small soft" style={{ width: 70 }}>{i + 1}. dziecko</span>
            <select value={li} onChange={(e) => setKids(kids.map((k, j) => (j === i ? Number(e.target.value) : k)))} style={{ flex: 1 }}>
              {f.rows.map((r, j) => <option key={j} value={j}>{r.level.pl} — {pln(r.monthly)}</option>)}
            </select>
            <b className="nowrap" style={{ width: 100, textAlign: 'right' }}>{pln(lines[i].monthly)}</b>
            {kids.length > 1 && <button className="btn sm ghost" onClick={() => setKids(kids.filter((_, j) => j !== i))} aria-label="Usuń"><Trash2 size={13} /></button>}
          </div>
        ))}
        <div className="row wrap" style={{ gap: 12 }}>
          {kids.length < 4 && <button className="btn sm" onClick={() => setKids([...kids, 0])}><Plus size={14} /> Rodzeństwo</button>}
          <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={annual} onChange={(e) => setAnnual(e.target.checked)} /> Płatność roczna z góry</label>
          <span className="spacer grow" />
          <span>Razem <b>{pln(total)}</b> / mies.{enrol ? <span className="soft small"> · wpisowe {pln(enrol)}</span> : null}</span>
        </div>
        <div className="pre small" style={{ background: 'var(--tint)', padding: 12, borderRadius: 10 }}>{text}</div>
        <div><button className="btn sm primary" onClick={() => { copyText(text); toast('Skopiowano wycenę'); }}><Copy size={14} /> Kopiuj wiadomość</button></div>
      </div>
    </section>
  );
}

/* Editing one city's list for one year — the inputs mirror the table. */
const linesOf = (items: FeeItem[], l: Lang) => items.map((d) => [d.label[l], d.value[l], d.note?.[l] || ''].join(' | ').replace(/( \| )+$/, '')).join('\n');
const itemsOf = (pl: string, en: string): FeeItem[] => {
  const E = en.split('\n');
  return pl.split('\n').map((line, i) => {
    const [label = '', value = '', note = ''] = line.split('|').map((x) => x.trim());
    const [le = label, ve = value, ne = note] = (E[i] || '').split('|').map((x) => x.trim());
    return { label: { pl: label, en: le || label }, value: { pl: value, en: ve || value }, ...(note ? { note: { pl: note, en: ne || note } } : {}) };
  }).filter((d) => d.label.pl);
};

function FeeEditor({ open, onClose, city, year, f, onSaved }: { open: boolean; onClose: () => void; city: City; year: string; f: FeeYear; onSaved: (y: string) => void }) {
  const [y, setY] = useState(year);
  const [rows, setRows] = useState<FeeRow[]>(f.rows);
  const [meta, setMeta] = useState({ status: f.status, source: f.source, hours: f.hours || '', note: f.note || '' });
  const [txt, setTxt] = useState({ disc: '', discEn: '', extra: '', extraEn: '', inc: '', incEn: '', not: '', notEn: '' });
  useEffect(() => {
    if (!open) return;
    setY(year); setRows(f.rows.map((r) => ({ ...r, level: { ...r.level } })));
    setMeta({ status: f.status, source: f.source, hours: f.hours || '', note: f.note || '' });
    setTxt({ disc: linesOf(f.discounts, 'pl'), discEn: linesOf(f.discounts, 'en'), extra: linesOf(f.extras, 'pl'), extraEn: linesOf(f.extras, 'en'),
      inc: f.included.pl.join('\n'), incEn: f.included.en.join('\n'), not: f.notIncluded.pl.join('\n'), notEn: f.notIncluded.en.join('\n') });
  }, [open, year, f]);
  const save = useAction((d: FeeYear) => api.saveFees(city, y.trim(), d), { ok: 'Zapisano cennik', onDone: () => { onSaved(y.trim()); onClose(); } });
  const set = (i: number, k: keyof FeeRow, v: any) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const n = (v: string) => (v.trim() ? Number(v.replace(/\s/g, '').replace(',', '.')) : undefined);
  const split = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
  const submit = () => save.mutate({
    status: meta.status, source: meta.source, hours: meta.hours || undefined, note: meta.note || undefined, rows,
    discounts: itemsOf(txt.disc, txt.discEn), extras: itemsOf(txt.extra, txt.extraEn),
    included: { pl: split(txt.inc), en: split(txt.incEn) }, notIncluded: { pl: split(txt.not), en: split(txt.notEn) },
  });

  return (
    <Modal open={open} onClose={onClose} wide title={`Cennik ${CITY_NAME[city]}`}
      footer={<><span className="hint grow">Zmiana roku zapisze cennik jako nowy rok (np. 2028/29).</span>
        <button className="btn" onClick={onClose}>Anuluj</button><button className="btn primary" disabled={save.isPending || !/^\d{4}\/\d{2}$/.test(y.trim())} onClick={submit}>Zapisz</button></>}>
      <div className="col" style={{ gap: 14 }}>
        <div className="fields">
          <label className="field">Rok szkolny<input type="text" value={y} onChange={(e) => setY(e.target.value)} placeholder="2027/28" /></label>
          <label className="field">Status<select value={meta.status} onChange={(e) => setMeta({ ...meta, status: e.target.value as FeeYear['status'] })}>
            <option value="confirmed">Potwierdzony</option><option value="draft">Roboczy — do sprawdzenia</option></select></label>
          <label className="field">Godziny<input type="text" value={meta.hours} onChange={(e) => setMeta({ ...meta, hours: e.target.value })} /></label>
          <label className="field wide">Źródło<input type="text" value={meta.source} onChange={(e) => setMeta({ ...meta, source: e.target.value })} /></label>
          <label className="field wide">Uwaga (widoczna przy cenniku)<input type="text" value={meta.note} onChange={(e) => setMeta({ ...meta, note: e.target.value })} /></label>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Etap (PL)</th><th>Etap (EN)</th><th className="num">Czesne/mies.</th><th className="num">Mies.</th><th className="num">Wpisowe</th><th className="num">Materiały</th><th>za</th><th /></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ cursor: 'default' }}>
                  <td><input type="text" value={r.level.pl} onChange={(e) => set(i, 'level', { ...r.level, pl: e.target.value })} /></td>
                  <td><input type="text" value={r.level.en} onChange={(e) => set(i, 'level', { ...r.level, en: e.target.value })} /></td>
                  <td><input type="text" inputMode="numeric" value={r.monthly ?? ''} onChange={(e) => set(i, 'monthly', n(e.target.value))} style={{ width: 90 }} /></td>
                  <td><input type="text" inputMode="numeric" value={r.months ?? ''} onChange={(e) => set(i, 'months', n(e.target.value))} style={{ width: 50 }} /></td>
                  <td><input type="text" inputMode="numeric" value={r.enrol ?? ''} onChange={(e) => set(i, 'enrol', n(e.target.value))} style={{ width: 80 }} /></td>
                  <td><input type="text" inputMode="numeric" value={r.materials ?? ''} onChange={(e) => set(i, 'materials', n(e.target.value))} style={{ width: 80 }} /></td>
                  <td><select value={r.materialsPer || 'year'} onChange={(e) => set(i, 'materialsPer', e.target.value)}><option value="year">rok</option><option value="month">mies.</option></select></td>
                  <td><button className="btn sm ghost" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Usuń"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div><button className="btn sm" onClick={() => setRows([...rows, { level: { pl: '', en: '' }, monthly: 0 }])}><Plus size={14} /> Poziom</button></div>
        <div className="hint">Zniżki i dodatki: jedna na linię, w formacie <code>nazwa | wartość | opis</code>. Wersja angielska w tej samej kolejności.</div>
        <div className="grid halves" style={{ gap: 12 }}>
          {([['disc', 'Zniżki'], ['discEn', 'Zniżki (EN)'], ['extra', 'Dodatkowo płatne'], ['extraEn', 'Dodatkowo płatne (EN)'], ['inc', 'Co w cenie'], ['incEn', 'Co w cenie (EN)'], ['not', 'Nie wliczone'], ['notEn', 'Nie wliczone (EN)']] as const).map(([k, label]) => (
            <label key={k} className="field">{label}<textarea rows={4} value={txt[k]} onChange={(e) => setTxt({ ...txt, [k]: e.target.value })} /></label>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ Wiadomości */

const fillChild = (text: string, child: string) => (child.trim() ? text.replace(/\[(imię dziecka|child's name)\]/gi, child.trim()) : text);

function MessagesTab({ lang, child }: { lang: Lang; child: string }) {
  const [cat, setCat] = useState('');
  const [find, setFind] = useState('');
  const [pm, setPm] = useState(() => new Date().getHours() >= 12);
  const k = find.trim().toLowerCase();
  const cats = TEMPLATES.map((c) => ({
    ...c,
    blocks: (c.groups ? c.groups.map((g) => ({ name: g.name[lang], items: g.items })) : [{ name: '', items: c.items || [] }])
      .map((b) => ({ ...b, items: b.items.filter((i) => !k || `${i.title.pl} ${i.title.en} ${i.text.pl} ${i.text.en}`.toLowerCase().includes(k)) }))
      .filter((b) => b.items.length),
  })).filter((c) => (!cat || c.id === cat) && c.blocks.length);

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="row wrap" style={{ gap: 10 }}>
        <div className="chips">
          <button className={`chip ${!cat ? 'on' : ''}`} onClick={() => setCat('')}>Wszystkie</button>
          {TEMPLATES.map((c) => <button key={c.id} className={`chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>{c.label[lang]}</button>)}
        </div>
        <span className="spacer grow" />
        {lang === 'en' && <Seg value={pm ? 'pm' : 'am'} options={['am', 'pm'] as const} labels={{ am: 'Good morning', pm: 'Good afternoon' }} onChange={(v) => setPm(v === 'pm')} />}
        <div className="row" style={{ gap: 6 }}><Search size={14} className="soft" /><input type="text" placeholder="Szukaj w treści" value={find} onChange={(e) => setFind(e.target.value)} style={{ width: 200 }} /></div>
      </div>
      {cats.map((c) => (
        <section key={c.id} className="col" style={{ gap: 10 }}>
          <h2>{c.label[lang]}</h2>
          {c.blocks.map((b, bi) => (
            <div key={bi} className="col" style={{ gap: 8 }}>
              {b.name && <div className="eyebrow">{b.name}</div>}
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                {b.items.map((it, i) => <MessageCard key={i} item={it} lang={lang} child={child} pm={pm} />)}
              </div>
            </div>
          ))}
        </section>
      ))}
      {!cats.length && <div className="empty">Nic nie pasuje do „{find}”.</div>}
    </div>
  );
}

function MessageCard({ item, lang, child, pm }: { item: TplItem; lang: Lang; child: string; pm: boolean }) {
  const [sms, setSms] = useState(false);
  const toast = useToast();
  let t = fillChild(item.text[lang], child);
  if (lang === 'en') t = t.replace(/^(Hi|Good morning|Good afternoon)([!,])/, `${pm ? 'Good afternoon' : 'Good morning'}$2`);
  if (sms) t += `\n\n${SIGNATURE[lang]}`;
  const parts = t.split(/(\[[^\]]+\])/g);
  return (
    <div className="card pad col" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 8 }}>
        <b className="grow">{item.title[lang]}</b>
        <Seg value={sms ? 'sms' : 'email'} options={['email', 'sms'] as const} labels={{ email: 'E-mail', sms: 'SMS' }} onChange={(v) => setSms(v === 'sms')} />
      </div>
      <div className="pre small" style={{ flex: 1 }}>{parts.map((p, i) => (/^\[.*\]$/.test(p) ? <mark key={i}>{p}</mark> : p))}</div>
      <div><button className="btn sm primary" onClick={() => { copyText(t); toast('Skopiowano'); }}><Copy size={14} /> Kopiuj</button></div>
    </div>
  );
}

/* ------------------------------------------------------------------ Mail z ofertą */

function MailTab({ book, city, year, lang, child }: { book: FeeBook; city: City; year: string; lang: Lang; child: string }) {
  const [mods, setMods] = useState<string[]>(PRESETS[0].mods);
  const [both, setBoth] = useState(false);
  const toast = useToast();
  const years = Object.keys(book[city]).sort();
  const nextYear = years[years.indexOf(year) + 1];
  const html = useMemo(() => fillChild(offerMailHtml({
    city, lang, mods, year, fees: book[city][year],
    next: both && nextYear ? { year: nextYear, fees: book[city][nextYear] } : undefined,
  }), child), [book, city, lang, mods, year, both, nextYear, child]);
  const toggle = (id: string) => setMods(mods.includes(id) ? mods.filter((m) => m !== id) : [...mods.filter((m) => !(id === 'confirm' && m === 'visit_cta')), id]);
  const plain = () => { const d = document.createElement('div'); d.innerHTML = html; return d.innerText; };
  const sms = companionSms(lang, SIGNATURE[lang]);

  return (
    <div className="grid main-side" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 500px)' }}>
      <div className="col" style={{ gap: 14 }}>
        <section className="card pad col" style={{ gap: 10 }}>
          <h2>Gotowe zestawy</h2>
          <div className="chips">
            {PRESETS.map((p) => <button key={p.label} className={`chip ${p.mods.join() === mods.join() ? 'on' : ''}`} onClick={() => setMods(p.mods)}>{p.label}</button>)}
            <button className="chip" onClick={() => setMods([])}>Wyczyść</button>
          </div>
        </section>
        <section className="card pad col" style={{ gap: 10 }}>
          <h2>Co ma być w mailu</h2>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {MODULES.map((m) => {
              const on = mods.includes(m.id);
              return (
                <button key={m.id} className={`chip ${on ? 'on' : ''}`} style={{ justifyContent: 'flex-start', alignItems: 'flex-start', textAlign: 'left', padding: '8px 12px', borderRadius: 12, height: 'auto', lineHeight: 1.35 }} onClick={() => toggle(m.id)}>
                  <span style={{ width: 16 }}>{on ? <Check size={14} /> : null}</span>
                  <span className="col" style={{ gap: 0 }}><b>{m.label.pl}</b><span className="small soft">{m.desc.pl}</span></span>
                </button>
              );
            })}
          </div>
          {mods.includes('pricing') && nextYear && (
            <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={both} onChange={(e) => setBoth(e.target.checked)} />
              Dodaj też cennik {nextYear} (dla rodziny, która zaczyna teraz i zostaje po wrześniu)</label>
          )}
          {mods.includes('pricing') && <div className="hint">Ceny w mailu: rok {year}. Zmień rok na górze, jeśli dziecko zaczyna od września.</div>}
        </section>
        <section className="card pad col" style={{ gap: 8 }}>
          <h2><MessageSquareText size={16} /> SMS do maila</h2>
          <div className="pre small">{sms}</div>
          <div><button className="btn sm" onClick={() => { copyText(sms); toast('Skopiowano SMS'); }}><Copy size={14} /> Kopiuj SMS</button></div>
        </section>
      </div>
      <section className="card pad col" style={{ gap: 10 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <h2 className="grow">Podgląd</h2>
          <button className="btn sm primary" disabled={!mods.length} onClick={async () => { await copyHtml(html, plain()); toast('Skopiowano — wklej w Gmailu'); }}><Copy size={14} /> Kopiuj mail</button>
          <button className="btn sm" disabled={!mods.length} onClick={() => { copyText(html); toast('Skopiowano HTML'); }}>HTML</button>
        </div>
        {mods.length ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: 12, overflow: 'auto', border: '1px solid var(--line)' }} dangerouslySetInnerHTML={{ __html: html }} />
        ) : <div className="empty">Wybierz zestaw albo moduły.</div>}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ Nowa umowa */

function HandoverTab({ book, city, onYear }: { book: FeeBook; city: City; onYear: (y: string) => void }) {
  const today = useToday();
  const toast = useToast();
  const [h, setH] = useState<Handover>({
    name: '', group: '', start: today, enrol: '', tuition: '', tuitionFreq: 'monthly', materials: '', materialsFreq: 'yearly',
    link: '', referral: false, referrer: '', referrerLink: '', notes: '', city, year: schoolYear(today),
  });
  const [level, setLevel] = useState(-1);
  const year = yearFor(book, city, h.start || today);
  const f = book[city][year];
  useEffect(() => { onYear(year); }, [year]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (level >= 0) fill(level); }, [city]); // eslint-disable-line react-hooks/exhaustive-deps
  const fill = (li: number, start = h.start) => {
    const y = yearFor(book, city, start || today);
    const r = book[city][y].rows[li];
    if (!r) return;
    setH((x) => ({ ...x, start, group: r.level.en, enrol: r.enrol ? pln(r.enrol, 'en') : '', tuition: pln(r.monthly, 'en'), tuitionFreq: 'monthly',
      materials: r.materials ? pln(r.materials, 'en') : '', materialsFreq: r.materialsPer === 'month' ? 'monthly' : 'yearly' }));
  };
  const septNext = `${Number(schoolYear(today).slice(0, 4)) + 1}-09-01`;
  const setStart = (d: string) => (level >= 0 ? fill(level, d) : setH((x) => ({ ...x, start: d })));
  const html = handoverHtml({ ...h, city, year });
  const set = (k: keyof Handover, v: any) => setH({ ...h, [k]: v });

  return (
    <div className="grid main-side" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 500px)' }}>
      <section className="card pad col" style={{ gap: 14 }}>
        <h2>Nowa umowa — powiadom zespół</h2>
        <div className="fields">
          <label className="field">Uczeń / rodzina<input type="text" value={h.name} onChange={(e) => set('name', e.target.value)} placeholder="np. rodzina Kowalskich" /></label>
          <label className="field">Start nauki<input type="date" value={h.start} onChange={(e) => setStart(e.target.value)} />
            <span className="row" style={{ gap: 6 }}>
              <button type="button" className="btn sm" onClick={() => setStart(today)}>Teraz</button>
              <button type="button" className="btn sm" onClick={() => setStart(septNext)}>Od września {septNext.slice(0, 4)}</button>
            </span>
          </label>
          <label className="field wide">Etap (uzupełni ceny z cennika {year})
            <select value={level} onChange={(e) => { const li = Number(e.target.value); setLevel(li); fill(li); }}>
              <option value={-1}>— wybierz —</option>
              {f.rows.map((r, i) => <option key={i} value={i}>{r.level.pl} — {pln(r.monthly)}</option>)}
            </select>
          </label>
          <div className="wide hint">Start {h.start || '—'} → <b>cennik {year}</b> ({yearHint(year, schoolYear(today))}).{f.status === 'draft' ? ' Cennik roboczy — sprawdź kwoty.' : ''}</div>
          <label className="field">Grupa<input type="text" value={h.group} onChange={(e) => set('group', e.target.value)} /></label>
          <label className="field">Wpisowe<input type="text" value={h.enrol} onChange={(e) => set('enrol', e.target.value)} /></label>
          <label className="field">Czesne<input type="text" value={h.tuition} onChange={(e) => set('tuition', e.target.value)} /></label>
          <label className="field">Płatne<select value={h.tuitionFreq} onChange={(e) => set('tuitionFreq', e.target.value)}>
            <option value="monthly">miesięcznie</option><option value="semiannual">semestralnie</option><option value="annual">rocznie</option></select></label>
          <label className="field">Materiały<input type="text" value={h.materials} onChange={(e) => set('materials', e.target.value)} /></label>
          <label className="field">Materiały płatne<select value={h.materialsFreq} onChange={(e) => set('materialsFreq', e.target.value)}>
            <option value="monthly">miesięcznie</option><option value="yearly">rocznie</option></select></label>
          <label className="field wide">Link (Evvotek / Drive)<input type="text" value={h.link} onChange={(e) => set('link', e.target.value)} /></label>
          <label className="row small wide" style={{ gap: 6 }}><input type="checkbox" checked={h.referral} onChange={(e) => set('referral', e.target.checked)} /> Z polecenia (Ambassadors Club)</label>
          {h.referral && <>
            <label className="field">Polecił(a)<input type="text" value={h.referrer} onChange={(e) => set('referrer', e.target.value)} /></label>
            <label className="field">Link do polecającego<input type="text" value={h.referrerLink} onChange={(e) => set('referrerLink', e.target.value)} /></label>
          </>}
          <label className="field wide">Uwagi<textarea rows={3} value={h.notes} onChange={(e) => set('notes', e.target.value)} /></label>
        </div>
      </section>
      <section className="card pad col" style={{ gap: 10 }}>
        <div className="row" style={{ gap: 8 }}>
          <h2 className="grow">Podgląd (po angielsku, dla zespołu)</h2>
          <button className="btn sm primary" onClick={async () => { const d = document.createElement('div'); d.innerHTML = html; await copyHtml(html, d.innerText); toast('Skopiowano — wklej w Gmailu'); }}><Copy size={14} /> Kopiuj mail</button>
        </div>
        <div style={{ background: '#fff', borderRadius: 12, padding: 12, overflow: 'auto', border: '1px solid var(--line)' }} dangerouslySetInnerHTML={{ __html: html }} />
      </section>
    </div>
  );
}
