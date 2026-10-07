import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Upload, Plus, Trash2, Sparkles } from 'lucide-react';
import { api } from '../api';
import { Empty, ErrorBox, Loading, Modal, Seg, StagePill, useAction, useToast } from '../components/ui';
import type { Segment, Style, Template } from '../../shared/domain';

type Tab = 'playbook' | 'szablony' | 'dane' | 'styl';

export function SettingsPage() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') || 'styl') as Tab;
  return (
    <>
      <div className="page-head">
        <div><h1>Ustawienia</h1><div className="sub">Segmenty i pitch, szablony maili, import i kopia zapasowa.</div></div>
        <span className="spacer" />
        <Seg value={tab} options={['styl', 'playbook', 'szablony', 'dane'] as const} onChange={(t) => setSp(t === 'styl' ? {} : { tab: t }, { replace: true })}
          labels={{ styl: 'Styl pisania', playbook: 'Playbook', szablony: 'Szablony', dane: 'Dane' }} />
      </div>
      {tab === 'playbook' ? <Segments /> : tab === 'szablony' ? <Templates /> : tab === 'styl' ? <StyleSettings /> : <Data />}
    </>
  );
}

/* ------------------------------------------------------------ segments */

type SegRow = Segment & { leads: number };
const FIELDS: [keyof Segment, string, number][] = [
  ['why', 'Dlaczego dzwonię (jedno zdanie — widać je przy każdej firmie)', 2],
  ['goal', 'Cel współpracy', 2], ['who', 'Do kogo dzwonić', 2], ['opening', 'Otwarcie (telefon)', 3],
  ['hook', 'Hook', 3], ['offer', 'Oferta', 3], ['cta', 'CTA', 2],
  ['objections', 'Obiekcje i odpowiedzi (oddziel znakiem |)', 4],
];

function Segments() {
  const q = useQuery({ queryKey: ['segments'], queryFn: api.segments });
  const [sel, setSel] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const list = q.data!;
  const current = creating ? null : list.find((s) => s.name === sel) || list[0];

  return (
    <div className="grid list-detail">
      <section className="card">
        <ul className="list">
          {list.map((s) => (
            <li key={s.name} className="li click" style={!creating && current?.name === s.name ? { background: 'var(--tint)' } : undefined}
              onClick={() => { setCreating(false); setSel(s.name); }}>
              <div className="grow">
                <div className="title trunc">{s.name}</div>
                <div className="meta">waga {s.weight} · {s.leads} firm</div>
              </div>
              {!s.opening && <span className="tag" title="Brak pitchu">pusty</span>}
            </li>
          ))}
        </ul>
        <div className="pad"><button className="btn block" onClick={() => setCreating(true)}><Plus size={15} /> Nowy segment</button></div>
      </section>
      <SegmentForm key={creating ? '__new' : current?.name} seg={creating ? null : current || null}
        onSaved={(n) => { setCreating(false); setSel(n); }} />
    </div>
  );
}

function SegmentForm({ seg, onSaved }: { seg: SegRow | null; onSaved: (name: string) => void }) {
  const blank: Partial<Segment> = { name: '', weight: 2 };
  const [d, setD] = useState<Partial<Segment>>(seg || blank);
  useEffect(() => setD(seg || blank), [seg]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useAction(() => api.saveSegment({ ...d, originalName: seg?.name }), { ok: 'Zapisano', onDone: (s) => onSaved(s.name) });
  const del = useAction(() => api.deleteSegment(seg!.name), { ok: 'Usunięto', onDone: () => onSaved('') });

  return (
    <section className="card">
      <div className="card-head"><h2>{seg ? seg.name : 'Nowy segment'}</h2>
        {seg && <Link className="btn sm ghost" to={`/firmy?segment=${encodeURIComponent(seg.name)}`}>{seg.leads} firm →</Link>}
      </div>
      <div className="col" style={{ padding: '0 20px 20px' }}>
        <div className="fields">
          <label className="field">Nazwa<input type="text" value={d.name || ''} onChange={(e) => setD({ ...d, name: e.target.value })} /></label>
          <label className="field">Waga priorytetu (0–10)
            <input type="number" min={0} max={10} step={1} value={d.weight ?? 1} onChange={(e) => setD({ ...d, weight: Number(e.target.value) })} /></label>
        </div>
        <div className="hint">Priorytet = waga + 2 za telefon + 1 za e-mail + 3 przy umówionej wizycie lub negocjacjach.</div>
        {FIELDS.map(([k, label, rows]) => (
          <label key={k} className="field">{label}
            <textarea rows={rows} value={String(d[k] ?? '')} onChange={(e) => setD({ ...d, [k]: e.target.value })} /></label>
        ))}
        <div className="row">
          <button className="btn primary" onClick={() => save.mutate(undefined)} disabled={!d.name?.trim() || save.isPending}>Zapisz</button>
          <span className="grow" />
          {seg && <button className="btn ghost danger" disabled={seg.leads > 0} title={seg.leads ? 'Najpierw przenieś firmy do innego segmentu' : ''}
            onClick={() => confirm(`Usunąć segment ${seg.name}?`) && del.mutate(undefined)}><Trash2 size={15} /> Usuń</button>}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ templates */

function Templates() {
  const q = useQuery({ queryKey: ['templates'], queryFn: api.templates });
  const [edit, setEdit] = useState<(Partial<Template> & { originalCode?: string }) | null>(null);
  const save = useAction(() => api.saveTemplate(edit!), { ok: 'Zapisano', onDone: () => setEdit(null) });
  const del = useAction(() => api.deleteTemplate(edit!.originalCode!), { ok: 'Usunięto', onDone: () => setEdit(null) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;

  return (
    <>
      <section className="card">
        <div className="card-head"><h2>Szablony</h2><span className="hint hide-sm">[Firma] [Miasto] [Osoba] wypełniają się same</span>
          <button className="btn sm primary" onClick={() => setEdit({ code: '', kind: '', segments: '', subject: '', body: '' })}><Plus size={14} /> Nowy</button></div>
        <ul className="list">
          {q.data!.map((t) => (
            <li key={t.code} className="li click" onClick={() => setEdit({ ...t, originalCode: t.code })}>
              <span className="tag mono">{t.code}</span>
              <div className="grow">
                <div className="title">{t.kind}</div>
                <div className="meta trunc">{t.subject || t.body.slice(0, 140)}</div>
              </div>
              <span className="meta hide-sm" style={{ maxWidth: 260 }}>{t.segments}</span>
            </li>
          ))}
          {!q.data!.length && <Empty>Brak szablonów.</Empty>}
        </ul>
      </section>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.originalCode ? `Szablon ${edit.originalCode}` : 'Nowy szablon'} wide
        footer={<>
          {edit?.originalCode && <button className="btn ghost danger" style={{ marginRight: 'auto' }} onClick={() => confirm('Usunąć szablon?') && del.mutate(undefined)}><Trash2 size={15} /> Usuń</button>}
          <button className="btn" onClick={() => setEdit(null)}>Anuluj</button>
          <button className="btn primary" disabled={!edit?.code?.trim() || save.isPending} onClick={() => save.mutate(undefined)}>Zapisz</button>
        </>}>
        {edit && (
          <div className="fields">
            <label className="field">Kod<input type="text" value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></label>
            <label className="field">Rodzaj<input type="text" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })} /></label>
            <label className="field wide">Dla segmentów (po przecinku albo „wszystkie”)
              <input type="text" value={edit.segments} onChange={(e) => setEdit({ ...edit, segments: e.target.value })} /></label>
            <label className="field wide">Temat<input type="text" value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} /></label>
            <label className="field wide">Treść<textarea rows={14} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></label>
          </div>
        )}
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------ data */

function Data() {
  const dup = useQuery({ queryKey: ['duplicates'], queryFn: api.duplicates });
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.importXlsx>> | null>(null);
  const imp = useAction(() => api.importXlsx(file!), { ok: 'Import zakończony', onDone: (r) => { setResult(r); setFile(null); } });

  return (
    <div className="grid halves">
      <div className="col" style={{ gap: 18 }}>
        <section className="card pad col">
          <h2>Kopia zapasowa</h2>
          <div className="soft">Wszystko w jednym pliku .xlsx, w tym samym układzie co stary arkusz (CRM, History, Playbook, Szablony, Events, Tasks). Otworzysz go w Google Sheets albo Excelu.</div>
          <div><a className="btn primary" href="/api/export.xlsx"><Download size={16} /> Pobierz .xlsx</a></div>
        </section>

        <section className="card pad col">
          <h2>Import z arkusza</h2>
          <div className="soft">W Google Sheets: Plik → Pobierz → Microsoft Excel (.xlsx), potem wgraj plik tutaj.
            <b> Import zastępuje wszystkie dane w CRM.</b> Najpierw pobierz kopię.</div>
          <label className="btn" style={{ width: 'fit-content' }}>
            <Upload size={16} /> {file ? file.name : 'Wybierz plik .xlsx'}
            <input type="file" accept=".xlsx" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          <div>
            <button className="btn primary" style={{ background: 'var(--bad)', borderColor: 'var(--bad)' }} disabled={!file || imp.isPending}
              onClick={() => confirm('Zastąpić WSZYSTKIE dane w CRM zawartością tego pliku?') && imp.mutate(undefined)}>
              {imp.isPending ? 'Importuję…' : 'Zastąp wszystko tym plikiem'}
            </button>
          </div>
          {result && (
            <div className="col tight">
              <div>Firmy {String(result.leads)} · aktywności {String(result.activities)} · follow-upy z arkusza {String(result.carriedOver)} ·
                segmenty {String(result.segments)} · szablony {String(result.templates)} · wydarzenia {String(result.events)} · zadania {String(result.tasks)}</div>
              {result.warnings.map((w, i) => <div key={i} className="hint">! {w}</div>)}
            </div>
          )}
        </section>
      </div>

      <section className="card">
        <div className="card-head"><h2>Możliwe duplikaty</h2><span className="count">{dup.data?.length ?? ''}</span></div>
        {dup.isLoading ? <Loading /> : dup.error ? <div className="pad"><ErrorBox error={dup.error} /></div> : (
          <ul className="list">
            {dup.data!.map((g, i) => (
              <li key={i} className="li" style={{ display: 'block' }}>
                {g.map((l) => (
                  <div key={l.id} className="row" style={{ padding: '3px 0' }}>
                    <span className="faint mono small" style={{ width: 44 }}>{l.id}</span>
                    <Link to={`/firmy/${l.id}`} className="title grow trunc">{l.company}</Link>
                    <span className="soft small hide-sm">{l.city}</span>
                    <StagePill stage={l.stage} />
                  </div>
                ))}
              </li>
            ))}
            {!dup.data!.length && <Empty>Brak duplikatów.</Empty>}
          </ul>
        )}
      </section>
    </div>
  );
}

const STYLE_FIELDS: { key: keyof Style; label: string; hint: string }[] = [
  { key: 'project', label: 'Instrukcje ogólne', hint: 'Kim jesteś, czym jest szkoła, oferta, fakty, zasady — to, co było w instrukcjach projektu „Maple Bear”.' },
  { key: 'b2b', label: 'Maile do firm (B2B)', hint: 'Ton, długość, struktura, stałe zwroty — jak w czacie B2B.' },
  { key: 'casual', label: 'Rozmowy swobodne', hint: 'Rodzice, nauczyciele, zespół — jak w czacie „conversation”.' },
];

/** How the assistant writes — moved over from the Claude project, editable here. */
function StyleSettings() {
  const q = useQuery({ queryKey: ['style'], queryFn: api.style });
  const kb = useQuery({ queryKey: ['knowledge'], queryFn: api.knowledge });
  const chats = useQuery({ queryKey: ['threads'], queryFn: api.threads });
  const [pickChats, setPickChats] = useState<number[]>([]);
  const toast = useToast();
  const [d, setD] = useState<Style | null>(null);
  const [learn, setLearn] = useState<keyof Style | null>(null);
  const [pick, setPick] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data) setD(q.data); }, [q.data]);
  const save = useAction(() => api.saveStyle(d!), { ok: 'Zapisano styl' });
  if (q.isLoading || !d) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const sources = (kb.data || []).filter((k) => k.textLength > 0 && !k.mime.includes('html'))
    .sort((a, b) => Number(b.tags.includes('czat')) - Number(a.tags.includes('czat')));
  const dirty = JSON.stringify(d) !== JSON.stringify(q.data);

  const runLearn = async () => {
    if (!learn) return;
    setBusy(true);
    try {
      const r = await api.learnStyle(pick, learn, pickChats);
      setD({ ...d, [learn]: r.text });
      toast('Gotowe — sprawdź i zapisz');
      setLearn(null); setPick([]); setPickChats([]);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally { setBusy(false); }
  };

  return (
    <section className="card pad col" style={{ gap: 16, maxWidth: 860 }}>
      <div><h2>Styl pisania</h2>
        <div className="soft">Asystent pisze maile i wiadomości według tych zasad. Przenieś je z projektu „Maple Bear”: w Bazie wiedzy
          „Przenieś z Claude”, a potem tutaj „Ucz się z czatów” — albo wklej instrukcje ręcznie.</div></div>
      {STYLE_FIELDS.map((f) => (
        <div key={f.key} className="col tight">
          <div className="row between wrap"><b>{f.label}</b>
            <button className="btn sm ghost" onClick={() => { setLearn(f.key); setPick([]); setPickChats((chats.data || []).filter((c) => c.mode === (f.key === 'casual' ? 'casual' : 'b2b') && f.key !== 'project').slice(0, 3).map((c) => c.id)); }}><Sparkles size={14} /> Ucz się z czatów</button></div>
          <span className="soft small">{f.hint}</span>
          <textarea rows={8} value={d[f.key]} onChange={(e) => setD({ ...d, [f.key]: e.target.value })} placeholder="Pusto — asystent pisze po swojemu." />
        </div>
      ))}
      <div className="row"><button className="btn primary" disabled={!dirty || save.isPending} onClick={() => save.mutate(undefined)}>Zapisz</button></div>

      <Modal open={!!learn} onClose={() => setLearn(null)} wide title={`Ucz się: ${STYLE_FIELDS.find((x) => x.key === learn)?.label || ''}`}
        footer={<><button className="btn" onClick={() => setLearn(null)}>Anuluj</button>
          <button className="btn primary" disabled={(!pick.length && !pickChats.length) || busy} onClick={runLearn}>{busy ? 'Czytam…' : `Przygotuj (${pick.length + pickChats.length})`}</button></>}>
        <div className="soft small">Wybierz czaty lub dokumenty (do 6). Asystent przeczyta je i napisze zasady stylu — zastąpią obecną treść pola (przed zapisem możesz poprawić).</div>
        <div className="col tight" style={{ maxHeight: 360, overflow: 'auto' }}>
          {(chats.data || []).length > 0 && <b className="small">Czaty</b>}
          {(chats.data || []).map((c) => (
            <label key={`c${c.id}`} className="row" style={{ gap: 8 }}>
              <input type="checkbox" checked={pickChats.includes(c.id)} disabled={!pickChats.includes(c.id) && pickChats.length >= 6}
                onChange={() => setPickChats(pickChats.includes(c.id) ? pickChats.filter((x) => x !== c.id) : [...pickChats, c.id])} />
              <span className="grow trunc">{c.title}</span><span className="soft small">{c.count} wiad.</span>
            </label>
          ))}
          {sources.length > 0 && <b className="small" style={{ marginTop: 8 }}>Baza wiedzy</b>}
          {sources.map((k) => (
            <label key={k.id} className="row" style={{ gap: 8 }}>
              <input type="checkbox" checked={pick.includes(k.id)} disabled={!pick.includes(k.id) && pick.length >= 6}
                onChange={() => setPick(pick.includes(k.id) ? pick.filter((x) => x !== k.id) : [...pick, k.id])} />
              <span className="grow trunc">{k.title}</span><span className="soft small">{k.tags}</span>
            </label>
          ))}
          {!sources.length && !(chats.data || []).length && <span className="soft small">Pusto — najpierw „Przenieś z Claude” w Bazie wiedzy.</span>}
        </div>
      </Modal>
    </section>
  );
}
