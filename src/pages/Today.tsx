import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type AgendaItem } from '../api.ts';
import { CompleteDialog } from '../components/ActivityForms.tsx';
import { DueTag, ErrorBox, Loading, Prio, relDay, typeIcon, useAction, weekdayName } from '../components/ui.tsx';
import { normPhone, shortDate, type Stage } from '../../shared/domain.ts';

export function TodayPage() {
  const q = useQuery({ queryKey: ['today'], queryFn: api.today });
  const [open, setOpen] = useState<AgendaItem | null>(null);
  const toggle = useAction((id: string) => api.toggleTask(id));

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const d = q.data!;
  const t = d.today;

  const row = (a: AgendaItem) => (
    <li key={a.id} className="item">
      <span title={a.type} style={{ width: 18, textAlign: 'center' }}>{typeIcon(a.type)}</span>
      <div className="grow">
        <div className="row wrap" style={{ gap: 6 }}>
          <Link className="title" to={`/leads/${a.leadId}`}>{a.company}</Link>
          <DueTag date={a.date} today={t} />
        </div>
        <div className="muted ellipsis" style={{ fontSize: 13 }}>{a.note}</div>
      </div>
      <div className="actions">
        {normPhone(a.phone) && <a className="btn sm" href={`tel:${normPhone(a.phone).replace(/\s/g, '')}`} title={a.phone}>☎ <span className="nowrap">{normPhone(a.phone)}</span></a>}
        <button className="btn sm primary" onClick={() => setOpen(a)}>Done…</button>
      </div>
    </li>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Today</h1>
          <div className="muted">{weekdayName(t)} {shortDate(t)} · {d.doneToday.activities} logged today across {d.doneToday.companies} companies</div>
        </div>
      </div>

      <div className="grid kpis" style={{ marginBottom: 16 }}>
        <div className={`card kpi ${d.overdue.length ? 'alert' : ''}`}>
          <div className="label">Overdue</div><div className="value">{d.overdue.length}</div>
          <div className="sub">planned before today</div>
        </div>
        <div className="card kpi"><div className="label">Due today</div><div className="value">{d.due.length}</div></div>
        <div className="card kpi"><div className="label">Next 7 days</div><div className="value">{d.upcoming.length}</div></div>
        <div className="card kpi"><div className="label">Done today</div><div className="value">{d.doneToday.activities}</div></div>
      </div>

      <div className="grid two">
        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>To do</h2><span className="muted">{d.overdue.length + d.due.length}</span></div>
            {d.overdue.length > 0 && <div className="section-label">Overdue</div>}
            <ul className="list">{d.overdue.map(row)}</ul>
            {d.due.length > 0 && <div className="section-label">Today</div>}
            <ul className="list">{d.due.map(row)}</ul>
            {!d.overdue.length && !d.due.length && <div className="empty">Nothing planned for today. Pick someone from the call queue →</div>}
          </section>

          <section className="card">
            <div className="card-head"><h2>Coming up</h2><Link className="btn sm ghost" to="/calendar">Calendar →</Link></div>
            <ul className="list">
              {d.upcoming.map((a) => (
                <li key={a.id} className="item">
                  <span className="muted nowrap" style={{ width: 84, fontSize: 12.5 }}>{relDay(a.date, t)}</span>
                  <span>{typeIcon(a.type)}</span>
                  <div className="grow ellipsis"><Link className="title" to={`/leads/${a.leadId}`}>{a.company}</Link>
                    <span className="muted"> · {a.note}</span></div>
                </li>
              ))}
              {!d.upcoming.length && <li className="empty">Nothing planned this week.</li>}
            </ul>
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>Call queue</h2><span className="muted" title="New leads with contact details and nothing planned, best first">by priority</span></div>
            <ul className="list">
              {d.queue.map((l) => (
                <li key={l.id} className="item">
                  <Prio n={l.priority} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <Link className="title ellipsis" style={{ display: 'block' }} to={`/leads/${l.id}`}>{l.company}</Link>
                    <div className="muted ellipsis" style={{ fontSize: 12.5 }}>{[l.segment, l.city].filter(Boolean).join(' · ')}</div>
                  </div>
                  {l.phone && <a className="btn sm" href={`tel:${l.phone.replace(/\s/g, '')}`}>☎</a>}
                </li>
              ))}
              {!d.queue.length && <li className="empty">Queue empty.</li>}
            </ul>
          </section>

          <section className="card">
            <div className="card-head"><h2>Event tasks</h2><Link className="btn sm ghost" to="/events">Events →</Link></div>
            <ul className="list">
              {d.tasks.map((tk) => (
                <li key={tk.id} className="item">
                  <button className={`check ${tk.status === 'done' ? 'on' : ''}`} onClick={() => toggle.mutate(tk.id)} aria-label="Done">✓</button>
                  <div className="grow">
                    <div>{tk.task}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{tk.eventTitle}</div>
                  </div>
                  <DueTag date={tk.due} today={t} />
                </li>
              ))}
              {!d.tasks.length && <li className="empty">No tasks due in the next 3 days.</li>}
            </ul>
            {d.events.length > 0 && <div className="section-label">Next events</div>}
            <ul className="list">
              {d.events.slice(0, 4).map((e) => (
                <li key={e.id} className="item">
                  <span className="muted nowrap" style={{ width: 84, fontSize: 12.5 }}>{relDay(e.date, t)}</span>
                  <Link className="title grow ellipsis" to={`/events/${e.id}`}>{e.title}</Link>
                  <span className="muted nowrap">{e.time}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <CompleteDialog activity={open} stage={(open?.stage || 'new') as Stage} company={open?.company}
        onClose={() => setOpen(null)} />
    </>
  );
}
