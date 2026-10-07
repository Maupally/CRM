import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDown, ArrowUp, Check, GitBranch, Pencil, Trash2, Workflow, X } from 'lucide-react';
import { api } from '../api';
import { TaskDetail } from '../components/TaskDetail';
import { Empty, ErrorBox, Loading, Modal, StatTile, relDay, useAction, useToday } from '../components/ui';
import { shortDate, type Process, type ProcessRun, type ProcessStep, type Task } from '../../shared/domain';

/**
 * Procedures and their runs: who does what, in which order, and where things are stuck. Procedures are
 * written and started by voice (Claude in claude.ai); here they can be watched and edited.
 */
export function ProcessesPage() {
  const [all, setAll] = useState(false);
  const runs = useQuery({ queryKey: ['runs', all], queryFn: () => api.runs(all) });
  const procs = useQuery({ queryKey: ['processes'], queryFn: api.processes });
  const tasks = useQuery({ queryKey: ['tasks'], queryFn: api.tasks });
  const [task, setTask] = useState<Task | null>(null);
  const [edit, setEdit] = useState<Process | null>(null);

  if (runs.isLoading || procs.isLoading) return <Loading />;
  if (runs.error || procs.error) return <ErrorBox error={runs.error || procs.error} />;
  const active = (runs.data || []).filter((r) => r.status === 'active');
  const stuck = active.filter((r) => r.stuck.length);
  const open = (id: string) => setTask((tasks.data || []).find((t) => t.id === id) || null);

  return (
    <>
      <div className="page-head">
        <div><h1>Procesy</h1><div className="sub">Kto co robi i w jakiej kolejności. Krok można odhaczyć dopiero po poprzednim, a każde spóźnienie czy blokada od razu tu widać.
          Nowe procedury i ich start — głosowo w claude.ai („zapisz procedurę…”, „uruchom proces nowego partnera dla Armady”).</div></div>
      </div>

      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <StatTile label="Trwające" value={active.length} icon={Workflow} tone="violet" />
        <StatTile label="Utknęło" value={stuck.length} icon={AlertTriangle} tone={stuck.length ? 'red' : ''} hint="spóźnione, zablokowane albo bez osoby" />
        <StatTile label="Procedury" value={procs.data?.length || 0} icon={GitBranch} />
      </div>

      <section className="card" style={{ marginBottom: 18 }}>
        <div className="card-head"><h2>Trwające procesy</h2>
          <label className="row small soft" style={{ gap: 6 }}><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> zakończone też</label></div>
        {!(runs.data || []).length ? <Empty icon={Workflow}>Nic nie trwa. Powiedz Claude'owi, którą procedurę uruchomić i dla kogo.</Empty> : (
          <ul className="list">{(runs.data || []).map((r) => <RunRow key={r.id} r={r} onOpen={open} />)}</ul>
        )}
      </section>

      <section className="card">
        <div className="card-head"><h2>Procedury</h2></div>
        {!(procs.data || []).length ? <Empty icon={GitBranch}>Brak procedur. Opisz Claude'owi, jak coś u Was przebiega krok po kroku i kto co robi — zapisze to jako procedurę.</Empty> : (
          <ul className="list">
            {(procs.data || []).map((p) => (
              <li key={p.id} className="li" style={{ alignItems: 'flex-start' }}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="title">{p.name}{p.activeRuns ? <span className="soft small"> · trwa {p.activeRuns}</span> : null}</div>
                  {p.description && <div className="meta">{p.description}</div>}
                  <ProcSteps steps={p.steps} />
                </div>
                <button className="btn sm ghost icon" onClick={() => setEdit(p)} aria-label="Edytuj"><Pencil size={14} /></button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <TaskDetail task={task} onClose={() => setTask(null)} />
      <ProcessForm value={edit} onClose={() => setEdit(null)} />
    </>
  );
}

function ProcSteps({ steps }: { steps: ProcessStep[] }) {
  const people = useQuery({ queryKey: ['people'], queryFn: api.people });
  const name = (id: number) => people.data?.find((p) => p.id === id)?.name;
  return (
    <ol className="proc-steps">
      {steps.map((s, i) => (
        <li key={i}><b>{s.title}</b> <span className="soft">— {name(s.personId) || <span style={{ color: 'var(--warn)' }}>nikt</span>}{s.days ? ` · ${s.days} dni` : ''}</span>
          {s.doneWhen && <div className="small faint">gotowe, gdy: {s.doneWhen}</div>}</li>
      ))}
    </ol>
  );
}

function RunRow({ r, onOpen }: { r: ProcessRun; onOpen: (taskId: string) => void }) {
  const today = useToday();
  const cancel = useAction(() => api.cancelRun(r.id), { ok: 'Anulowano' });
  const cur = r.steps[r.current - 1];
  return (
    <li className="li" style={{ alignItems: 'flex-start' }}>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 8 }}>
          <b className="trunc">{r.title}</b>
          {r.status === 'done' && <span className="tag" style={{ color: 'var(--ok)' }}>zakończony {shortDate(r.finished)}</span>}
          {r.status === 'cancelled' && <span className="tag">anulowany</span>}
        </div>
        <div className="meta">{r.process}{r.company && <> · <Link to={`/firmy/${r.leadId}`}>{r.company}</Link></>}{r.eventTitle && <> · <Link to={`/wydarzenia/${r.eventId}`}>{r.eventTitle}</Link></>} · od {shortDate(r.started)}</div>
        <div className="run-steps">
          {r.steps.map((s) => (
            <button key={s.taskId} onClick={() => onOpen(s.taskId)} title={`${s.step}. ${s.title}${s.person ? ` — ${s.person}` : ''}`}
              className={`run-step ${s.status === 'done' ? 'done' : s.step === r.current ? (r.stuck.length ? 'stuck' : 'now') : ''}`}>
              {s.status === 'done' ? <Check size={12} /> : s.step}<span className="trunc">{s.title}</span>
            </button>
          ))}
        </div>
        {cur && (
          <div className="small" style={{ marginTop: 6 }}>
            Teraz: <b>krok {r.current}/{r.steps.length}</b> „{cur.title}” — <b>{cur.person || 'nikt'}</b>
            {cur.due && <span className="soft"> · termin {shortDate(cur.due)} ({relDay(cur.due, today)})</span>}
          </div>
        )}
        {r.stuck.length > 0 && <div className="small row" style={{ color: 'var(--bad)', marginTop: 4 }}><AlertTriangle size={13} /> Utknęło: {r.stuck.join(' · ')}</div>}
      </div>
      {r.status === 'active' && <button className="btn sm ghost icon" onClick={() => confirm(`Anulować proces „${r.title}”?`) && cancel.mutate(undefined)} aria-label="Anuluj"><X size={14} /></button>}
    </li>
  );
}

function ProcessForm({ value, onClose }: { value: Process | null; onClose: () => void }) {
  const people = useQuery({ queryKey: ['people'], queryFn: api.people, enabled: !!value });
  const [d, setD] = useState<Process | null>(null);
  useEffect(() => { setD(value); }, [value]);
  const save = useAction(() => api.saveProcess(d!), { ok: 'Zapisano', onDone: onClose });
  const drop = useAction(() => api.deleteProcess(d!.id), { ok: 'Usunięto', onDone: onClose });
  if (!d) return null;
  const step = (i: number, patch: Partial<ProcessStep>) => setD({ ...d, steps: d.steps.map((s, k) => k === i ? { ...s, ...patch } : s) });
  const move = (i: number, by: number) => {
    const s = [...d.steps]; const [x] = s.splice(i, 1); s.splice(i + by, 0, x); setD({ ...d, steps: s });
  };
  return (
    <Modal open={!!value} onClose={onClose} wide title={`Procedura: ${value?.name}`}
      footer={<>
        <button className="btn ghost danger" style={{ marginRight: 'auto' }} onClick={() => confirm('Usunąć procedurę?') && drop.mutate(undefined)}><Trash2 size={15} /></button>
        <button className="btn" onClick={onClose}>Anuluj</button>
        <button className="btn primary" disabled={!d.name.trim() || !d.steps.length || save.isPending} onClick={() => save.mutate(undefined)}>Zapisz</button>
      </>}>
      <label className="field">Nazwa<input type="text" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></label>
      <label className="field">Opis<textarea rows={2} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></label>
      <div className="col tight">
        <span className="small soft">Kroki — po kolei. Zmiany dotyczą nowych uruchomień; trwające procesy zostają jak były.</span>
        {d.steps.map((s, i) => (
          <div key={i} className="proc-edit">
            <b className="soft">{i + 1}.</b>
            <input type="text" value={s.title} onChange={(e) => step(i, { title: e.target.value })} style={{ flex: 2, minWidth: 160 }} />
            <select value={s.personId || ''} onChange={(e) => step(i, { personId: Number(e.target.value) })} style={{ flex: 1, minWidth: 120 }}>
              <option value="">— kto? —</option>
              {(people.data || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input type="number" min={0} value={s.days || ''} placeholder="dni" onChange={(e) => step(i, { days: Number(e.target.value) })} style={{ width: 70 }} />
            <input type="text" value={s.doneWhen} placeholder="gotowe, gdy…" onChange={(e) => step(i, { doneWhen: e.target.value })} style={{ flex: 2, minWidth: 140 }} />
            <span className="row" style={{ gap: 2 }}>
              <button className="btn sm ghost icon" disabled={!i} onClick={() => move(i, -1)} aria-label="Wyżej"><ArrowUp size={13} /></button>
              <button className="btn sm ghost icon" disabled={i === d.steps.length - 1} onClick={() => move(i, 1)} aria-label="Niżej"><ArrowDown size={13} /></button>
              <button className="btn sm ghost icon" disabled={d.steps.length < 2} onClick={() => setD({ ...d, steps: d.steps.filter((_, k) => k !== i) })} aria-label="Usuń krok"><X size={13} /></button>
            </span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
