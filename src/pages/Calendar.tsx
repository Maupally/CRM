import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.ts';
import { ErrorBox, Loading, typeIcon, useToday, weekdayName } from '../components/ui.tsx';
import { addDays, shortDate, startOfWeek } from '../../shared/domain.ts';

export function CalendarPage() {
  const today = useToday();
  const [start, setStart] = useState(() => startOfWeek(today));
  const [weeks, setWeeks] = useState(1);
  const [showDone, setShowDone] = useState(true);
  const end = addDays(start, 7 * weeks - 1);
  const q = useQuery({ queryKey: ['agenda', start, end], queryFn: () => api.agenda(start, end) });

  const days = Array.from({ length: 7 * weeks }, (_, i) => addDays(start, i));

  return (
    <>
      <div className="page-head">
        <h1>Calendar</h1>
        <span className="muted">{shortDate(start)} – {shortDate(end)}.{end.slice(0, 4)}</span>
        <span className="spacer" />
        <label className="row hint"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> show finished</label>
        <div className="seg">
          <button className={weeks === 1 ? 'on' : ''} onClick={() => setWeeks(1)}>Week</button>
          <button className={weeks === 2 ? 'on' : ''} onClick={() => setWeeks(2)}>2 weeks</button>
        </div>
        <button className="btn" onClick={() => setStart(addDays(start, -7))}>←</button>
        <button className="btn" onClick={() => setStart(startOfWeek(today))}>This week</button>
        <button className="btn" onClick={() => setStart(addDays(start, 7))}>→</button>
      </div>

      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : (
        <div className="card">
          {Array.from({ length: weeks }, (_, w) => (
            <div key={w} className="week" style={w ? { borderTop: '2px solid var(--line-strong)' } : undefined}>
              {days.slice(w * 7, w * 7 + 7).map((d) => {
                const acts = q.data!.activities.filter((a) => a.date === d && (showDone || a.result === 'planned'));
                const evs = q.data!.events.filter((e) => e.date === d);
                const tks = q.data!.tasks.filter((t) => t.due === d && (showDone || t.status !== 'done'));
                const wd = weekdayName(d);
                return (
                  <div key={d} className={`day ${d === today ? 'is-today' : ''} ${wd === 'Sat' || wd === 'Sun' ? 'weekend' : ''}`}>
                    <div className="day-head"><span>{wd} {shortDate(d)}</span>
                      {acts.length > 0 && <span className="faint">{acts.length}</span>}</div>
                    {evs.map((e) => (
                      <Link key={e.id} to={`/events/${e.id}`} className="ev event">
                        <span className="t">★ {e.title}</span><span className="s">{[e.time, e.location].filter(Boolean).join(' · ')}</span>
                      </Link>
                    ))}
                    {acts.map((a) => {
                      const cls = a.result === 'planned' ? (a.date < today ? 'overdue' : 'planned')
                        : a.result === 'no answer' ? 'noans' : 'done';
                      return (
                        <Link key={a.id} to={`/leads/${a.leadId}`} className={`ev ${cls}`} title={`${a.type} · ${a.result}\n${a.note}`}>
                          <span className="t">{typeIcon(a.type)} {a.company}</span>
                          {a.note && <span className="s">{a.note}</span>}
                        </Link>
                      );
                    })}
                    {tks.map((t) => (
                      <Link key={t.id} to={`/events/${t.eventId}`} className="ev task" title={t.eventTitle}>
                        <span className={`t ${t.status === 'done' ? 'done-text' : ''}`}>☐ {t.task}</span>
                      </Link>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      <div className="legend" style={{ marginTop: 12 }}>
        <span><i style={{ background: 'var(--info)' }} />planned</span>
        <span><i style={{ background: 'var(--bad)' }} />overdue</span>
        <span><i style={{ background: 'var(--ok)' }} />done / reached</span>
        <span><i style={{ background: 'var(--warn)' }} />no answer</span>
        <span><i style={{ background: 'var(--accent)' }} />event</span>
      </div>
    </>
  );
}
