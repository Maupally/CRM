import { useMemo, useState } from 'react';
import { Building2, CalendarDays, ChevronRight, FolderKanban, Layers, Sparkles, Workflow } from 'lucide-react';
import { ProjectTaskRow, TaskDetail } from '../components/TaskDetail';
import { openAssistant } from '../components/Assistant';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ListChecks } from 'lucide-react';
import { api, type OpenItem } from '../api';
import { CompleteDialog } from '../components/ActivityForms';
import { TaskRow } from '../components/TaskRow';
import { Empty, ErrorBox, Loading, ResultTag, TYPE_ICON, TypeIcon, relDay, typeLabel, useToday, weekdayName } from '../components/ui';
import { addDays, isClosed, searchKey, shortDate, TYPES, type Stage, type Task } from '../../shared/domain';

const VIEWS = [
  { id: 'dzis', label: 'Dziś i zaległe' },
  { id: 'zalegle', label: 'Zaległe' },
  { id: 'nadchodzace', label: 'Nadchodzące' },
  { id: 'wszystkie', label: 'Wszystkie otwarte' },
  { id: 'zrobione', label: 'Zrobione (14 dni)' },
  { id: 'projekty', label: 'Wg tematu' },
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
  const openTasks = (tasksQ.data || []).filter((t) => !isClosed(t.status));
  const taskDay = (t: Task) => t.due || 'none';
  const tasksIn = (v: View): Task[] => type ? [] : v === 'zrobione'
    ? (tasksQ.data || []).filter((t) => isClosed(t.status) && t.completed >= addDays(today, -13))
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

/**
 * Tasks by topic, as an accordion: a procedure, an event, or the kind of companies they are for
 * (e.g. „Związki wyznaniowe” — every parish mail in one place). A loose task that names the topic
 * (e.g. „wysłać do kościołów i związków wyznaniowych…”) sits at the top of that topic.
 */
function Projects({ today }: { today: string }) {
  const tasks = useQuery({ queryKey: ['tasks'], queryFn: api.tasks });
  const [showDone, setShowDone] = useState(false);
  const [detail, setDetail] = useState<Task | null>(null);
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem('tasks.topics.open') || '[]')); } catch { return new Set(); } });
  const toggle = (k: string) => setOpenKeys((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); try { localStorage.setItem('tasks.topics.open', JSON.stringify([...n])); } catch { /* private */ } return n; });

  const groups = useMemo(() => {
    type G = { key: string; title: string; kind: 'run' | 'event' | 'topic' | 'company' | 'other'; date?: string; eventId?: string; leadId?: string; items: Task[] };
    const g = new Map<string, G>();
    const list = (tasks.data || []).filter((t) => showDone || !isClosed(t.status));
    const add = (key: string, mk: () => Omit<G, 'items' | 'key'>, t: Task) => { if (!g.has(key)) g.set(key, { key, ...mk(), items: [] }); g.get(key)!.items.push(t); };
    // topics from company segments, so loose tasks that name them can join
    const stems = (s: string) => searchKey(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 5).map((w) => w.slice(0, 5));
    const segs = [...new Set(list.map((t) => t.companySegment).filter(Boolean) as string[])];
    for (const t of list) {
      if (t.run) add(`R:${t.runId}`, () => ({ kind: 'run', title: t.run!.title.toLowerCase().startsWith(t.run!.process.toLowerCase()) ? t.run!.title : `${t.run!.process}: ${t.run!.title}` }), t);
      else if (t.eventId) add(`E:${t.eventId}`, () => ({ kind: 'event', title: t.eventTitle || t.eventId, date: t.eventDate, eventId: t.eventId }), t);
      else if (t.leadId && t.companySegment) add(`S:${t.companySegment}`, () => ({ kind: 'topic', title: t.companySegment! }), t);
      else if (t.leadId) add(`L:${t.leadId}`, () => ({ kind: 'company', title: t.company || t.leadId, leadId: t.leadId }), t);
      else {
        const k = searchKey(t.task);
        const seg = segs.find((s) => { const st = stems(s); return st.length > 0 && st.every((w) => k.includes(w)); });
        if (seg) add(`S:${seg}`, () => ({ kind: 'topic', title: seg }), t);
        else add('other', () => ({ kind: 'other', title: 'Bez tematu' }), t);
      }
    }
    for (const x of g.values()) x.items.sort((a, b) => (a.runId && a.runId === b.runId ? a.step - b.step
      : Number(!!a.leadId) - Number(!!b.leadId) || Number(isClosed(a.status)) - Number(isClosed(b.status)) || (a.due || '9').localeCompare(b.due || '9')));
    const out = [...g.values()];
    // most urgent first: the earliest open due date; topics with nothing scheduled at the end
    const first = (x: G) => x.items.filter((t) => !isClosed(t.status) && t.due).map((t) => t.due).sort()[0] || '9999';
    return out.sort((a, b) => first(a).localeCompare(first(b)) || Number(a.kind === 'other') - Number(b.kind === 'other') || b.items.length - a.items.length);
  }, [tasks.data, showDone]);

  if (tasks.isLoading) return <Loading />;
  if (tasks.error) return <div className="pad"><ErrorBox error={tasks.error} /></div>;

  return (
    <>
      <div className="toolbar">
        <div className="chips">
          <button className={`chip ${showDone ? 'on' : ''}`} onClick={() => setShowDone(!showDone)}>Pokaż zrobione</button>
          <button className="chip" onClick={() => setOpenKeys(new Set(groups.map((x) => x.key)))}>Rozwiń wszystkie</button>
          <button className="chip" onClick={() => setOpenKeys(new Set())}>Zwiń</button>
        </div>
        <span className="grow" />
        <button className="btn sm ghost" onClick={() => openAssistant('Co mi zostało do zrobienia w projektach? Ułóż kolejność na ten tydzień.')}>
          <Sparkles size={14} /> Ułóż kolejkę
        </button>
      </div>
      <div className="divider" />
      {groups.map((g) => {
        const open = g.items.filter((t) => !isClosed(t.status));
        const late = open.filter((t) => t.due && t.due < today).length;
        const next = open.map((t) => t.due).filter(Boolean).sort()[0];
        const isOpen = openKeys.has(g.key);
        const Icon = g.kind === 'event' ? CalendarDays : g.kind === 'topic' ? Layers : g.kind === 'company' ? Building2 : g.kind === 'run' ? Workflow : FolderKanban;
        return (
          <div key={g.key} className={`topic ${isOpen ? 'open' : ''}`}>
            <button className="project-head topic-head" onClick={() => toggle(g.key)}>
              <ChevronRight size={16} className="faint chev" />
              <Icon size={16} className="faint" />
              <span className="title grow trunc" style={{ textAlign: 'left' }}>{g.title}</span>
              {late > 0 && <span className="tag overdue">{late} zaległe</span>}
              {next && !late && <span className="soft small hide-sm">najbliższe {shortDate(next)}</span>}
              {g.date && <span className="soft small hide-sm">{shortDate(g.date)}</span>}
              <span className="tag">{open.length}{showDone && g.items.length !== open.length ? `/${g.items.length}` : ''}</span>
              {g.eventId && <Link className="btn sm ghost" to={`/wydarzenia/${g.eventId}`} onClick={(e) => e.stopPropagation()}>Wydarzenie →</Link>}
              {g.leadId && <Link className="btn sm ghost" to={`/firmy/${g.leadId}`} onClick={(e) => e.stopPropagation()}>Karta firmy →</Link>}
            </button>
            {isOpen && <ul className="list">{g.items.map((t) => <ProjectTaskRow key={t.id} t={t} today={today} onOpen={setDetail} link={g.kind === 'topic' || g.kind === 'other' || g.kind === 'run'} />)}</ul>}
          </div>
        );
      })}
      {!groups.length && <Empty icon={FolderKanban}>Brak zadań. Powiedz asystentowi: „wrzuć mi na dziś przygotowanie tekstów na bieg”.</Empty>}
      <TaskDetail task={detail} onClose={() => setDetail(null)} />
    </>
  );
}
