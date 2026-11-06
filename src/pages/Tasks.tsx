import { useMemo, useState } from 'react';
import { Building2, CalendarDays, ChevronRight, FolderKanban, Inbox, Layers, PhoneCall, Sparkles, Workflow } from 'lucide-react';
import { ProjectTaskRow, TaskDetail } from '../components/TaskDetail';
import { PasteStory, StoryPanel } from '../components/Story';
import { openAssistant } from '../components/Assistant';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardPaste, ListChecks } from 'lucide-react';
import { api, type OpenItem } from '../api';
import { CompleteDialog } from '../components/ActivityForms';
import { TaskRow } from '../components/TaskRow';
import { Empty, ErrorBox, Loading, ResultTag, TYPE_ICON, TypeIcon, relDay, typeLabel, useToday, weekdayName } from '../components/ui';
import { capacity } from '../../shared/capacity';
import { namedGroups, topicOf, type Topic } from '../../shared/topics';
import { addDays, isClosed, searchKey, shortDate, TYPES, type Stage, type Task } from '../../shared/domain';

const VIEWS = [
  { id: 'dzis', label: 'Dziś i zaległe' },
  { id: 'zalegle', label: 'Zaległe' },
  { id: 'nadchodzace', label: 'Nadchodzące' },
  { id: 'wszystkie', label: 'Wszystkie otwarte' },
  { id: 'zrobione', label: 'Zrobione (14 dni)' },
  { id: 'projekty', label: 'Wg tematu' },
  { id: 'obciazenie', label: 'Obciążenie' },
] as const;
type View = (typeof VIEWS)[number]['id'];

/** % of the topic's effort (story points) already done, out of everything not dropped. */
function completion(all: Task[], key: string, segs: Groups) {
  const mine = all.filter((t) => t.status !== 'skipped' && topicOf(t, segs).key === key);
  const total = mine.reduce((n, t) => n + t.points, 0);
  const done = mine.filter((t) => t.status === 'done').reduce((n, t) => n + t.points, 0);
  return { pct: total ? Math.round((done / total) * 100) : 0, done, total };
}
function Progress({ c }: { c: { pct: number; done: number; total: number } }) {
  return <><span className="pbar hide-sm" title={`${c.done} z ${c.total} pkt zrobione`}><i style={{ width: `${c.pct}%` }} /></span><span className="pct">{c.pct}%</span></>;
}
const TOPIC_ICON = { event: CalendarDays, project: FolderKanban, topic: Layers, company: Building2, run: Workflow, other: Inbox, cold: PhoneCall } as const;
type Groups = ReturnType<typeof namedGroups>;

function useOpenTopics(storage: string) {
  const [keys, setKeys] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem(storage) || '[]')); } catch { return new Set(); } });
  const save = (n: Set<string>) => { try { localStorage.setItem(storage, JSON.stringify([...n])); } catch { /* private */ } return n; };
  return {
    keys,
    toggle: (k: string) => setKeys((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return save(n); }),
    set: (ks: string[]) => setKeys(save(new Set(ks))),
  };
}

/** A list of tasks where two or more from the same topic fold into one row you click open. */
function FoldedTasks({ tasks, acts = [], all = [], segs, today, onOpen, onComplete, open, toggle, scope, showDate }: {
  tasks: Task[]; all?: Task[]; acts?: OpenItem[]; segs: Groups; today: string; onOpen: (t: Task) => void; onComplete?: (a: OpenItem) => void;
  open: Set<string>; toggle: (k: string) => void; scope: string; showDate?: boolean;
}) {
  const groups: { topic: Topic; items: Task[]; acts: OpenItem[] }[] = [];
  const at = (tp: Topic) => { let g = groups.find((x) => x.topic.key === tp.key); if (!g) { g = { topic: tp, items: [], acts: [] }; groups.push(g); } return g; };
  for (const t of tasks) at(topicOf(t, segs)).items.push(t);
  // calendar items: with the company's tasks when it has some here; calls and mails to companies → "Cold calling"; meetings stay on their own
  const byLead = new Map<string, Topic>();
  for (const t of tasks) if (t.leadId) byLead.set(t.leadId, topicOf(t, segs));
  const leadCount = new Map<string, number>();
  for (const a of acts) leadCount.set(a.leadId, (leadCount.get(a.leadId) || 0) + 1);
  for (const a of acts) {
    const own = byLead.get(a.leadId);
    if (own) at(own).acts.push(a);
    else if ((leadCount.get(a.leadId) || 0) > 1) at({ key: `L:${a.leadId}`, kind: 'company', title: a.company || a.leadId, leadId: a.leadId }).acts.push(a);
    else if (a.type === 'Meeting' || a.type === 'Visit') at({ key: `A:${a.id}`, kind: 'company', title: a.company || '' }).acts.push(a);
    else at({ key: 'cold', kind: 'cold', title: 'Cold calling' }).acts.push(a);
  }
  // nothing loose: anything alone in its group (except a meeting with a date) goes into "Inne"
  const other = { topic: { key: 'other', kind: 'other' as const, title: 'Inne' } as Topic, items: [] as Task[], acts: [] as OpenItem[] };
  const kept = groups.filter((g) => {
    if (g.topic.key === 'other') { other.items.push(...g.items); other.acts.push(...g.acts); return false; }
    if (g.topic.key.startsWith('A:') || g.items.length + g.acts.length >= 2) return true;
    other.items.push(...g.items); other.acts.push(...g.acts);
    return false;
  });
  const shown = [...kept, ...(other.items.length + other.acts.length ? [other] : [])];
  return (
    <>
      {shown.map(({ topic, items, acts: ga }) => {
        if (items.length + ga.length < 2 || topic.key.startsWith('A:')) {
          return [...items.map((t) => <ProjectTaskRow key={t.id} t={t} today={today} onOpen={onOpen} sub={t.eventTitle || t.company} />),
            ...ga.map((a) => <TaskRow key={`a${a.id}`} a={a} today={today} onComplete={onComplete!} showDate={showDate} />)];
        }
        const k = `${scope}|${topic.key}`;
        const isOpen = open.has(k);
        const I = TOPIC_ICON[topic.kind];
        const late = items.filter((t) => t.due && t.due < today).length + ga.filter((a) => a.date < today).length;
        return (
          <li key={k} className={`fold ${isOpen ? 'open' : ''}`}>
            <button className="fold-head" onClick={() => toggle(k)}>
              <ChevronRight size={15} className="faint chev" />
              <I size={15} className="faint" />
              <b className="grow trunc" style={{ textAlign: 'left' }}>{topic.title}{topic.date && <span className="soft" style={{ fontWeight: 400 }}> · {shortDate(topic.date)}</span>}</b>
              {late > 0 && <span className="tag overdue">{late} po terminie</span>}
              {topic.kind !== 'cold' && topic.kind !== 'company' && topic.kind !== 'other' && <Progress c={completion(all, topic.key, segs)} />}
              <span className="tag">{items.length + ga.length}</span>
            </button>
            {isOpen && <ul className="list fold-body">
              {items.map((t) => <ProjectTaskRow key={t.id} t={t} today={today} onOpen={onOpen} link={topic.kind !== 'event' && topic.kind !== 'company'} />)}
              {[...ga].sort((x, y) => (x.segment || '').localeCompare(y.segment || '') || x.date.localeCompare(y.date)).map((a) => <TaskRow key={`a${a.id}`} a={a} today={today} onComplete={onComplete!} showDate={showDate} />)}
            </ul>}
          </li>
        );
      })}
    </>
  );
}

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
  const folds = useOpenTopics('tasks.folds.open');
  const segs = useMemo(() => namedGroups(tasksQ.data || []), [tasksQ.data]);

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
    obciazenie: 0,
  };

  const rows = useMemo(() => {
    let r: OpenItem[] = view === 'zrobione'
      ? (doneQ.data || []).filter((a) => a.result !== 'planned' && a.type !== 'Note').reverse()
      : all.filter((a) => view === 'dzis' ? a.date <= today : view === 'zalegle' ? a.date < today
        : view === 'nadchodzace' ? a.date > today : true);
    if (type) r = r.filter((a) => a.type === type);
    return r;
  }, [all, doneQ.data, view, type, today]);

  const taskRows = view === 'projekty' || view === 'obciazenie' ? [] : tasksIn(view);

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
              {v.label}{v.id !== 'zrobione' && v.id !== 'projekty' && v.id !== 'obciazenie' && <span className="n">{counts[v.id]}</span>}
            </button>
          ))}
        </div>
        {view === 'obciazenie' ? <CapacityView today={today} onOpen={setDetail} /> : view === 'projekty' ? <Projects today={today} /> : <>
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
                  <FoldedTasks tasks={tasks} acts={view === 'zrobione' ? [] : items} all={tasksQ.data || []} segs={segs} today={today} onOpen={setDetail} onComplete={setOpen}
                    open={folds.keys} toggle={folds.toggle} scope={`${view}:${k}`} showDate={k === 'late'} />
                  {view === 'zrobione' && items.map((a) => (
                    <li key={a.id} className="li">
                      <TypeIcon type={a.type} />
                      <div className="grow">
                        <div className="row"><Link to={`/firmy/${a.leadId}`} className="title trunc">{a.company}</Link><ResultTag result={a.result} /></div>
                        <div className="meta trunc">{a.note}</div>
                      </div>
                      <span className="soft small hide-sm">{relDay(a.date, today)}</span>
                    </li>
                  ))}
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
  const [pasting, setPasting] = useState(false);
  const stories = useQuery({ queryKey: ['story', {}], queryFn: () => api.story() });
  const folds = useOpenTopics('tasks.topics.open');
  const openKeys = folds.keys;
  const toggle = folds.toggle;
  const setOpenKeys = (s: Set<string>) => folds.set([...s]);

  const groups = useMemo(() => {
    type G = Topic & { items: Task[] };
    const g = new Map<string, G>();
    const list = (tasks.data || []).filter((t) => showDone || !isClosed(t.status));
    const segs = namedGroups(list);
    for (const t of list) {
      const tp = topicOf(t, segs);
      if (!g.has(tp.key)) g.set(tp.key, { ...tp, items: [] });
      g.get(tp.key)!.items.push(t);
    }
    for (const x of g.values()) x.items.sort((a, b) => (a.runId && a.runId === b.runId ? a.step - b.step
      : Number(!!a.leadId) - Number(!!b.leadId) || Number(isClosed(a.status)) - Number(isClosed(b.status)) || (a.due || '9').localeCompare(b.due || '9')));
    // topics that so far have only a story (a pasted thread), no tasks
    for (const st of stories.data || []) {
      if (st.topic && !st.leadId && !st.eventId && !g.has(`T:${st.topic}`)) g.set(`T:${st.topic}`, { key: `T:${st.topic}`, kind: 'project', title: st.topic, items: [] });
    }
    const out = [...g.values()];
    // most urgent first: the earliest open due date; topics with nothing scheduled at the end
    const first = (x: G) => x.items.filter((t) => !isClosed(t.status) && t.due).map((t) => t.due).sort()[0] || '9999';
    return out.sort((a, b) => first(a).localeCompare(first(b)) || Number(a.kind === 'other') - Number(b.kind === 'other') || b.items.length - a.items.length);
  }, [tasks.data, showDone, stories.data]);

  const allGroups = useMemo(() => namedGroups(tasks.data || []), [tasks.data]);
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
        <button className="btn sm" onClick={() => setPasting(true)}><ClipboardPaste size={14} /> Wklej wątek maila</button>
        <PasteStory open={pasting} onClose={() => setPasting(false)} />
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
        const Icon = TOPIC_ICON[g.kind];
        return (
          <div key={g.key} className={`topic ${isOpen ? 'open' : ''}`}>
            <button className="project-head topic-head" onClick={() => toggle(g.key)}>
              <ChevronRight size={16} className="faint chev" />
              <Icon size={16} className="faint" />
              <span className="title grow trunc" style={{ textAlign: 'left' }}>{g.title}</span>
              {late > 0 && <span className="tag overdue">{late} zaległe</span>}
              {next && !late && <span className="soft small hide-sm">najbliższe {shortDate(next)}</span>}
              {g.date && <span className="soft small hide-sm">{shortDate(g.date)}</span>}
              {g.kind !== 'other' && <Progress c={completion(tasks.data || [], g.key, allGroups)} />}
              <span className="tag">{open.length}{showDone && g.items.length !== open.length ? `/${g.items.length}` : ''}</span>
              {g.eventId && <Link className="btn sm ghost" to={`/wydarzenia/${g.eventId}`} onClick={(e) => e.stopPropagation()}>Wydarzenie →</Link>}
              {g.leadId && <Link className="btn sm ghost" to={`/firmy/${g.leadId}`} onClick={(e) => e.stopPropagation()}>Karta firmy →</Link>}
            </button>
            {isOpen && <ul className="list">{g.items.map((t) => <ProjectTaskRow key={t.id} t={t} today={today} onOpen={setDetail} link={g.kind === 'topic' || g.kind === 'other' || g.kind === 'run'} />)}</ul>}
            {isOpen && (g.kind === 'project' || g.kind === 'topic') && <StoryPanel target={{ topic: g.title }} card={false} />}
          </div>
        );
      })}
      {!groups.length && <Empty icon={FolderKanban}>Brak zadań. Powiedz asystentowi: „wrzuć mi na dziś przygotowanie tekstów na bieg”.</Empty>}
      <TaskDetail task={detail} onClose={() => setDetail(null)} />
    </>
  );
}

/**
 * Capacity in story points: how much is planned for each week against your usual pace (velocity = average done per week
 * over the last four), who carries what this week, and what is too big to do in one go.
 */
function CapacityView({ today, onOpen }: { today: string; onOpen: (t: Task) => void }) {
  const q = useQuery({ queryKey: ['tasks'], queryFn: api.tasks });
  if (q.isLoading) return <Loading />;
  if (q.error) return <div className="pad"><ErrorBox error={q.error} /></div>;
  const all = q.data || [];
  const c = capacity(all, today);
  const weeks = [...c.past, c.thisWeek, ...c.ahead];
  const max = Math.max(1, c.velocity * 1.5, ...weeks.map((w) => Math.max(w.planned + (w.start === c.thisWeek.start ? w.done : 0), w.done)));
  const pct = (n: number) => `${Math.min(100, (n / max) * 100)}%`;
  const label = (w: { start: string; end: string }) => w.start === c.thisWeek.start ? 'Ten tydzień' : `${shortDate(w.start)}–${shortDate(w.end)}`;
  const over = c.velocity && c.thisWeek.planned + c.thisWeek.done > c.velocity * 1.2;
  const big = all.filter((t) => c.tooBig.some((b) => b.id === t.id));
  return (
    <div className="col" style={{ gap: 0 }}>
      <div className="grid kpis" style={{ padding: 20 }}>
        <div className="stat"><div className="top"><span>Zaplanowane na ten tydzień</span></div><div className="val">{c.thisWeek.planned} <span className="soft small">pkt</span></div><div className="hint">{c.thisWeek.tasks} zadań (z zaległymi)</div></div>
        <div className="stat"><div className="top"><span>Zrobione w tym tygodniu</span></div><div className="val">{c.thisWeek.done} <span className="soft small">pkt</span></div></div>
        <div className="stat"><div className="top"><span>Twoje tempo (velocity)</span></div><div className="val">{c.velocity} <span className="soft small">pkt / tydz.</span></div><div className="hint">średnia z 4 ostatnich tygodni</div></div>
        <div className="stat"><div className="top"><span>Bez terminu</span></div><div className="val">{c.unscheduled} <span className="soft small">pkt</span></div><div className="hint">czeka na zaplanowanie</div></div>
      </div>
      {over ? <div className="error-box" style={{ margin: '0 20px 12px' }}>Ten tydzień ma więcej, niż zwykle robisz ({c.thisWeek.planned + c.thisWeek.done} pkt przy tempie {c.velocity}). Przesuń część zadań albo przekaż komuś — Claude podpowie co.</div> : null}
      <div className="group-label" style={{ padding: '6px 20px' }}>Tygodnie — <span style={{ color: 'var(--ok)' }}>zrobione</span>, <span style={{ color: 'var(--accent)' }}>zaplanowane</span>, kreska = Twoje tempo</div>
      {weeks.map((w) => {
        const isThis = w.start === c.thisWeek.start;
        const future = w.start > c.thisWeek.start;
        const planned = isThis || future ? w.planned : 0;
        const fill = w.done + planned;
        return (
          <div key={w.start} className="cap-week" style={isThis ? { background: 'var(--tint)' } : undefined}>
            <span className={isThis ? '' : 'soft'} style={{ fontWeight: isThis ? 700 : 400 }}>{label(w)}</span>
            <div className="cap-track">
              <div className="done" style={{ width: pct(w.done) }} />
              <div className="plan" style={{ left: pct(w.done), width: pct(planned) }} />
              {c.velocity > 0 && fill > c.velocity && <div className="over" style={{ left: pct(c.velocity), width: `calc(${pct(fill)} - ${pct(c.velocity)})` }} />}
              {c.velocity > 0 && <div className="cap-line" style={{ left: pct(c.velocity) }} />}
            </div>
            <span className="small" style={{ textAlign: 'right' }}>{w.done ? `${w.done} zrobione` : ''}{w.done && planned ? ' · ' : ''}{planned ? `${planned} plan` : ''}{!w.done && !planned ? '—' : ''}</span>
          </div>
        );
      })}
      {c.people.length > 0 && <>
        <div className="group-label" style={{ padding: '14px 20px 6px' }}>Kto ile ma w tym tygodniu</div>
        {c.people.map((p) => (
          <div key={p.name || '-'} className="cap-week">
            <span>{p.name || 'nieprzypisane'}</span>
            <div className="cap-track"><div className="done" style={{ width: pct(p.done) }} /><div className="plan" style={{ left: pct(p.done), width: pct(p.planned) }} /></div>
            <span className="small" style={{ textAlign: 'right' }}>{p.planned} plan{p.done ? ` · ${p.done} zrobione` : ''}</span>
          </div>
        ))}
      </>}
      {big.length > 0 && <>
        <div className="group-label red" style={{ padding: '14px 20px 6px' }}>Za duże — rozbij na mniejsze (13–21 pkt)</div>
        <ul className="list">{big.map((t) => <ProjectTaskRow key={t.id} t={t} today={today} onOpen={onOpen} sub={t.eventTitle || t.company} />)}</ul>
      </>}
      <div className="hint" style={{ padding: '14px 20px 18px' }}>Punkty (Fibonacci) mierzą wysiłek, złożoność i niepewność, nie godziny: 1 telefon, 2 mail, 3 umówienie, 5 regulamin/newsletter, 8 strona z formularzem; 13 i 21 = rozbij.
        Szare liczby przy zadaniach to szacunek Opal5 z treści — kliknij zadanie i ustaw właściwe. Claude ustawia punkty sam przy tworzeniu zadań.</div>
    </div>
  );
}
