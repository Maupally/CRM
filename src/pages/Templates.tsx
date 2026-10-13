import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Check, Copy, MessageSquareText, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '../api';
import { ErrorBox, Loading, Modal, Seg, copyText, useAction, useToast, useToday } from '../components/ui';
import { CITIES, CITY_NAME, pln, schoolYear, yearFor, type City, type FeeBook, type FeeItem, type FeeRow, type FeeYear } from '../../shared/fees';
import { MODULES, SIGNATURE, TEMPLATES, type TplItem } from '../lib/szablonyData';
import { PRESETS, companionSms, copyHtml, handoverHtml, offerMailHtml, type Handover } from '../lib/offerMail';

type Lang = 'pl' | 'en';
type Tab = 'mail' | 'wiadomosci' | 'umowa';
const TABS = ['mail', 'wiadomosci', 'umowa'] as const;
const TAB_LABEL: Record<Tab, string> = { mail: 'Mail z ofertą', wiadomosci: 'Wiadomości', umowa: 'Nowa umowa' };

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
  const tab = (TABS.includes(sp.get('tab') as Tab) ? sp.get('tab') : 'mail') as Tab;
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
        <Seg value={tab} options={TABS} labels={TAB_LABEL} onChange={(t) => setSp(t === 'mail' ? {} : { tab: t }, { replace: true })} />
      </div>

      <section className="card pad row wrap" style={{ gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <Seg value={city} options={CITIES} labels={CITY_NAME} onChange={setCity} className="accent" />
        {tab !== 'umowa' && <Seg value={year} options={years} onChange={setYear}
          labels={Object.fromEntries(years.map((y) => [y, <span key={y}>{y} <span className="faint small">· {yearHint(y, current)}</span></span>]))} />}
        {tab !== 'umowa' && <Seg value={lang} options={['pl', 'en'] as const} labels={{ pl: 'PL', en: 'EN' }} onChange={setLang} />}
        {(tab === 'wiadomosci' || tab === 'mail') && (
          <input type="text" placeholder="Imię dziecka (wstawi się w tekst)" value={child} onChange={(e) => setChild(e.target.value)} style={{ maxWidth: 240 }} />
        )}
      </section>

      {tab === 'wiadomosci' && <MessagesTab lang={lang} child={child} />}
      {tab === 'mail' && <MailTab book={book} city={city} year={year} lang={lang} child={child} />}
      {tab === 'umowa' && <HandoverTab book={book} city={city} onYear={setYear} />}
    </>
  );
}

/* ------------------------------------------------------------------ Cennik (edycja)

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
    status: 'confirmed', source: meta.source, hours: meta.hours || undefined, rows,
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
          <label className="field">Godziny<input type="text" value={meta.hours} onChange={(e) => setMeta({ ...meta, hours: e.target.value })} /></label>
          <label className="field wide">Źródło<input type="text" value={meta.source} onChange={(e) => setMeta({ ...meta, source: e.target.value })} /></label>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Etap (PL)</th><th>Etap (EN)</th><th className="num">Czesne/mies.</th><th className="num">Mies.</th><th className="num">Wpisowe</th><th className="num">Materiały</th><th>za</th><th /></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ cursor: 'default' }}>
                  <td><input type="text" value={r.level.pl} onChange={(e) => set(i, 'level', { ...r.level, pl: e.target.value })} style={{ minWidth: 170 }} /></td>
                  <td><input type="text" value={r.level.en} onChange={(e) => set(i, 'level', { ...r.level, en: e.target.value })} style={{ minWidth: 170 }} /></td>
                  <td><input type="text" inputMode="numeric" value={r.monthly ?? ''} onChange={(e) => set(i, 'monthly', n(e.target.value))} style={{ width: 90 }} /></td>
                  <td><input type="text" inputMode="numeric" value={r.months ?? ''} onChange={(e) => set(i, 'months', n(e.target.value))} style={{ width: 50 }} /></td>
                  <td><input type="text" inputMode="numeric" value={r.enrol ?? ''} onChange={(e) => set(i, 'enrol', n(e.target.value))} style={{ width: 80 }} /></td>
                  <td><input type="text" inputMode="numeric" value={r.materials ?? ''} onChange={(e) => set(i, 'materials', n(e.target.value))} style={{ width: 80 }} /></td>
                  <td><select value={r.materialsPer || 'year'} onChange={(e) => set(i, 'materialsPer', e.target.value)} style={{ minWidth: 90 }}><option value="year">rok</option><option value="month">mies.</option></select></td>
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
  const [edit, setEdit] = useState(false);
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
          {mods.includes('pricing') && <div className="row wrap hint" style={{ gap: 8 }}><span className="grow">Ceny w mailu: rok {year}. Zmień rok na górze, jeśli dziecko zaczyna od września.</span>
            <button className="btn sm" onClick={() => setEdit(true)}><Pencil size={14} /> Zmień ceny {CITY_NAME[city]} {year}</button></div>}
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
      <FeeEditor open={edit} onClose={() => setEdit(false)} city={city} year={year} f={book[city][year]} onSaved={() => undefined} />
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
          <div className="wide hint">Start {h.start || '—'} → <b>cennik {year}</b> ({yearHint(year, schoolYear(today))}).</div>
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
