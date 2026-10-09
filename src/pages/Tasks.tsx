import { useMemo, useState } from 'react';
import { FolderKanban, Sparkles } from 'lucide-react';
import { ProjectTaskRow, TaskDetail } from '../components/TaskDetail';
import { openAssistant } from '../components/Assistant';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ListChecks } from 'lucide-react';
import { api, type OpenItem } from '../api';
import { CompleteDialog } from '../components/ActivityForms';
import { TaskRow } from '../components/TaskRow';
import { Empty, ErrorBox, Loading, ResultTag, TYPE_ICON, TypeIcon, relDay, typeLabel, useToday, weekdayName } from '../components/ui';
import { addDays, shortDate, TYPES, type Stage, type Task } from '../../shared/domain';

const VIEWS = [
  { id: 'dzis', label: 'Dziś i zaległe' },
  { id: 'zalegle', label: 'Zaległe' },
  { id: 'nadchodzace', label: 'Nadchodzące' },
  { id: 'wszystkie', label: 'Wszystkie otwarte' },
  { id: 'zrobione', label: 'Zrobione (14 dni)' },
  { id: 'projekty', label: 'Projekty' },
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

  const tasksQ = useQuery({ queryKey: ['tasks'], queryFn: api.tasks });
  const [detail, setDetail] = useState<Task | null>(null);

  const all = openQ.data || [];
  // project tasks (Bieg, Dzień otwarty…) sit in the same day groups as calls and meetings
  const openTasks = (tasksQ.data || []).filter((t) => t.status !== 'done');
  const taskDay = (t: Task) => t.due || 'none';
  const tasksIn = (v: View): Task[] => type ? [] : v === 'zrobione'
    ? (tasksQ.data || []).filter((t) => t.status === 'done' && t.completed >= addDays(today, -13))
    : openTasks.filter((t) => v === 'dzis' ? !!t.due && t.due <= today : v === 'zalegle' ? !!t.due && t.due < today
      : v === 'nadchodzace' ? t.due > today : true);
  const counts: Record<View, number> = {
    dzis: all.filter((a) => a.date <= today).length + tasksIn('dzis').length,
    zalegle: all.filter((a) => a.date < today).length + tasksIn('zalegle').length,
    nadchodzace: all.filter((a) => a.date > today).length + tasksIn('nadchodzace').length,
    wszystkie: all.length + tasksIn('wszystkie').length,
    zrobione: 0,
    projekty: 0,
  };

  const rows = useMemo(() => {
    let r: OpenItem[] = view === 'zrobione'
      ? (doneQ.data || []).filter((a) => a.result !== 'planned' && a.type !== 'Note').reverse()
      : all.filter((a) => view === 'dzis' ? a.date <= today : view === 'zalegle' ? a.date < today
        : view === 'nadchodzace' ? a.date > today : true);
    if (type) r = r.filter((a) => a.type === type);
    return r;
  }, [all, doneQ.data, view, type, today]);

  const taskRows = view === 'projekty' ? [] : tasksIn(view);

  // group by day: "Zaległe" collapses everything before today into one bucket
  const groups = useMemo(() => {
    const g = new Map<string, { acts: OpenItem[]; tasks: Task[] }>();
    const at = (key: string) => { if (!g.has(key)) g.set(key, { acts: [], tasks: [] }); return g.get(key)!; };
    for (const a of rows) at(view !== 'zrobione' && a.date < today ? 'late' : a.date).acts.push(a);
    for (const t of taskRows) {
      const d = view === 'zrobione' ? t.completed : taskDay(t);
      at(d === 'none' ? 'none' : view !== 'zrobione' && d < today ? 'late' : d).tasks.push(t);
    }
    const order = (k: string) => k === 'late' ? '0' : k === 'none' ? '9' : k;
    return [...g.entries()].sort((x, y) => view === 'zrobione' ? order(y[0]).localeCompare(order(x[0])) : order(x[0]).localeCompare(order(y[0])));
  }, [rows, taskRows, view, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = (k: string) => k === 'late' ? 'Zaległe' : k === 'none' ? 'Bez terminu' : k === today ? 'Dziś' : k === addDays(today, 1) ? 'Jutro'
    : `${weekdayName(k)} ${shortDate(k)}`;

  return (
    <>
      <div className="page-head">
        <div><h1>Zadania</h1><div className="sub">Telefony, maile, spotkania i zadania z wydarzeń — odhaczaj, a CRM sam ustawi etap i następny krok.</div></div>
      </div>
      <section className="card">
        <div className="views">
          {VIEWS.map((v) => (
            <button key={v.id} className={view === v.id ? 'on' : ''} onClick={() => setSp(v.id === 'dzis' ? {} : { widok: v.id }, { replace: true })}>
              {v.label}{v.id !== 'zrobione' && v.id !== 'projekty' && <span className="n">{counts[v.id]}</span>}
            </button>
          ))}
        </div>
        {view === 'projekty' ? <Projects today={today} /> : <>
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
            {groups.map(([k, { acts: items, tasks }]) => (
              <div key={k}>
                <div className={`group-label ${k === 'late' ? 'red' : ''}`}>{label(k)} · {items.length + tasks.length}</div>
                <ul className="list">
                  {tasks.map((t) => <ProjectTaskRow key={t.id} t={t} today={today} onOpen={setDetail} sub={t.eventTitle || t.company} />)}
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
            {!rows.length && !taskRows.length && <Empty icon={ListChecks}>{view === 'zrobione' ? 'Nic nie zrobiono w ostatnich 14 dniach.' : 'Brak zadań w tym widoku.'}</Empty>}
          </>
        )}
        </>}
      </section>
      <TaskDetail task={detail} onClose={() => setDetail(null)} />
      <CompleteDialog activity={open} stage={(open?.stage || 'new') as Stage} company={open?.company} onClose={() => setOpen(null)} />
    </>
  );
}

/** Tasks grouped by project (event); tasks without an event sit under their company or "Inne". */
function Projects({ today }: { today: string }) {
  const tasks = useQuery({ queryKey: ['tasks'], queryFn: api.tasks });
  const [showDone, setShowDone] = useState(false);
  const [detail, setDetail] = useState<Task | null>(null);

  const groups = useMemo(() => {
    const g = new Map<string, { title: string; date?: string; eventId?: string; items: Task[] }>();
    for (const t of tasks.data || []) {
      if (!showDone && t.status === 'done') continue;
      const key = t.run ? `R:${t.runId}` : t.eventId || (t.leadId ? `L:${t.leadId}` : 'other');
      if (!g.has(key)) g.set(key, { title: t.run ? (t.run.title.toLowerCase().startsWith(t.run.process.toLowerCase()) ? t.run.title : `${t.run.process}: ${t.run.title}`) : t.eventTitle || t.company || 'Inne',
        date: t.run ? undefined : t.eventDate, eventId: t.run ? undefined : t.eventId || undefined, items: [] });
      g.get(key)!.items.push(t);
    }
    for (const x of g.values()) x.items.sort((a, b) => (a.runId && a.runId === b.runId ? a.step - b.step
      : Number(a.status === 'done') - Number(b.status === 'done') || (a.due || '9').localeCompare(b.due || '9')));
    return [...g.values()].sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
  }, [tasks.data, showDone]);

  if (tasks.isLoading) return <Loading />;
  if (tasks.error) return <div className="pad"><ErrorBox error={tasks.error} /></div>;

  return (
    <>
      <div className="toolbar">
        <div className="chips">
          <button className={`chip ${showDone ? 'on' : ''}`} onClick={() => setShowDone(!showDone)}>Pokaż zrobione</button>
        </div>
        <span className="grow" />
        <button className="btn sm ghost" onClick={() => openAssistant('Co mi zostało do zrobienia w projektach? Ułóż kolejność na ten tydzień.')}>
          <Sparkles size={14} /> Ułóż kolejkę
        </button>
      </div>
      <div className="divider" />
      {groups.map((g) => (
        <div key={g.title + (g.eventId || '')}>
          <div className="project-head">
            <FolderKanban size={16} className="faint" />
            {g.eventId ? <Link to={`/wydarzenia/${g.eventId}`} className="title grow trunc">{g.title}</Link> : <span className="title grow trunc">{g.title}</span>}
            {g.date && <span className="soft small">{shortDate(g.date)}</span>}
            <span className="faint small mono">{g.items.filter((t) => t.status !== 'done').length}</span>
          </div>
          <ul className="list">{g.items.map((t) => <ProjectTaskRow key={t.id} t={t} today={today} onOpen={setDetail} />)}</ul>
        </div>
      ))}
      {!groups.length && <Empty icon={FolderKanban}>Brak zadań w projektach. Powiedz asystentowi: „wrzuć mi na dziś przygotowanie tekstów na bieg”.</Empty>}
      <TaskDetail task={detail} onClose={() => setDetail(null)} />
    </>
  );
}
