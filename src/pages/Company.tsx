import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Phone, Mail, Globe, Search, Pencil, ChevronDown, Copy, Send, Trash2, Check, User,
  Sparkles, AlertTriangle,
} from 'lucide-react';
import { api } from '../api';
import { CompleteDialog, DisqualifyDialog } from '../components/ActivityForms';
import { openAssistant } from '../components/Assistant';
import { MonthCalendar, monthOf, type CalItem } from '../components/MonthCalendar';
import {
  Avatar, DueTag, Empty, ErrorBox, Loading, Modal, Prio, ResultTag, StagePill, TypeIcon, copyText, relDay,
  stageLabel, telHref, typeLabel, useAction, useConfig, useToast, useToday, weekdayName,
} from '../components/ui';
import { STAGES, STAGE_INFO, TYPES, normPhone, shortDate, type Activity, type Lead, type Segment } from '../../shared/domain';

type Sheet = null | { mail: true } | { edit: true };

export function CompanyPage() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['lead', id], queryFn: () => api.lead(id) });
  const today = useToday();
  const [completing, setCompleting] = useState<Activity | null>(null);
  const [dq, setDq] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const stage = useAction((s: string) => api.setStage(id, s), { ok: (c) => `Etap: ${stageLabel(c.lead.stage)}` });

  useEffect(() => { if (q.data) document.title = `${q.data.lead.company} · Opal5`; return () => { document.title = 'Opal5'; }; }, [q.data]);

  if (q.isLoading) return <Loading />;
  if (q.error) return <><Link to="/firmy" className="btn ghost sm"><ArrowLeft size={15} /> Firmy</Link><div style={{ marginTop: 12 }}><ErrorBox error={q.error} /></div></>;
  const { lead, activities, playbook, events } = q.data!;
  const planned = activities.filter((a) => a.result === 'planned');
  const phone = normPhone(lead.phone) || lead.phone;
  const curIdx = STAGES.indexOf(lead.stage);
  const closed = lead.stage === 'active' || lead.stage === 'disqualified';

  return (
    <>
      <Link to="/firmy" className="btn ghost sm" style={{ marginBottom: 10 }}
        onClick={(e) => { if (history.length > 1) { e.preventDefault(); history.back(); } }}>
        <ArrowLeft size={15} /> Wróć
      </Link>

      {/* ---------------------------------------------------- one header: who they are + how to reach them */}
      <section className="card company-head">
        <div className="row top" style={{ gap: 16 }}>
          <Avatar name={lead.company} size="lg" />
          <div className="grow">
            <div className="row wrap" style={{ gap: 8 }}>
              <h1 className="company-name">{lead.company}</h1>
              <StagePill stage={lead.stage} />
              <Prio n={lead.priority} />
            </div>
            <div className="soft small" style={{ marginTop: 4 }}>
              {[lead.segment, lead.industry, lead.city].filter(Boolean).join(' · ')}
            </div>
            <div className="contact-line">
              {lead.person && <span><User size={14} /> {lead.person}</span>}
              {phone && <a href={telHref(phone)}><Phone size={14} /> {phone}</a>}
              {lead.email && <a href={`mailto:${lead.email}`}><Mail size={14} /> {lead.email}</a>}
              {lead.web && <a href={lead.web} target="_blank" rel="noreferrer"><Globe size={14} /> {lead.web.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a>}
              {!phone && !lead.email && (
                <a href={`https://www.google.com/search?q=${encodeURIComponent(`${lead.company} ${lead.city} kontakt`)}`} target="_blank" rel="noreferrer">
                  <Search size={14} /> Brak kontaktu — szukaj w Google
                </a>
              )}
              {lead.extra && <span className="soft">+ {lead.extra}</span>}
            </div>
          </div>
          <button className="btn ghost sm" onClick={() => setSheet({ edit: true })}><Pencil size={14} /><span className="hide-sm">Edytuj</span></button>
        </div>

        <div className="path" role="group" aria-label="Etap">
          {STAGES.map((s, i) => (
            <button key={s} title={STAGE_INFO[s]} disabled={stage.isPending}
              className={s === lead.stage ? `cur ${s === 'disqualified' ? 'lost' : s === 'active' ? 'won' : ''}` : i < curIdx && lead.stage !== 'disqualified' ? 'past' : ''}
              onClick={() => s === lead.stage ? null : s === 'disqualified' ? setDq(true) : stage.mutate(s)}>
              {stageLabel(s)}
            </button>
          ))}
        </div>

        <div className="head-actions">
          {phone ? <a className="btn primary" href={telHref(phone)}><Phone size={16} /> Zadzwoń</a> : null}
          <button className="btn" onClick={() => setSheet({ mail: true })}><Mail size={16} /> Mail</button>
          <button className="btn ghost" onClick={() => openAssistant()}><Sparkles size={16} /> Asystent</button>
        </div>
      </section>

      <div className="grid company-body">
        {/* ---------------------------------------------------- left: what's next and what happened */}
        <div className="col" style={{ gap: 18 }}>
          <section className="card">
            <div className="card-head"><h2>Następny krok</h2></div>
            {planned.length ? (
              <ul className="list">
                {planned.map((a) => (
                  <li key={a.id} className="li">
                    <TypeIcon type={a.type} />
                    <div className="grow">
                      <div className="row" style={{ gap: 8 }}><b>{typeLabel(a.type)}</b><DueTag date={a.date} today={today} /></div>
                      {a.note && <div className="meta">{a.note}</div>}
                    </div>
                    <button className="btn sm primary" onClick={() => setCompleting(a)}><Check size={14} /> Zrobione</button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="pad" style={{ paddingTop: 0 }}>
                {closed ? <span className="soft small">Nic nie zaplanowano.</span> : (
                  <div className="row wrap" style={{ gap: 10 }}>
                    <span className="small row" style={{ color: 'var(--bad)' }}><AlertTriangle size={14} /> Brak następnego kroku — powiedz Claude'owi, co dalej.</span>
                  </div>
                )}
              </div>
            )}
          </section>

          <History activities={activities} lead={lead} today={today} />
        </div>

        {/* ---------------------------------------------------- right: calendar, pitch, notes */}
        <div className="col" style={{ gap: 18 }}>
          <CompanyCalendar activities={activities} events={events} today={today} />
          <Pitch lead={lead} playbook={playbook} />
          <Notes lead={lead} />
        </div>
      </div>

      <MailSheet lead={lead} open={!!sheet && 'mail' in sheet} onClose={() => setSheet(null)} />
      <EditSheet lead={lead} open={!!sheet && 'edit' in sheet} onClose={() => setSheet(null)} />
      <CompleteDialog activity={completing} stage={lead.stage} company={lead.company} onClose={() => setCompleting(null)} />
      <DisqualifyDialog lead={dq ? lead : null} onClose={() => setDq(false)} />
    </>
  );
}

/* ------------------------------------------------------------ history */

function History({ activities, lead, today }: { activities: Activity[]; lead: Lead; today: string }) {
  const [filter, setFilter] = useState('');
  const past = activities.filter((a) => a.result !== 'planned');
  const shown = past.filter((a) => !filter || a.type === filter);
  const types = TYPES.filter((t) => past.some((a) => a.type === t));
  return (
    <section className="card">
      <div className="card-head">
        <h2>Historia</h2>
        <span className="soft small hide-sm">{lead.lastContact ? `ostatni kontakt ${relDay(lead.lastContact, today)}` : 'bez kontaktu'}</span>
        {types.length > 1 && (
          <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 'auto', height: 32, fontSize: 13 }}>
            <option value="">Wszystko ({past.length})</option>
            {types.map((t) => <option key={t} value={t}>{typeLabel(t)} ({past.filter((a) => a.type === t).length})</option>)}
          </select>
        )}
      </div>
      <ul className="timeline">
        {shown.map((a) => <TimelineRow key={a.id} a={a} today={today} />)}
        {!shown.length && <Empty>Jeszcze nic się nie wydarzyło.</Empty>}
      </ul>
    </section>
  );
}

/** A history entry: the first line always shows; a mail or a long note opens to its full text. */
function NoteBody({ note, mail }: { note: string; mail: boolean }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const nl = note.indexOf('\n');
  const head = nl > -1 ? note.slice(0, nl) : note;
  const rest = nl > -1 ? note.slice(nl + 1).trim() : '';
  const long = !!rest || head.length > 180;
  if (!long) return <div className="note">{note}</div>;
  return (
    <div className="note-wrap">
      <button className={`note-head plain ${open ? 'open' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={open ? '' : 'clamp2'}>{mail ? <b>{head.replace(/^Mail(\s*\([^)]*\))?:\s*/, '')}</b> : head}</span>
        <ChevronDown size={15} className="faint chev" />
      </button>
      {open && (
        <>
          {rest && <div className="note">{rest}</div>}
          <div className="row" style={{ gap: 4, marginTop: 4 }}>
            <button className="btn sm ghost" onClick={() => { copyText(mail ? rest || head : note); toast('Skopiowano'); }}><Copy size={13} /> Kopiuj{mail ? ' treść' : ''}</button>
          </div>
        </>
      )}
    </div>
  );
}

function TimelineRow({ a, today }: { a: Activity; today: string }) {
  const [edit, setEdit] = useState(false);
  const [note, setNote] = useState(a.note);
  const [date, setDate] = useState(a.date);
  const [type, setType] = useState<string>(a.type);
  const save = useAction(() => api.updateActivity(a.id, { note, date, type }), { ok: 'Zapisano', onDone: () => setEdit(false) });
  const drop = useAction(() => api.deleteActivity(a.id), { ok: 'Usunięto' });

  return (
    <li className={`tl ${a.result === 'cancelled' ? 'cancelled' : ''}`}>
      <TypeIcon type={a.type} />
      <div className="body" style={{ minWidth: 0 }}>
        {edit ? (
          <div className="col tight">
            <div className="row wrap">
              <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: 140 }}>
                {TYPES.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
              </select>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 170 }} max={today} />
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
              <span>{relDay(a.date, today)}</span>
              {a.stageTo && <span className="row" style={{ gap: 4 }}><StagePill stage={a.stageFrom} /> → <StagePill stage={a.stageTo} /></span>}
            </div>
            {a.note && <NoteBody note={a.note} mail={a.type === 'Email'} />}
          </>
        )}
      </div>
      <div className="acts">
        {!edit && <button className="btn sm ghost icon" title="Edytuj" aria-label="Edytuj" onClick={() => setEdit(true)}><Pencil size={14} /></button>}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------ calendar of this company */

function CompanyCalendar({ activities, events, today }: {
  activities: Activity[]; events: { id: string; title: string; date: string }[]; today: string;
}) {
  const next = activities.find((a) => a.result === 'planned');
  const [month, setMonth] = useState(() => monthOf(next?.date && next.date >= today ? next.date : today));
  const [day, setDay] = useState<string | null>(null);
  const items: CalItem[] = [
    ...activities.filter((a) => a.result !== 'cancelled').map((a): CalItem => ({
      date: a.date, label: typeLabel(a.type),
      kind: a.result === 'planned' ? (a.date < today ? 'late' : 'planned') : a.result === 'no answer' ? 'noans' : 'done',
    })),
    ...events.map((e): CalItem => ({ date: e.date, kind: 'event', label: e.title })),
  ];
  const onDay = activities.filter((a) => a.date === day && a.result !== 'cancelled');
  const evDay = events.filter((e) => e.date === day);

  return (
    <section className="card pad">
      <MonthCalendar month={month} onMonth={setMonth} items={items} today={today} selected={day || undefined}
        onDay={(d) => setDay(d === day ? null : d)} />
      {day && (
        <div className="col tight" style={{ marginTop: 12 }}>
          <div className="row between"><b className="small">{weekdayName(day)} {shortDate(day)}</b>
</div>
          {onDay.map((a) => <div key={a.id} className="small"><b>{typeLabel(a.type)}</b> · <ResultTag result={a.result} />{a.note ? ` — ${a.note}` : ''}</div>)}
          {evDay.map((e) => <Link key={e.id} to={`/wydarzenia/${e.id}`} className="small" style={{ color: 'var(--accent)' }}>{e.title}</Link>)}
          {!onDay.length && !evDay.length && <div className="small faint">Nic tego dnia.</div>}
        </div>
      )}
      <div className="legend" style={{ marginTop: 12 }}>
        <span><i style={{ background: 'var(--accent)' }} />plan</span>
        <span><i style={{ background: 'var(--ok)' }} />zrobione</span>
        <span><i style={{ background: 'var(--warn)' }} />nie odebrał</span>
        <span><i style={{ background: 'var(--bad)' }} />po terminie</span>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ pitch & notes */

function Pitch({ lead, playbook }: { lead: Lead; playbook: Segment | null }) {
  if (!playbook || !(playbook.opening || playbook.hook || playbook.why)) {
    return (
      <section className="card pad soft small">
        Brak pitchu dla segmentu <b>{lead.segment}</b>.{' '}
        {lead.segment === 'NIEZNANA' ? 'Wybierz segment w „Edytuj” — pitch pojawi się sam.' : <Link to="/ustawienia" style={{ color: 'var(--accent)' }}>Uzupełnij Playbook →</Link>}
      </section>
    );
  }
  const items: [string, string][] = [
    ['Otwarcie', playbook.opening], ['Hook', playbook.hook], ['Oferta', playbook.offer], ['CTA', playbook.cta],
    ['Obiekcje', playbook.objections], ['Do kogo', playbook.who], ['Cel', playbook.goal],
  ];
  return (
    <details className="card fold">
      <summary className="col tight" style={{ alignItems: 'stretch' }}>
        <span className="row"><span className="eyebrow">Pitch · {playbook.name}</span><ChevronDown size={16} className="chev" /></span>
        {playbook.why && <span className="soft small" style={{ fontWeight: 400 }}>{playbook.why}</span>}
      </summary>
      <dl className="pitch" style={{ margin: 0, padding: '0 20px 20px' }}>
        {items.filter(([, v]) => v).map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{k === 'Obiekcje' ? v.split(/\s*\|\s*/).join('\n\n') : v}</dd></div>
        ))}
        <button className="btn sm" style={{ marginTop: 14 }} onClick={() => openAssistant('Przygotuj mnie do rozmowy z tą firmą — jak zagadać?')}>
          <Sparkles size={14} /> Dopasuj do tej firmy
        </button>
      </dl>
    </details>
  );
}

function Notes({ lead }: { lead: Lead }) {
  const [v, setV] = useState(lead.notes);
  useEffect(() => setV(lead.notes), [lead.notes]);
  const save = useAction(() => api.updateLead(lead.id, { notes: v }), { ok: 'Notatka zapisana' });
  const dirty = v !== lead.notes;
  return (
    <section className="card">
      <div className="card-head"><h2>Notatki</h2>
        {dirty && <button className="btn sm primary" onClick={() => save.mutate(undefined)} disabled={save.isPending}>Zapisz</button>}
      </div>
      <div style={{ padding: '0 20px 20px' }}>
        <textarea rows={4} value={v} onChange={(e) => setV(e.target.value)}
          placeholder="Stałe fakty: kto decyduje, na czym im zależy. Przebieg rozmów trafia do historii."
          onBlur={() => dirty && save.mutate(undefined)} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ mail and edit sheets */

function MailSheet({ lead, open, onClose }: { lead: Lead; open: boolean; onClose: () => void }) {
  const cfg = useConfig();
  const toast = useToast();
  const [code, setCode] = useState('');
  const t = useQuery({ queryKey: ['tpl', lead.id, code], queryFn: () => api.renderTemplate(lead.id, code), enabled: open && !!code });
  const logged = useAction(() => api.log(lead.id, { type: 'Email', result: 'done', note: `Mail: ${t.data?.subject || code}` }),
    { ok: 'Zapisano w historii', onDone: onClose });
  const fits = (segments: string) => /wszystkie|telefon/i.test(segments) || segments.split(/\s*,\s*/).includes(lead.segment);
  const sorted = [...(cfg.data?.templates || [])].sort((a, b) => Number(fits(b.segments)) - Number(fits(a.segments)));

  return (
    <Modal open={open} onClose={onClose} title={`Mail · ${lead.company}`} wide>
      <select value={code} onChange={(e) => setCode(e.target.value)}>
        <option value="">Wybierz szablon…</option>
        {sorted.map((x) => <option key={x.code} value={x.code}>{fits(x.segments) ? '★ ' : ''}{x.code} · {x.kind}</option>)}
      </select>
      {t.data && (
        <>
          {t.data.subject && <b>{t.data.subject}</b>}
          <div className="pre soft small" style={{ maxHeight: 320, overflow: 'auto' }}>{t.data.body}</div>
          {/\[[^\]]+\]/.test(t.data.body) && <div className="hint">Uzupełnij pozostałe [pola] przed wysłaniem.</div>}
          <div className="row wrap">
            {lead.email && t.data.subject && (
              <a className="btn primary" href={`mailto:${lead.email}?subject=${encodeURIComponent(t.data.subject)}&body=${encodeURIComponent(t.data.body)}`}>
                <Send size={15} /> Otwórz w poczcie
              </a>
            )}
            <button className="btn" onClick={() => { copyText((t.data!.subject ? t.data!.subject + '\n\n' : '') + t.data!.body); toast('Skopiowano'); }}><Copy size={15} /> Kopiuj</button>
            {t.data.subject && <button className="btn" onClick={() => logged.mutate(undefined)} disabled={logged.isPending}><Check size={15} /> Wysłany — zapisz</button>}
          </div>
        </>
      )}
      <div className="hint">Mail dopasowany do rozmowy? Powiedz asystentowi: „wyślij im podsumowanie”.</div>
    </Modal>
  );
}

const FIELDS: [keyof Lead, string][] = [
  ['person', 'Osoba'], ['phone', 'Telefon'], ['email', 'E-mail'], ['web', 'Strona'], ['city', 'Miasto'],
  ['industry', 'Branża'], ['extra', 'Inne kontakty'], ['source', 'Źródło'],
];

function EditSheet({ lead, open, onClose }: { lead: Lead; open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const cfg = useConfig();
  const pick = (l: Lead) => ({ company: l.company, segment: l.segment, industry: l.industry, city: l.city, phone: l.phone,
    email: l.email, web: l.web, person: l.person, extra: l.extra, source: l.source });
  const [d, setD] = useState(pick(lead));
  useEffect(() => { if (open) setD(pick(lead)); }, [open, lead]);
  const save = useAction(() => api.updateLead(lead.id, d), { ok: 'Zapisano', onDone: onClose });
  const del = useAction(() => api.deleteLead(lead.id), { ok: 'Usunięto', onDone: () => nav('/firmy') });
  return (
    <Modal open={open} onClose={onClose} title="Edytuj firmę" wide
      footer={<>
        <button className="btn ghost danger" style={{ marginRight: 'auto' }}
          onClick={() => confirm(`Usunąć ${lead.company} razem z całą historią? Tego nie da się cofnąć.`) && del.mutate(undefined)}><Trash2 size={15} /> Usuń</button>
        <button className="btn" onClick={onClose}>Anuluj</button>
        <button className="btn primary" onClick={() => save.mutate(undefined)} disabled={save.isPending}>Zapisz</button>
      </>}>
      <div className="fields">
        <label className="field wide">Nazwa firmy<input type="text" value={d.company} onChange={(e) => setD({ ...d, company: e.target.value })} /></label>
        <label className="field">Segment
          <select value={d.segment} onChange={(e) => setD({ ...d, segment: e.target.value })}>
            {!cfg.data?.segments.some((s) => s.name === d.segment) && <option>{d.segment}</option>}
            {cfg.data?.segments.map((s) => <option key={s.name}>{s.name}</option>)}
          </select>
        </label>
        {FIELDS.map(([k, label]) => (
          <label key={k} className={`field ${k === 'extra' ? 'wide' : ''}`}>{label}
            <input type={k === 'phone' ? 'tel' : k === 'email' ? 'email' : 'text'} value={(d as Record<string, string>)[k]}
              onChange={(e) => setD({ ...d, [k]: e.target.value })} />
          </label>
        ))}
      </div>
      <div className="hint mono">{lead.id}</div>
    </Modal>
  );
}
