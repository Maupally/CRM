import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../api';
import { ErrorBox, Loading, Seg, TYPE_ICON, useToday, weekdayName } from '../components/ui';
import { addDays, shortDate, startOfWeek } from '../../shared/domain';

export function CalendarPage() {
  const today = useToday();
  const [start, setStart] = useState(() => startOfWeek(today));
  const [weeks, setWeeks] = useState<'1' | '2'>('1');
  const [showDone, setShowDone] = useState(true);
  const n = Number(weeks);
  const end = addDays(start, 7 * n - 1);
  const q = useQuery({ queryKey: ['agenda', start, end], queryFn: () => api.agenda(start, end) });
  const days = Array.from({ length: 7 * n }, (_, i) => addDays(start, i));

  return (
    <>
      <div className="page-head">
        <div><h1>Kalendarz</h1><div className="sub">{shortDate(start)} – {shortDate(end)}.{end.slice(0, 4)}</div></div>
        <span className="spacer" />
        <label className="row small soft"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> pokaż zrobione</label>
        <Seg value={weeks} options={['1', '2'] as const} onChange={setWeeks} labels={{ '1': 'Tydzień', '2': '2 tygodnie' }} />
        <div className="row">
          <button className="btn icon" onClick={() => setStart(addDays(start, -7))} aria-label="Poprzedni"><ChevronLeft size={18} /></button>
          <button className="btn" onClick={() => setStart(startOfWeek(today))}>Dziś</button>
          <button className="btn icon" onClick={() => setStart(addDays(start, 7))} aria-label="Następny"><ChevronRight size={18} /></button>
        </div>
      </div>

      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : (
        <div className="card" style={{ overflow: 'hidden' }}>
          {Array.from({ length: n }, (_, w) => (
            <div key={w} className="week" style={w ? { borderTop: '1px solid var(--line-strong)' } : undefined}>
              {days.slice(w * 7, w * 7 + 7).map((d) => {
                const acts = q.data!.activities.filter((a) => a.date === d && (showDone || a.result === 'planned'));
                const evs = q.data!.events.filter((e) => e.date === d);
                const tks = q.data!.tasks.filter((t) => t.due === d && (showDone || t.status !== 'done'));
                const wd = weekdayName(d);
                return (
                  <div key={d} className={`day ${d === today ? 'today' : ''} ${wd === 'sob.' || wd === 'niedz.' ? 'weekend' : ''}`}>
                    <div className="day-head"><span className="dn">{wd}</span><span className="dd">{d.slice(8)}</span>
                      {acts.length > 0 && <span className="faint small" style={{ marginLeft: 'auto' }}>{acts.length}</span>}</div>
                    {evs.map((e) => (
                      <Link key={e.id} to={`/wydarzenia/${e.id}`} className="ev event">
                        <span className="t">{e.title}</span><span className="s">{[e.time, e.location].filter(Boolean).join(' · ')}</span>
                      </Link>
                    ))}
                    {acts.map((a) => {
                      const cls = a.result === 'planned' ? (a.date < today ? 'late' : 'planned') : a.result === 'no answer' ? 'noans' : 'done';
                      const I = TYPE_ICON[a.type];
                      return (
                        <Link key={a.id} to={`/firmy/${a.leadId}`} className={`ev ${cls}`} title={a.note}>
                          <span className="t"><I size={11} style={{ verticalAlign: -1, marginRight: 4 }} />{a.company}</span>
                          {a.note && <span className="s">{a.note}</span>}
                        </Link>
                      );
                    })}
                    {tks.map((t) => (
                      <Link key={t.id} to={`/wydarzenia/${t.eventId}`} className="ev task" title={t.eventTitle}>
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
      <div className="legend" style={{ marginTop: 14 }}>
        <span><i style={{ background: 'var(--accent)' }} />zaplanowane</span>
        <span><i style={{ background: 'var(--bad)' }} />po terminie</span>
        <span><i style={{ background: 'var(--ok)' }} />zrobione</span>
        <span><i style={{ background: 'var(--warn)' }} />nie odebrał</span>
        <span><i style={{ background: 'var(--pill)' }} />wydarzenie</span>
      </div>
    </>
  );
}
