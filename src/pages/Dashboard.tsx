import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlarmClock, CalendarCheck, CheckCircle2, Flame, Handshake, ArrowRight, Sparkles } from 'lucide-react';
import { api, type OpenItem } from '../api';
import { CompleteDialog } from '../components/ActivityForms';
import { TaskRow } from '../components/TaskRow';
import { ProjectTaskRow, TaskDetail } from '../components/TaskDetail';
import { Empty, ErrorBox, Loading, StatTile, relDay, useConfig, weekdayName } from '../components/ui';
import { shortDate, type Stage, type Task } from '../../shared/domain';

type Item = { kind: 'act'; date: string; a: OpenItem } | { kind: 'task'; date: string; t: Task };

/**
 * One list for the day. Anything overdue is carried into today — on top, oldest first, each
 * showing how late it is — so nothing hides in a separate box. The next days follow below.
 */
export function DashboardPage() {
  const q = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard });
  const cfg = useConfig();
  const [open, setOpen] = useState<OpenItem | null>(null);
  const [task, setTask] = useState<Task | null>(null);

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const t = d.today;

  const items: Item[] = [
    ...[...d.overdue, ...d.due, ...d.upcoming].map((a) => ({ kind: 'act' as const, date: a.date, a })),
    ...d.tasks.map((x) => ({ kind: 'task' as const, date: x.due, t: x })),
  ].sort((x, y) => x.date.localeCompare(y.date));
  const late = items.filter((i) => i.date < t);
  const today = items.filter((i) => i.date === t);
  const next = items.filter((i) => i.date > t);
  const nextDays = [...new Set(next.map((i) => i.date))];

  const inPlay = d.pipeline['contacting'] + d.pipeline['scheduled visit'] + d.pipeline['negotiation'];
  const doneToday = d.doneToday.activities + (d.tasksDoneToday || 0);
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Dzień dobry' : hour < 18 ? 'Cześć' : 'Dobry wieczór';
  const todo = late.length + today.length;

  const row = (i: Item, showDate: boolean) => i.kind === 'act'
    ? <TaskRow key={`a${i.a.id}`} a={i.a} today={t} onComplete={setOpen} showDate={showDate} />
    : <ProjectTaskRow key={`t${i.t.id}`} t={i.t} today={t} onOpen={setTask} sub={i.t.eventTitle || i.t.company} />;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">{weekdayName(t)} {shortDate(t)}</div>
          <h1 style={{ marginTop: 6 }}>{hello}, {cfg.data?.owner || 'Martin'}</h1>
          <div className="sub">
            {todo ? <>Na dziś: <b>{todo}</b>{late.length ? <>, w tym <b style={{ color: 'var(--bad)' }}>{late.length} przeniesionych z poprzednich dni</b></> : null}.</>
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
        <StatTile label="Zaległe" value={late.length} icon={AlarmClock} tone={late.length ? 'red' : ''} to="/zadania?widok=zalegle" hint="po terminie" />
        <StatTile label="Na dziś" value={today.length} icon={CalendarCheck} tone="amber" to="/zadania" hint={`+${next.length} w kolejnych dniach`} />
        <StatTile label="Zrobione dziś" value={doneToday} icon={CheckCircle2} tone="green"
          hint={`${d.doneWeek.activities} kontaktów w 7 dni`} />
        <StatTile label="W grze" value={inPlay} icon={Flame} tone="violet" to="/lejek" hint={`${d.pipeline['scheduled visit']} wizyt · ${d.pipeline['negotiation']} negocjacji`} />
        <StatTile label="Partnerzy" value={d.pipeline['active']} icon={Handshake} to="/firmy?widok=partnerzy" hint="aktywne współprace" />
      </div>

      <section className="card">
        <div className="card-head"><h2>Do zrobienia</h2><Link to="/zadania" className="btn ghost sm">Wszystkie zadania <ArrowRight size={14} /></Link></div>
        <div className="group-label">Dziś · {todo}</div>
        {late.length > 0 && (
          <>
            <div className="group-label red" style={{ paddingTop: 4 }}>Przeniesione z poprzednich dni · {late.length}</div>
            <ul className="list">{late.map((i) => row(i, true))}</ul>
          </>
        )}
        {today.length > 0 && (
          <>
            {late.length > 0 && <div className="group-label" style={{ paddingTop: 4 }}>Na dziś · {today.length}</div>}
            <ul className="list">{today.map((i) => row(i, false))}</ul>
          </>
        )}
        {!todo && <Empty icon={Sparkles}>Nic na dziś.</Empty>}

        {nextDays.length > 0 && <div className="group-label" style={{ marginTop: 10 }}>Kolejne dni</div>}
        {nextDays.map((day) => (
          <div key={day}>
            <div className="group-label" style={{ paddingTop: 2, fontWeight: 500 }}>{relDay(day, t)} · {weekdayName(day)} {shortDate(day)}</div>
            <ul className="list">{next.filter((i) => i.date === day).map((i) => row(i, false))}</ul>
          </div>
        ))}
      </section>

      <TaskDetail task={task} onClose={() => setTask(null)} />
      <CompleteDialog activity={open} stage={(open?.stage || 'new') as Stage} company={open?.company} onClose={() => setOpen(null)} />
    </>
  );
}
