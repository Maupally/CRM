import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Building2, CalendarDays, MapPin, Mail, Pencil, Phone, Trash2, Users, X } from 'lucide-react';
import { BoardView } from '../components/BoardView';
import { api } from '../api';
import { Avatar, Empty, ErrorBox, Loading, Modal, Seg, relDay, telHref, useAction, useToday } from '../components/ui';
import { PERSON_KINDS, PERSON_KIND_LABEL, searchKey, shortDate, type NodeKind, type Person, type PersonKind } from '../../shared/domain';

/**
 * The user's network: the school team and outside contacts (suppliers, animators, people at firms) — with what
 * they do and which events they helped with, so the next event can be planned from who is already known.
 */
export function PeoplePage() {
  const q = useQuery({ queryKey: ['people'], queryFn: api.people });
  const today = useToday();
  const [sp, setSp] = useSearchParams();
  const [edit, setEdit] = useState<Partial<Person> | null>(null);
  const [kind, setKind] = useState<PersonKind | 'partner' | ''>('');
  const [find, setFind] = useState('');
  const nav = useNavigate();
  const view = sp.get('widok') === 'tablica' ? 'tablica' : 'lista';
  const want = Number(sp.get('osoba')) || 0;
  useEffect(() => {
    const p = want && q.data?.find((x) => x.id === want);
    if (p) { setEdit(p); setSp({}, { replace: true }); }
  }, [want, q.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const k = searchKey(find);
    return (q.data || []).filter((p) => (!kind || (kind === 'partner' ? p.partner : p.kind === kind)) &&
      (!k || searchKey([p.name, p.role, p.company, p.services, p.aliases, p.notes, ...p.events.map((e) => `${e.title} ${e.role}`)].join(' ')).includes(k)));
  }, [q.data, kind, find]);
  const count = (k: PersonKind) => (q.data || []).filter((p) => p.kind === k).length;

  return (
    <>
      <div className="page-head">
        <div><h1>Zespół i kontakty</h1><div className="sub">Kto jest kim, co robi i przy jakich wydarzeniach pomagał. Claude w claude.ai dopisuje tu nowe osoby na bieżąco i podpowiada z tej listy, kto co załatwi.</div></div>
        <span className="spacer" />
        <Seg value={view} options={['lista', 'tablica'] as const} labels={{ lista: 'Lista', tablica: 'Tablica powiązań' }}
          onChange={(v) => setSp(v === 'lista' ? {} : { widok: v }, { replace: true })} />
      </div>
      {view === 'tablica' ? <WholeBoard /> : <section className="card">
        <div className="toolbar">
          <input type="search" placeholder="Szukaj: imię, firma, „animacje”, „druk”…" value={find} onChange={(e) => setFind(e.target.value)} />
          <div className="chips">
            <button className={`chip ${!kind ? 'on' : ''}`} onClick={() => setKind('')}>Wszyscy</button>
            {PERSON_KINDS.map((k) => <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{PERSON_KIND_LABEL[k]} · {count(k)}</button>)}
            <button className={`chip ${kind === 'partner' ? 'on' : ''}`} onClick={() => setKind('partner')}>Partnerzy · {(q.data || []).filter((p) => p.partner).length}</button>
          </div>
        </div>
        {q.isLoading ? <Loading /> : q.error ? <div className="pad"><ErrorBox error={q.error} /></div> : (
          <ul className="list">
            {rows.map((p) => (
              <li key={p.id} className="li" onClick={() => nav(`/zespol/${p.id}`)} style={{ cursor: 'pointer' }}>
                <Avatar name={p.name} size="sm" />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="title trunc">{p.name}{p.company && <span className="soft" style={{ fontWeight: 400 }}> · {p.company}</span>}</div>
                  {p.scope && <div className="meta trunc">Zakres: {p.scope}</div>}
                  <div className="meta trunc">{p.partner && <span className="tag" style={{ background: 'var(--ok-bg, var(--panel))', color: 'var(--ok)', marginRight: 6 }}>Partner</span>}{p.role || 'bez funkcji'}{p.kind === 'external' ? ' · z zewnątrz' : ''}</div>
                  {p.services && <div className="chips" style={{ marginTop: 4 }}>{p.services.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 5).map((x) => <span key={x} className="tag">{x}</span>)}</div>}
                  {p.events.length > 0 && <div className="meta trunc" style={{ marginTop: 2 }}>Wydarzenia: {p.events.slice(0, 3).map((e) => `${e.title}${e.role ? ` (${e.role})` : ''}`).join(', ')}{p.events.length > 3 ? ` +${p.events.length - 3}` : ''}</div>}
                  {!p.email && !p.phone && <div className="meta" style={{ color: 'var(--warn)' }}>brak e-maila i telefonu</div>}
                </div>
                <span className="soft small hide-sm nowrap">{p.doneCount ? `zrobione: ${p.doneCount}` : ''}{p.contacts ? `${p.doneCount ? ' · ' : ''}${p.contacts}× · ${relDay(p.lastContact, today)}` : ''}</span>
                {p.phone && <a className="btn sm icon" href={telHref(p.phone)} onClick={(e) => e.stopPropagation()} aria-label="Zadzwoń"><Phone size={14} /></a>}
                {p.email && <a className="btn sm icon" href={`mailto:${p.email}`} onClick={(e) => e.stopPropagation()} aria-label="Napisz"><Mail size={14} /></a>}
              </li>
            ))}
            {!q.isLoading && !rows.length && (
              <Empty icon={Users}>{q.data?.length ? 'Nikt nie pasuje.' : 'Pusto. Dodaj ludzi ze szkoły i z zewnątrz — Claude będzie wiedział, kto jest kim i kto co załatwi.'}</Empty>
            )}
          </ul>
        )}
      </section>}
      <PersonForm value={edit} onClose={() => setEdit(null)} />
    </>
  );
}

export function PersonForm({ value, onClose, onSaved }: { value: Partial<Person> | null; onClose: () => void; onSaved?: (p: Person) => void }) {
  const [d, setD] = useState<Partial<Person>>({});
  useEffect(() => { if (value) setD(value); }, [value]);
  const save = useAction(() => api.savePerson(d), { ok: 'Zapisano', onDone: (p) => { onSaved?.(p); onClose(); } });
  const drop = useAction(() => api.deletePerson(d.id!), { ok: 'Usunięto', onDone: onClose });
  const unlink = useAction((eventId: string) => api.unlinkEventPerson(eventId, d.id!), { onDone: async () => setD({ ...d, ...(await api.people()).find((p) => p.id === d.id) }) });
  const f = (k: keyof Person, label: string, type = 'text', placeholder = '') => (
    <label className="field">{label}
      <input type={type} value={String(d[k] ?? '')} placeholder={placeholder} onChange={(e) => setD({ ...d, [k]: e.target.value })} />
    </label>
  );
  return (
    <Modal open={!!value} onClose={onClose} title={value?.id ? value.name : 'Nowa osoba'}
      footer={<>
        {value?.id && <button className="btn ghost danger" style={{ marginRight: 'auto' }} onClick={() => confirm('Usunąć z Zespołu?') && drop.mutate(undefined)}><Trash2 size={15} /></button>}
        <button className="btn" onClick={onClose}>Anuluj</button>
        <button className="btn primary" disabled={!d.name?.trim() || save.isPending} onClick={() => save.mutate(undefined)}>Zapisz</button>
      </>}>
      <Seg value={d.kind === 'external' ? 'external' : 'team'} options={PERSON_KINDS} labels={PERSON_KIND_LABEL} onChange={(k) => setD({ ...d, kind: k })} />
      <div className="fields">
        {f('name', 'Imię i nazwisko', 'text', 'np. Patryk Nowak')}
        {f('role', 'Funkcja', 'text', d.kind === 'external' ? 'np. Animatorka, Właściciel' : 'np. Dyrektor szkoły')}
        <label className="field">Firma{d.leadId && <Link to={`/firmy/${d.leadId}`} onClick={onClose} className="small" style={{ float: 'right', color: 'var(--accent)' }}>karta firmy →</Link>}
          <input type="text" value={d.company || ''} placeholder="np. Event 360" onChange={(e) => setD({ ...d, company: e.target.value })} /></label>
        {f('services', 'Umiejętności', 'text', d.kind === 'external' ? 'np. ławy, stoły, namioty' : 'np. grafika, social media, Canva')}
        {f('email', 'E-mail', 'email')}
        {f('phone', 'Telefon', 'tel')}
        {f('photo', 'Zdjęcie (link)', 'url', 'https://…')}
      </div>
      {f('aliases', 'Jak go nazywasz (dla asystenta)', 'text', 'np. dyrektor, szef, Patryk')}
      <label className="field">Zakres obowiązków<textarea rows={2} value={d.scope || ''} onChange={(e) => setD({ ...d, scope: e.target.value })}
        placeholder="np. kampanie płatne, raporty z reklam, budżet promocji" /></label>
      <label className="field">Notatki<textarea rows={2} value={d.notes || ''} onChange={(e) => setD({ ...d, notes: e.target.value })}
        placeholder="np. woli krótkie maile, decyduje o budżecie wydarzeń" /></label>
      {!!value?.id && <PersonRecord id={value.id} />}
      {!!value?.id && <PersonWork id={value.id} />}
      {!!d.events?.length && (
        <div className="col tight">
          <span className="small soft">Pomagał(a) przy wydarzeniach</span>
          {d.events.map((e) => (
            <div key={e.eventId} className="row" style={{ gap: 6 }}>
              <Link to={`/wydarzenia/${e.eventId}`} className="grow trunc" onClick={onClose}>{e.title} · {shortDate(e.date)}{e.role ? ` — ${e.role}` : ''}</Link>
              <button className="btn sm ghost icon" onClick={() => unlink.mutate(e.eventId)} aria-label="Odepnij"><X size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/** What is on this person's plate — and for process steps, whether it is their move or they wait for someone. */
function PersonWork({ id }: { id: number }) {
  const q = useQuery({ queryKey: ['person-work', id], queryFn: () => api.personWork(id) });
  if (!q.data) return null;
  return (
    <div className="col tight">
      <span className="small soft">Ma do zrobienia · {q.data.open}</span>
      {!q.data.items.length && <span className="small faint">Nic otwartego.</span>}
      {q.data.items.map((w) => (
        <div key={w.task_id} className="small" style={{ borderLeft: `3px solid ${w.late_days || w.blocked ? 'var(--bad)' : w.state.startsWith('czeka') ? 'var(--line-strong)' : 'var(--accent)'}`, paddingLeft: 8 }}>
          <b>{w.task}</b>{w.due && <span className="soft"> · do {shortDate(w.due)}</span>}{w.late_days ? <span style={{ color: 'var(--bad)' }}> · spóźnione {w.late_days} dni</span> : null}
          <div className="faint">{[w.process, w.company, w.event].filter(Boolean).join(' · ')}{w.process ? ` — ${w.state}` : ''}</div>
          {w.blocked && <div style={{ color: 'var(--bad)' }}>stoi: {w.blocked}</div>}
        </div>
      ))}
    </div>
  );
}

/** Track record from finished work: how much, what keeps coming back (skills not written down yet), deadlines. */
function PersonRecord({ id }: { id: number }) {
  const q = useQuery({ queryKey: ['person-profile', id], queryFn: () => api.personProfile(id) });
  const r = q.data;
  if (!r || !r.done_total) return null;
  return (
    <div className="col tight">
      <span className="small soft">Dorobek · zrobione {r.done_total}{r.done_last_90_days !== r.done_total ? ` (90 dni: ${r.done_last_90_days})` : ''}
        {r.on_time ? ` · ${r.on_time}` : ''}{r.usually_late_by_days ? ` · spóźnia się zwykle o ${r.usually_late_by_days} dni` : ''}
        {r.typical_days_to_finish !== undefined ? ` · zadanie zajmuje zwykle ${r.typical_days_to_finish} dni` : ''}</span>
      {r.recurring_work && (
        <div className="chips">{r.recurring_work.map((w) => <span key={w.word} className="tag" title={w.examples.join('\n')}>{w.word} ×{w.times}</span>)}</div>
      )}
      {r.recently_done.slice(0, 5).map((x) => <div key={x} className="small faint trunc">✓ {x}</div>)}
    </div>
  );
}

function WholeBoard() {
  const q = useQuery({ queryKey: ['board'], queryFn: api.board });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  return (
    <>
      <div className="hint" style={{ marginBottom: 10 }}>Zdjęcia to ludzie, żółte karteczki to wydarzenia, niebieskie to firmy, zielone to miejsca. Kliknij, żeby zobaczyć, co łączy; przeciągnij, żeby przesunąć; kółko myszy przybliża.
        Nitki rysują się same z notatek, wydarzeń, zadań i powiązań, które Claude zapisuje z rozmów.</div>
      <BoardView board={q.data!} height={Math.max(520, window.innerHeight - 230)} />
    </>
  );
}

const KIND_ICON: Record<NodeKind, typeof Users> = { person: Users, event: CalendarDays, company: Building2, place: MapPin };
const KIND_LABEL: Record<NodeKind, string> = { person: 'Ludzie', event: 'Wydarzenia', company: 'Firmy', place: 'Miejsca' };
const nodeHref = (kind: NodeKind, id: string) => (kind === 'person' ? `/zespol/${id}` : kind === 'event' ? `/wydarzenia/${id}` : kind === 'company' ? `/firmy/${id}` : '');

/** A person's file: who they are, everything noted about them (newest first), what ties them to whom, and their corner of the board. */
export function PersonFilePage() {
  const { id: raw } = useParams();
  const id = Number(raw);
  const people = useQuery({ queryKey: ['people'], queryFn: api.people });
  const file = useQuery({ queryKey: ['person-file', id], queryFn: () => api.personFile(id), enabled: !!id });
  const board = useQuery({ queryKey: ['board'], queryFn: api.board });
  const [edit, setEdit] = useState<Partial<Person> | null>(null);
  const dropNote = useAction((n: number) => api.deleteNote(n), { ok: 'Usunięto notatkę' });
  const unlink = useAction((n: number) => api.unlink(n), { ok: 'Usunięto powiązanie' });
  const p = people.data?.find((x) => x.id === id);
  if (people.isLoading || file.isLoading) return <Loading />;
  if (file.error) return <ErrorBox error={file.error} />;
  if (!p) return <div className="empty">Nie ma takiej osoby.</div>;
  const f = file.data!;
  const groups = (['person', 'event', 'company', 'place'] as const).map((k) => [k, f.connections.filter((c) => c.node.kind === k)] as const).filter(([, l]) => l.length);

  return (
    <>
      <div className="page-head">
        <Link to="/zespol" className="btn sm ghost icon" aria-label="Wróć"><ArrowLeft size={16} /></Link>
        {p.photo ? <img src={p.photo} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover' }} /> : <Avatar name={p.name} />}
        <div className="grow" style={{ minWidth: 0 }}>
          <h1>{p.name}</h1>
          <div className="sub">{[p.role, p.company, p.kind === 'external' ? 'z zewnątrz' : 'zespół szkoły'].filter(Boolean).join(' · ')}</div>
        </div>
        {p.phone && <a className="btn sm" href={telHref(p.phone)}><Phone size={14} /> {p.phone}</a>}
        {p.email && <a className="btn sm" href={`mailto:${p.email}`}><Mail size={14} /> E-mail</a>}
        <button className="btn sm" onClick={() => setEdit(p)}><Pencil size={14} /> Edytuj</button>
      </div>

      <div className="grid main-side" style={{ marginBottom: 18 }}>
        <section className="card">
          <div className="card-head"><h2>Notatki</h2><span className="count">{f.notes.length}</span></div>
          {!f.notes.length ? (
            <Empty icon={Users}>Jeszcze nic. Powiedz w claude.ai, co wiesz o tej osobie, albo poproś Claude'a, żeby przepisał notatki z czatu (np. „kwity”) — każdy fakt trafi tu z datą.</Empty>
          ) : (
            <ul className="list">
              {f.notes.map((n) => (
                <li key={n.id} className="li" style={{ alignItems: 'flex-start' }}>
                  <span className="mono small soft nowrap" style={{ width: 70 }}>{shortDate(n.day)}</span>
                  <div className="grow col" style={{ gap: 4, minWidth: 0 }}>
                    <span style={{ whiteSpace: 'pre-wrap' }}>{n.text}</span>
                    <span className="row wrap" style={{ gap: 4 }}>
                      {n.ref && <span className="tag">{n.ref}</span>}
                      {n.links.filter((l) => !(l.kind === 'person' && l.id === String(id))).map((l) => {
                        const I = KIND_ICON[l.kind]; const to = nodeHref(l.kind, l.id);
                        const inner = <><I size={11} /> {l.label}</>;
                        return to ? <Link key={`${l.kind}:${l.id}`} to={to} className="tag soon">{inner}</Link> : <span key={`${l.kind}:${l.id}`} className="tag">{inner}</span>;
                      })}
                      {n.source && <span className="small faint">· {n.source}</span>}
                    </span>
                  </div>
                  <button className="btn sm ghost icon" onClick={() => confirm('Usunąć notatkę?') && dropNote.mutate(n.id)} aria-label="Usuń"><X size={13} /></button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="col" style={{ gap: 16 }}>
          <section className="card pad col" style={{ gap: 10 }}>
            <h2>Powiązania</h2>
            {!groups.length && <span className="small faint">Brak — pojawią się z notatek, wydarzeń i zadań.</span>}
            {groups.map(([k, list]) => (
              <div key={k} className="col" style={{ gap: 6 }}>
                <div className="eyebrow">{KIND_LABEL[k]} · {list.length}</div>
                {list.map((c) => {
                  const to = nodeHref(c.node.kind, c.node.id);
                  return (
                    <div key={c.node.key} className="row" style={{ gap: 6, alignItems: 'flex-start' }}>
                      <div className="grow col" style={{ gap: 1, minWidth: 0 }}>
                        {to ? <Link to={to}><b>{c.node.label}</b></Link> : <b>{c.node.label}</b>}
                        {c.why.slice(0, 2).map((w) => <span key={w} className="small soft trunc">{w}</span>)}
                      </div>
                      {c.linkIds.map((l) => <button key={l} className="btn sm ghost icon" title="Usuń to powiązanie" onClick={() => confirm('Usunąć powiązanie?') && unlink.mutate(l)}><X size={12} /></button>)}
                    </div>
                  );
                })}
              </div>
            ))}
          </section>
          <section className="card pad col" style={{ gap: 12 }}>
            <h2>Dorobek i zadania</h2>
            <PersonRecord id={id} />
            <PersonWork id={id} />
          </section>
        </div>
      </div>

      {board.data && f.connections.length > 0 && (
        <section className="col" style={{ gap: 8 }}>
          <h2>Na tablicy</h2>
          <BoardView board={board.data} focus={`person:${id}`} height={520} />
        </section>
      )}
      <PersonForm value={edit} onClose={() => setEdit(null)} />
    </>
  );
}
