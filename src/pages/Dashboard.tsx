import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlarmClock, CalendarCheck, CheckCircle2, Flame, Handshake, PhoneCall, PartyPopper, ArrowRight, Sparkles,
} from 'lucide-react';
import { api, type OpenItem } from '../api';
import { CompleteDialog } from '../components/ActivityForms';
import { TaskRow } from '../components/TaskRow';
import {
  Avatar, DueTag, Empty, ErrorBox, Loading, Prio, STAGE_COLOR, StatTile, relDay, stageLabel, telHref, useAction, useConfig,
  weekdayName,
} from '../components/ui';
import { STAGES, shortDate, type Stage } from '../../shared/domain';

export function DashboardPage() {
  const q = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard });
  const cfg = useConfig();
  const [open, setOpen] = useState<OpenItem | null>(null);
  const toggle = useAction((id: string) => api.toggleTask(id));

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const t = d.today;
  const todo = [...d.overdue, ...d.due];
  const inPlay = d.pipeline['contacting'] + d.pipeline['scheduled visit'] + d.pipeline['negotiation'];
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Dzień dobry' : hour < 18 ? 'Cześć' : 'Dobry wieczór';
  const maxStage = Math.max(1, ...STAGES.filter((s) => s !== 'new').map((s) => d.pipeline[s]));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{weekdayName(t)} {shortDate(t)}</div>
          <h1 style={{ marginTop: 6 }}>{hello}, {cfg.data?.owner || 'Martin'}</h1>
          <div className="sub">
            {todo.length ? <>Na dziś masz <b>{todo.length}</b> {todo.length === 1 ? 'zadanie' : 'zadań'}{d.overdue.length ? <>, w tym <b style={{ color: 'var(--bad)' }}>{d.overdue.length} zaległych</b></> : null}.</>
              : 'Wszystko na dziś zrobione.'}
          </div>
        </div>
      </div>

      {Object.values(d.pipeline).every((n) => !n) && (
        <section className="card pad row wrap" style={{ marginBottom: 18, background: 'var(--tint)' }}>
          <div className="grow"><h2>Baza jest pusta</h2><div className="soft">Wgraj swój arkusz (.xlsx) — firmy, historia, playbook i wydarzenia przejdą w całości.</div></div>
          <Link to="/ustawienia?tab=dane" className="btn primary">Importuj arkusz</Link>
        </section>
      )}

      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <StatTile label="Zaległe" value={d.overdue.length} icon={AlarmClock} tone={d.overdue.length ? 'red' : ''} to="/zadania?widok=zalegle" hint="po terminie" />
        <StatTile label="Na dziś" value={d.due.length} icon={CalendarCheck} tone="amber" to="/zadania" hint={`+${d.upcoming.length} w tym tygodniu`} />
        <StatTile label="Zrobione dziś" value={d.doneToday.activities} icon={CheckCircle2} tone="green"
          hint={`${d.doneWeek.activities} w 7 dni · ${d.doneWeek.companies} firm`} />
        <StatTile label="W grze" value={inPlay} icon={Flame} tone="violet" to="/lejek" hint={`${d.pipeline['scheduled visit']} wizyt · ${d.pipeline['negotiation']} negocjacji`} />
        <StatTile label="Partnerzy" value={d.pipeline['active']} icon={Handshake} to="/firmy?widok=partnerzy" hint="aktywne współprace" />
      </div>

      <div className="grid main-side">
        <div className="col loose" style={{ gap: 18 }}>
          <section className="card">
            <div className="card-head"><h2>Mój dzień</h2><Link to="/zadania" className="btn ghost sm">Wszystkie zadania <ArrowRight size={14} /></Link></div>
            {d.overdue.length > 0 && <div className="group-label red">Zaległe · {d.overdue.length}</div>}
            <ul className="list">{d.overdue.slice(0, 8).map((a) => <TaskRow key={a.id} a={a} today={t} onComplete={setOpen} />)}</ul>
            {d.overdue.length > 8 && <Link to="/zadania?widok=zalegle" className="li soft small">… i {d.overdue.length - 8} więcej zaległych</Link>}
            {d.due.length > 0 && <div className="group-label">Dziś · {d.due.length}</div>}
            <ul className="list">{d.due.map((a) => <TaskRow key={a.id} a={a} today={t} onComplete={setOpen} showDate={false} />)}</ul>
            {!todo.length && <Empty icon={Sparkles}>Nic na dziś. Weź kogoś z kolejki telefonów →</Empty>}
            {d.upcoming.length > 0 && (
              <>
                <div className="group-label">Najbliższe dni</div>
                <ul className="list">
                  {d.upcoming.slice(0, 5).map((a) => (
                    <li key={a.id} className="li">
                      <span className="soft small nowrap" style={{ width: 84 }}>{relDay(a.date, t)}</span>
                      <Link to={`/firmy/${a.leadId}`} className="title trunc grow">{a.company}</Link>
                      <span className="meta trunc hide-sm" style={{ maxWidth: 260 }}>{a.note}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="card">
            <div className="card-head"><h2>Lejek</h2><Link to="/lejek" className="btn ghost sm">Tablica <ArrowRight size={14} /></Link></div>
            <div className="pad" style={{ paddingTop: 4 }}>
              <div className="funnel">
                {STAGES.map((s) => (
                  <Link key={s} to={`/firmy?etap=${encodeURIComponent(s)}`}>
                    <span className="soft">{stageLabel(s)}</span>
                    <div className="track"><div className="fill" style={{ width: `${Math.min(100, (d.pipeline[s] / maxStage) * 100)}%`, background: STAGE_COLOR[s] }} /></div>
                    <b>{d.pipeline[s]}</b>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </div>

        <div className="col" style={{ gap: 18 }}>
          <section className="card">
            <div className="card-head"><PhoneCall size={17} className="soft" /><h2>Kolejka telefonów</h2><Link to="/firmy?widok=kolejka" className="btn ghost sm">Więcej</Link></div>
            <ul className="list">
              {d.queue.slice(0, 8).map((l) => (
                <li key={l.id} className="li">
                  <Avatar name={l.company} size="sm" />
                  <div className="grow">
                    <Link to={`/firmy/${l.id}`} className="title trunc" style={{ display: 'block' }}>{l.company}</Link>
                    <div className="meta trunc">{[l.segment, l.city].filter(Boolean).join(' · ')}</div>
                  </div>
                  <Prio n={l.priority} />
                  {l.phone && <a className="btn sm icon" href={telHref(l.phone)} aria-label="Zadzwoń"><PhoneCall size={14} /></a>}
                </li>
              ))}
              {!d.queue.length && <Empty>Kolejka pusta.</Empty>}
            </ul>
          </section>

          <section className="card">
            <div className="card-head"><PartyPopper size={17} className="soft" /><h2>Wydarzenia</h2><Link to="/wydarzenia" className="btn ghost sm">Wszystkie</Link></div>
            <ul className="list">
              {d.events.slice(0, 3).map((e) => (
                <Link key={e.id} to={`/wydarzenia/${e.id}`} className="li">
                  <div style={{ width: 46, textAlign: 'center' }}>
                    <div className="mono" style={{ fontWeight: 600, fontSize: 16 }}>{e.date.slice(8)}</div>
                    <div className="eyebrow" style={{ color: 'var(--faint)' }}>{weekdayName(e.date)}</div>
                  </div>
                  <div className="grow"><div className="title trunc">{e.title}</div><div className="meta trunc">{[e.time, e.location].filter(Boolean).join(' · ')}</div></div>
                </Link>
              ))}
              {!d.events.length && <Empty>Brak wydarzeń w ciągu 30 dni.</Empty>}
            </ul>
            {d.tasks.length > 0 && <div className="group-label">Do przygotowania</div>}
            <ul className="list">
              {d.tasks.slice(0, 6).map((tk) => (
                <li key={tk.id} className="li">
                  <button className={`check ${tk.status === 'done' ? 'on' : ''}`} onClick={() => toggle.mutate(tk.id)} aria-label="Zrobione">✓</button>
                  <div className="grow"><div className="small">{tk.task}</div><div className="meta trunc">{tk.eventTitle}</div></div>
                  <DueTag date={tk.due} today={t} />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <CompleteDialog activity={open} stage={(open?.stage || 'new') as Stage} company={open?.company} onClose={() => setOpen(null)} />
    </>
  );
}
