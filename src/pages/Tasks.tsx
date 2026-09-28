import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ListChecks } from 'lucide-react';
import { api, type OpenItem } from '../api';
import { CompleteDialog } from '../components/ActivityForms';
import { TaskRow } from '../components/TaskRow';
import { Empty, ErrorBox, Loading, ResultTag, TYPE_ICON, TypeIcon, relDay, typeLabel, useToday, weekdayName } from '../components/ui';
import { addDays, shortDate, TYPES, type Stage } from '../../shared/domain';

const VIEWS = [
  { id: 'dzis', label: 'Dziś i zaległe' },
  { id: 'zalegle', label: 'Zaległe' },
  { id: 'nadchodzace', label: 'Nadchodzące' },
  { id: 'wszystkie', label: 'Wszystkie otwarte' },
  { id: 'zrobione', label: 'Zrobione (14 dni)' },
] as const;
type View = (typeof VIEWS)[number]['id'];

export function TasksPage() {
  const today = useToday();
  const [sp, setSp] = useSearchParams();
  const view = (sp.get('widok') || 'dzis') as View;
  const [type, setType] = useState('');
  const [open, setOpen] = useState<OpenItem | null>(null);

  const openQ = useQuery({ queryKey: ['activities', 'open'], queryFn: api.openActivities });
  const doneQ = useQuery({
    queryKey: ['activities', 'done', today], queryFn: () => api.activities(addDays(today, -13), today), enabled: view === 'zrobione',
  });

  const all = openQ.data || [];
  const counts: Record<View, number> = {
    dzis: all.filter((a) => a.date <= today).length,
    zalegle: all.filter((a) => a.date < today).length,
    nadchodzace: all.filter((a) => a.date > today).length,
    wszystkie: all.length,
    zrobione: 0,
  };

  const rows = useMemo(() => {
    let r: OpenItem[] = view === 'zrobione'
      ? (doneQ.data || []).filter((a) => a.result !== 'planned' && a.type !== 'Note').reverse()
      : all.filter((a) => view === 'dzis' ? a.date <= today : view === 'zalegle' ? a.date < today
        : view === 'nadchodzace' ? a.date > today : true);
    if (type) r = r.filter((a) => a.type === type);
    return r;
  }, [all, doneQ.data, view, type, today]);

  // group by day: "Zaległe" collapses everything before today into one bucket
  const groups = useMemo(() => {
    const g = new Map<string, OpenItem[]>();
    for (const a of rows) {
      const key = view !== 'zrobione' && a.date < today ? 'late' : a.date;
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(a);
    }
    return [...g.entries()];
  }, [rows, view, today]);

  const label = (k: string) => k === 'late' ? 'Zaległe' : k === today ? 'Dziś' : k === addDays(today, 1) ? 'Jutro'
    : `${weekdayName(k)} ${shortDate(k)}`;

  return (
    <>
      <div className="page-head">
        <div><h1>Zadania</h1><div className="sub">Telefony, maile i spotkania do zrobienia — odhaczaj, a CRM sam ustawi etap i następny krok.</div></div>
      </div>
      <section className="card">
        <div className="views">
          {VIEWS.map((v) => (
            <button key={v.id} className={view === v.id ? 'on' : ''} onClick={() => setSp(v.id === 'dzis' ? {} : { widok: v.id }, { replace: true })}>
              {v.label}{v.id !== 'zrobione' && <span className="n">{counts[v.id]}</span>}
            </button>
          ))}
        </div>
        <div className="toolbar">
          <div className="chips">
            <button className={`chip ${!type ? 'on' : ''}`} onClick={() => setType('')}>Wszystkie typy</button>
            {TYPES.filter((t) => t !== 'Note').map((t) => {
              const I = TYPE_ICON[t];
              return <button key={t} className={`chip ${type === t ? 'on' : ''}`} onClick={() => setType(t)}><I size={14} /> {typeLabel(t)}</button>;
            })}
          </div>
        </div>
        <div className="divider" />
        {openQ.isLoading || (view === 'zrobione' && doneQ.isLoading) ? <Loading /> : openQ.error ? <div className="pad"><ErrorBox error={openQ.error} /></div> : (
          <>
            {groups.map(([k, items]) => (
              <div key={k}>
                <div className={`group-label ${k === 'late' ? 'red' : ''}`}>{label(k)} · {items.length}</div>
                <ul className="list">
                  {items.map((a) => view === 'zrobione' ? (
                    <li key={a.id} className="li">
                      <TypeIcon type={a.type} />
                      <div className="grow">
                        <div className="row"><Link to={`/firmy/${a.leadId}`} className="title trunc">{a.company}</Link><ResultTag result={a.result} /></div>
                        <div className="meta trunc">{a.note}</div>
                      </div>
                      <span className="soft small hide-sm">{relDay(a.date, today)}</span>
                    </li>
                  ) : <TaskRow key={a.id} a={a} today={today} onComplete={setOpen} showDate={k === 'late'} />)}
                </ul>
              </div>
            ))}
            {!rows.length && <Empty icon={ListChecks}>{view === 'zrobione' ? 'Nic nie zrobiono w ostatnich 14 dniach.' : 'Brak zadań w tym widoku.'}</Empty>}
          </>
        )}
      </section>
      <CompleteDialog activity={open} stage={(open?.stage || 'new') as Stage} company={open?.company} onClose={() => setOpen(null)} />
    </>
  );
}
