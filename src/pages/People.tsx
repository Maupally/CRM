import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Mail, Phone, Trash2, Users, X } from 'lucide-react';
import { api } from '../api';
import { Avatar, Empty, ErrorBox, Loading, Modal, Seg, relDay, telHref, useAction, useToday } from '../components/ui';
import { PERSON_KINDS, PERSON_KIND_LABEL, searchKey, shortDate, type Person, type PersonKind } from '../../shared/domain';

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
      </div>
      <section className="card">
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
              <li key={p.id} className="li" onClick={() => setEdit(p)} style={{ cursor: 'pointer' }}>
                <Avatar name={p.name} size="sm" />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="title trunc">{p.name}{p.company && <span className="soft" style={{ fontWeight: 400 }}> · {p.company}</span>}</div>
                  <div className="meta trunc">{p.partner && <span className="tag" style={{ background: 'var(--ok-bg, var(--panel))', color: 'var(--ok)', marginRight: 6 }}>Partner</span>}{p.role || 'bez funkcji'}{p.kind === 'external' ? ' · z zewnątrz' : ''}</div>
                  {p.services && <div className="chips" style={{ marginTop: 4 }}>{p.services.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 5).map((x) => <span key={x} className="tag">{x}</span>)}</div>}
                  {p.events.length > 0 && <div className="meta trunc" style={{ marginTop: 2 }}>Wydarzenia: {p.events.slice(0, 3).map((e) => `${e.title}${e.role ? ` (${e.role})` : ''}`).join(', ')}{p.events.length > 3 ? ` +${p.events.length - 3}` : ''}</div>}
                  {!p.email && !p.phone && <div className="meta" style={{ color: 'var(--warn)' }}>brak e-maila i telefonu</div>}
                </div>
                <span className="soft small hide-sm nowrap">{p.contacts ? `${p.contacts}× · ${relDay(p.lastContact, today)}` : ''}</span>
                {p.phone && <a className="btn sm icon" href={telHref(p.phone)} onClick={(e) => e.stopPropagation()} aria-label="Zadzwoń"><Phone size={14} /></a>}
                {p.email && <a className="btn sm icon" href={`mailto:${p.email}`} onClick={(e) => e.stopPropagation()} aria-label="Napisz"><Mail size={14} /></a>}
              </li>
            ))}
            {!q.isLoading && !rows.length && (
              <Empty icon={Users}>{q.data?.length ? 'Nikt nie pasuje.' : 'Pusto. Dodaj ludzi ze szkoły i z zewnątrz — Claude będzie wiedział, kto jest kim i kto co załatwi.'}</Empty>
            )}
          </ul>
        )}
      </section>
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
        {f('services', 'Co robi / zapewnia', 'text', 'np. ławy, stoły, namioty')}
        {f('email', 'E-mail', 'email')}
        {f('phone', 'Telefon', 'tel')}
      </div>
      {f('aliases', 'Jak go nazywasz (dla asystenta)', 'text', 'np. dyrektor, szef, Patryk')}
      <label className="field">Notatki<textarea rows={2} value={d.notes || ''} onChange={(e) => setD({ ...d, notes: e.target.value })}
        placeholder="np. woli krótkie maile, decyduje o budżecie wydarzeń" /></label>
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
