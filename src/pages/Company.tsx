import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Phone, Mail, Globe, Search, Pencil, ChevronDown, Copy, Send, Trash2, CalendarClock, Check, History,
} from 'lucide-react';
import { api } from '../api';
import { CompleteDialog, Composer, DisqualifyDialog } from '../components/ActivityForms';
import {
  Avatar, DueTag, Empty, ErrorBox, Loading, Modal, Prio, ResultTag, StagePill, TYPE_ICON, TypeIcon, copyText, relDay,
  stageLabel, telHref, typeLabel, useAction, useConfig, useToast, useToday,
} from '../components/ui';
import { STAGES, STAGE_INFO, TYPES, normPhone, type Activity, type Lead, type Segment } from '../../shared/domain';

export function CompanyPage() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['lead', id], queryFn: () => api.lead(id) });
  const cfg = useConfig();
  const today = useToday();
  const [completing, setCompleting] = useState<Activity | null>(null);
  const [dq, setDq] = useState(false);
  const [filter, setFilter] = useState('');

  const stage = useAction((s: string) => api.setStage(id, s), { ok: (c) => `Etap: ${stageLabel(c.lead.stage)}` });
  const segment = useAction((s: string) => api.updateLead(id, { segment: s }), { ok: 'Segment zmieniony — pitch zaktualizowany' });

  useEffect(() => { if (q.data) document.title = `${q.data.lead.company} · CRM`; return () => { document.title = 'B2B CRM'; }; }, [q.data]);

  if (q.isLoading) return <Loading />;
  if (q.error) return <><Link to="/firmy" className="btn ghost sm"><ArrowLeft size={15} /> Firmy</Link><div style={{ marginTop: 12 }}><ErrorBox error={q.error} /></div></>;
  const { lead, activities, playbook, events } = q.data!;
  const planned = activities.filter((a) => a.result === 'planned');
  const past = activities.filter((a) => a.result !== 'planned' && (!filter || a.type === filter));
  const phone = normPhone(lead.phone) || lead.phone;
  const curIdx = STAGES.indexOf(lead.stage);

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <Link to="/firmy" className="btn ghost sm" onClick={(e) => { if (history.length > 1) { e.preventDefault(); history.back(); } }}>
          <ArrowLeft size={15} /> Wróć
        </Link>
        <span className="faint mono small">{lead.id}</span>
      </div>

    <div className="path" style={{ marginBottom: 18 }} role="group" aria-label="Etap">
      {STAGES.map((s, i) => (
        <button key={s} title={STAGE_INFO[s]} disabled={stage.isPending}
          className={s === lead.stage ? `cur ${s === 'disqualified' ? 'lost' : s === 'active' ? 'won' : ''}` : i < curIdx && lead.stage !== 'disqualified' ? 'past' : ''}
          onClick={() => s === lead.stage ? null : s === 'disqualified' ? setDq(true) : stage.mutate(s)}>
          {stageLabel(s)}
        </button>
      ))}
    </div>

      <div className="record">
        {/* ---------------------------------------------------- left: who */}
        <div className="col" style={{ gap: 18 }}>
          <section className="card pad col" style={{ order: 1 }}>
            <div className="record-head">
              <Avatar name={lead.company} size="lg" />
              <div className="grow">
                <h1 style={{ fontSize: 20, overflowWrap: 'anywhere' }}>{lead.company}</h1>
                <div className="soft small" style={{ marginTop: 3 }}>{[lead.industry, lead.city].filter(Boolean).join(' · ') || '—'}</div>
                <div className="row wrap" style={{ marginTop: 8, gap: 6 }}><StagePill stage={lead.stage} /><Prio n={lead.priority} /></div>
              </div>
            </div>
            <div className="quick">
              <a href={phone ? telHref(phone) : undefined} className={phone ? '' : 'off'}><Phone size={18} />Zadzwoń</a>
              <a href={lead.email ? `mailto:${lead.email}` : undefined} className={lead.email ? '' : 'off'}><Mail size={18} />E-mail</a>
              <a href={lead.web || undefined} target="_blank" rel="noreferrer" className={lead.web ? '' : 'off'}><Globe size={18} />Strona</a>
              <a href={`https://www.google.com/search?q=${encodeURIComponent(`${lead.company} ${lead.city} kontakt`)}`} target="_blank" rel="noreferrer"><Search size={18} />Google</a>
            </div>
            <label className="field">Segment
              <select value={lead.segment} onChange={(e) => segment.mutate(e.target.value)}>
                {!cfg.data?.segments.some((s) => s.name === lead.segment) && <option>{lead.segment}</option>}
                {cfg.data?.segments.map((s) => <option key={s.name}>{s.name}</option>)}
              </select>
            </label>
          </section>

          <About lead={lead} />
          <Notes lead={lead} />
        </div>

        {/* ---------------------------------------------------- centre: work */}
        <div className="col" style={{ gap: 18 }}>


          <section className="card" style={{ order: 4 }}><Composer key={lead.id} lead={lead} /></section>

          <section className="card" style={{ order: 5 }}>
            <div className="card-head">
              <History size={17} className="soft" /><h2>Historia</h2>
              <span className="soft small">{lead.lastContact ? `ostatni kontakt ${relDay(lead.lastContact, today)}` : 'jeszcze bez kontaktu'}</span>
            </div>
            <div style={{ padding: '0 20px 8px' }} className="chips">
              <button className={`chip ${!filter ? 'on' : ''}`} onClick={() => setFilter('')}>Wszystko <span className="n">{activities.length - planned.length}</span></button>
              {TYPES.map((t) => {
                const n = activities.filter((a) => a.type === t && a.result !== 'planned').length;
                if (!n) return null;
                const I = TYPE_ICON[t];
                return <button key={t} className={`chip ${filter === t ? 'on' : ''}`} onClick={() => setFilter(t)}><I size={13} /> {typeLabel(t)} <span className="n">{n}</span></button>;
              })}
            </div>
            <ul className="timeline">
              {past.map((a) => <TimelineRow key={a.id} a={a} today={today} />)}
              {!past.length && <Empty>Brak wpisów.</Empty>}
            </ul>
          </section>
        </div>

        {/* ---------------------------------------------------- right rail: next + pitch */}
        <div className="col rail" style={{ gap: 18 }}>
          <section className="card" style={{ order: 3 }}>
            <div className="card-head"><CalendarClock size={17} className="soft" /><h2>Następny krok</h2></div>
            <ul className="timeline" style={{ paddingTop: 0 }}>
              {planned.map((a) => <TimelineRow key={a.id} a={a} today={today} onComplete={() => setCompleting(a)} />)}
            </ul>
            {!planned.length && (
              <div className="pad" style={{ paddingTop: 0 }}>
                <div className={lead.stage === 'active' || lead.stage === 'disqualified' ? 'soft small' : 'error-box small'}>
                  {lead.stage === 'active' || lead.stage === 'disqualified' ? 'Nic nie zaplanowano.' : 'Brak zaplanowanego kroku — ta firma może się „zgubić”. Zaplanuj coś w panelu obok.'}
                </div>
              </div>
            )}
          </section>
          <Pitch lead={lead} playbook={playbook} />
          <Templates lead={lead} />
          {events.length > 0 && (
            <section className="card" style={{ order: 10 }}>
              <div className="card-head"><h2>Wydarzenia</h2></div>
              <ul className="list">
                {events.map((e) => (
                  <Link key={e.id} to={`/wydarzenia/${e.id}`} className="li"><span className="soft small">{relDay(e.date, today)}</span><span className="title">{e.title}</span></Link>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <CompleteDialog activity={completing} stage={lead.stage} company={lead.company} onClose={() => setCompleting(null)} />
      <DisqualifyDialog lead={dq ? lead : null} onClose={() => setDq(false)} />
    </>
  );
}

function TimelineRow({ a, today, onComplete }: { a: Activity; today: string; onComplete?: () => void }) {
  const [edit, setEdit] = useState(false);
  const [note, setNote] = useState(a.note);
  const [date, setDate] = useState(a.date);
  const [type, setType] = useState<string>(a.type);
  const save = useAction(() => api.updateActivity(a.id, { note, date, type }), { ok: 'Zapisano', onDone: () => setEdit(false) });
  const drop = useAction(() => api.deleteActivity(a.id), { ok: 'Usunięto' });
  const isPlanned = a.result === 'planned';
  const cls = [isPlanned ? 'planned' : '', isPlanned && a.date < today ? 'late' : '', a.result === 'cancelled' ? 'cancelled' : ''].join(' ');

  return (
    <li className={`tl ${cls}`}>
      <TypeIcon type={a.type} />
      <div className="body" style={{ minWidth: 0 }}>
        {edit ? (
          <div className="col tight">
            <div className="row wrap">
              <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: 140 }}>
                {TYPES.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
              </select>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 170 }} max={isPlanned ? undefined : today} />
            </div>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
            <div className="row">
              <button className="btn sm primary" onClick={() => save.mutate(undefined)} disabled={save.isPending}>Zapisz</button>
              <button className="btn sm" onClick={() => { setEdit(false); setNote(a.note); setDate(a.date); setType(a.type); }}>Anuluj</button>
              <span className="grow" />
              <button className="btn sm ghost danger" onClick={() => confirm('Usunąć ten wpis?') && drop.mutate(undefined)}><Trash2 size={14} /> Usuń</button>
            </div>
          </div>
        ) : (
          <>
            <div className="meta">
              <b>{typeLabel(a.type)}</b>
              {(a.type !== 'Note' || a.result !== 'done') && <ResultTag result={a.result} />}
              {isPlanned ? <DueTag date={a.date} today={today} /> : <span>{relDay(a.date, today)}</span>}
              {a.stageTo && <span className="row" style={{ gap: 4 }}><StagePill stage={a.stageFrom} /> → <StagePill stage={a.stageTo} /></span>}
            </div>
            {a.note && <div className="note">{a.note}</div>}
          </>
        )}
      </div>
      <div className="acts">
        {!edit && onComplete && <button className="btn sm primary" onClick={onComplete}><Check size={14} /> Zrobione</button>}
        {!edit && <button className="btn sm ghost icon" title="Edytuj" aria-label="Edytuj" onClick={() => setEdit(true)}><Pencil size={14} /></button>}
      </div>
    </li>
  );
}

function Pitch({ lead, playbook }: { lead: Lead; playbook: Segment | null }) {
  if (!playbook || !(playbook.opening || playbook.hook || playbook.why)) {
    return (
      <section className="card pad soft" style={{ order: 6 }}>
        Brak pitchu dla segmentu <b>{lead.segment}</b>.{' '}
        {lead.segment === 'NIEZNANA' ? '30 sekund w Google, potem wybierz segment — pitch pojawi się sam.' : <Link to="/ustawienia" style={{ color: 'var(--accent)' }}>Uzupełnij Playbook →</Link>}
      </section>
    );
  }
  const items: [string, string][] = [
    ['Otwarcie', playbook.opening], ['Hook', playbook.hook], ['Oferta', playbook.offer], ['CTA', playbook.cta],
    ['Obiekcje', playbook.objections], ['Do kogo', playbook.who], ['Cel', playbook.goal],
  ];
  return (
    <details className="card fold" style={{ order: 6 }} open>
      <summary><span className="eyebrow">Pitch</span> {playbook.name}<ChevronDown size={16} className="chev" /></summary>
      <div className="col" style={{ padding: '0 20px 20px' }}>
        {playbook.why && <div className="why"><b>Dlaczego dzwonię:</b> {playbook.why}</div>}
        <dl className="pitch" style={{ margin: 0 }}>
          {items.filter(([, v]) => v).map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{k === 'Obiekcje' ? v.split(/\s*\|\s*/).join('\n\n') : v}</dd></div>
          ))}
        </dl>
      </div>
    </details>
  );
}

function Notes({ lead }: { lead: Lead }) {
  const [v, setV] = useState(lead.notes);
  useEffect(() => setV(lead.notes), [lead.notes]);
  const save = useAction(() => api.updateLead(lead.id, { notes: v }), { ok: 'Notatka zapisana' });
  const dirty = v !== lead.notes;
  return (
    <section className="card" style={{ order: 8 }}>
      <div className="card-head"><h2>Notatki</h2>
        {dirty && <button className="btn sm primary" onClick={() => save.mutate(undefined)} disabled={save.isPending}>Zapisz</button>}
      </div>
      <div style={{ padding: '0 20px 20px' }}>
        <textarea rows={5} value={v} onChange={(e) => setV(e.target.value)}
          placeholder="Stałe fakty o firmie: kto decyduje, na czym im zależy. Przebieg rozmów trafia do historii."
          onBlur={() => dirty && save.mutate(undefined)} />
      </div>
    </section>
  );
}

function Templates({ lead }: { lead: Lead }) {
  const cfg = useConfig();
  const toast = useToast();
  const [code, setCode] = useState('');
  const t = useQuery({ queryKey: ['tpl', lead.id, code], queryFn: () => api.renderTemplate(lead.id, code), enabled: !!code });
  const logged = useAction(() => api.log(lead.id, { type: 'Email', result: 'done', note: `Wysłano ${code}: ${t.data?.subject || ''}` }),
    { ok: 'Zapisano jako wysłany' });
  const fits = (segments: string) => /wszystkie|telefon/i.test(segments) || segments.split(/\s*,\s*/).includes(lead.segment);
  const sorted = [...(cfg.data?.templates || [])].sort((a, b) => Number(fits(b.segments)) - Number(fits(a.segments)));

  return (
    <details className="card fold" style={{ order: 9 }}>
      <summary><Mail size={16} className="soft" /> Szablony maili i skrypty<ChevronDown size={16} className="chev" /></summary>
      <div className="col" style={{ padding: '0 20px 20px' }}>
        <select value={code} onChange={(e) => setCode(e.target.value)}>
          <option value="">Wybierz szablon…</option>
          {sorted.map((x) => <option key={x.code} value={x.code}>{fits(x.segments) ? '★ ' : ''}{x.code} · {x.kind}</option>)}
        </select>
        {t.data && (
          <>
            {t.data.subject && <b>{t.data.subject}</b>}
            <div className="pre soft small" style={{ maxHeight: 260, overflow: 'auto' }}>{t.data.body}</div>
            <div className="row wrap">
              {lead.email && t.data.subject && (
                <a className="btn sm primary" href={`mailto:${lead.email}?subject=${encodeURIComponent(t.data.subject)}&body=${encodeURIComponent(t.data.body)}`}>
                  <Send size={14} /> Otwórz w poczcie
                </a>
              )}
              <button className="btn sm" onClick={() => { copyText((t.data!.subject ? t.data!.subject + '\n\n' : '') + t.data!.body); toast('Skopiowano'); }}><Copy size={14} /> Kopiuj</button>
              {t.data.subject && <button className="btn sm" onClick={() => logged.mutate(undefined)} disabled={logged.isPending}>Zapisz jako wysłany</button>}
            </div>
            {/\[[^\]]+\]/.test(t.data.body) && <div className="hint">Uzupełnij pozostałe [pola] przed wysłaniem.</div>}
          </>
        )}
      </div>
    </details>
  );
}

const FIELDS: [keyof Lead, string][] = [
  ['person', 'Osoba'], ['phone', 'Telefon'], ['email', 'E-mail'], ['web', 'Strona'], ['city', 'Miasto'],
  ['industry', 'Branża'], ['extra', 'Inne kontakty'], ['source', 'Źródło'],
];

function About({ lead }: { lead: Lead }) {
  const nav = useNavigate();
  const [edit, setEdit] = useState(false);
  const pick = (l: Lead) => ({ company: l.company, industry: l.industry, city: l.city, phone: l.phone, email: l.email,
    web: l.web, person: l.person, extra: l.extra, source: l.source });
  const [d, setD] = useState(pick(lead));
  useEffect(() => setD(pick(lead)), [lead]);
  const save = useAction(() => api.updateLead(lead.id, d), { ok: 'Zapisano', onDone: () => setEdit(false) });
  const del = useAction(() => api.deleteLead(lead.id), { ok: 'Usunięto', onDone: () => nav('/firmy') });
  const val = (k: keyof Lead) => {
    const v = String(lead[k] || '');
    if (!v) return <span className="faint">—</span>;
    if (k === 'phone') return <a href={telHref(v)}>{v}</a>;
    if (k === 'email') return <a href={`mailto:${v}`}>{v}</a>;
    if (k === 'web') return <a href={v} target="_blank" rel="noreferrer">{v.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a>;
    return v;
  };
  return (
    <section className="card" style={{ order: 7 }}>
      <div className="card-head"><h2>Informacje</h2><button className="btn sm ghost" onClick={() => setEdit(true)}><Pencil size={14} /> Edytuj</button></div>
      <dl className="props" style={{ margin: '0 0 12px' }}>
        {FIELDS.map(([k, label]) => <div key={k} className="prop"><dt>{label}</dt><dd>{val(k)}</dd></div>)}
      </dl>
      <Modal open={edit} onClose={() => { setEdit(false); setD(pick(lead)); }} title="Edytuj firmę" wide
        footer={<>
          <button className="btn ghost danger" style={{ marginRight: 'auto' }}
            onClick={() => confirm(`Usunąć ${lead.company} razem z całą historią? Tego nie da się cofnąć.`) && del.mutate(undefined)}><Trash2 size={15} /> Usuń firmę</button>
          <button className="btn" onClick={() => { setEdit(false); setD(pick(lead)); }}>Anuluj</button>
          <button className="btn primary" onClick={() => save.mutate(undefined)} disabled={save.isPending}>Zapisz</button>
        </>}>
        <div className="fields">
          <label className="field wide">Nazwa firmy<input type="text" value={d.company} onChange={(e) => setD({ ...d, company: e.target.value })} /></label>
          {FIELDS.map(([k, label]) => (
            <label key={k} className={`field ${k === 'extra' ? 'wide' : ''}`}>{label}
              <input type={k === 'phone' ? 'tel' : k === 'email' ? 'email' : 'text'} value={(d as Record<string, string>)[k]}
                onChange={(e) => setD({ ...d, [k]: e.target.value })} />
            </label>
          ))}
        </div>
      </Modal>
    </section>
  );
}
