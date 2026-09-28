import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.ts';
import { DueTag, ErrorBox, Loading, Modal, relDay, useAction, useToday, weekdayName } from '../components/ui.tsx';
import { EVENT_STATUS, EVENT_TYPES, shortDate, type CrmEvent, type Task } from '../../shared/domain.ts';

export function EventsPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const today = useToday();
  const ev = useQuery({ queryKey: ['events'], queryFn: api.events });
  const tasks = useQuery({ queryKey: ['tasks'], queryFn: api.tasks });
  const [editing, setEditing] = useState<Partial<CrmEvent> | null>(null);
  const [showPast, setShowPast] = useState(false);

  if (ev.isLoading || tasks.isLoading) return <Loading />;
  if (ev.error) return <ErrorBox error={ev.error} />;
  const events = ev.data!;
  const shown = events.filter((e) => showPast || e.date >= today || e.id === id);
  const current = events.find((e) => e.id === id) || null;

  return (
    <>
      <div className="page-head">
        <h1>Events</h1>
        <span className="spacer" />
        <label className="row hint"><input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> show past</label>
        <button className="btn primary" onClick={() => setEditing({ type: 'Open day', status: 'planned', date: today })}>+ New event</button>
      </div>
      <div className="grid two">
        <section className="card">
          <ul className="list">
            {shown.map((e) => {
              const pct = e.totalTasks ? Math.round(((e.totalTasks - (e.openTasks || 0)) / e.totalTasks) * 100) : 0;
              return (
                <li key={e.id} className="item" style={{ cursor: 'pointer', background: e.id === id ? 'var(--panel-2)' : undefined }}
                  onClick={() => nav(`/events/${e.id}`)}>
                  <div style={{ width: 64, textAlign: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>{shortDate(e.date)}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{weekdayName(e.date)}</div>
                  </div>
                  <div className="grow">
                    <div className="row wrap"><span className="title">{e.title}</span><span className="tag">{e.type}</span>
                      {e.status !== 'planned' && <span className="tag">{e.status}</span>}</div>
                    <div className="muted ellipsis" style={{ fontSize: 13 }}>{[e.time, e.location, e.company].filter(Boolean).join(' · ')}</div>
                    {!!e.totalTasks && (
                      <div className="row" style={{ marginTop: 6 }}>
                        <div className="progress grow"><div style={{ width: pct + '%' }} /></div>
                        <span className="faint" style={{ fontSize: 12 }}>{e.totalTasks - (e.openTasks || 0)}/{e.totalTasks}</span>
                      </div>
                    )}
                  </div>
                  <span className="muted nowrap" style={{ fontSize: 12.5 }}>{relDay(e.date, today)}</span>
                </li>
              );
            })}
            {!shown.length && <li className="empty">No upcoming events.</li>}
          </ul>
        </section>

        {current ? (
          <EventDetail key={current.id} event={current} tasks={(tasks.data || []).filter((t) => t.eventId === current.id)}
            onEdit={() => setEditing(current)} />
        ) : (
          <section className="card card-pad muted">Pick an event to see its checklist.</section>
        )}
      </div>
      <EventForm value={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function EventDetail({ event: e, tasks, onEdit }: { event: CrmEvent; tasks: Task[]; onEdit: () => void }) {
  const today = useToday();
  const [task, setTask] = useState('');
  const [due, setDue] = useState('');
  const add = useAction(() => api.saveTask({ eventId: e.id, task, due }), { onDone: () => { setTask(''); setDue(''); } });
  const toggle = useAction((id: string) => api.toggleTask(id));
  const drop = useAction((id: string) => api.deleteTask(id));
  const open = tasks.filter((t) => t.status !== 'done');
  const done = tasks.filter((t) => t.status === 'done');

  return (
    <section className="card">
      <div className="card-head">
        <h2>{e.title}</h2>
        <button className="btn sm" onClick={onEdit}>Edit</button>
      </div>
      <div className="card-pad stack tight">
        <div>{weekdayName(e.date)} {shortDate(e.date)}.{e.date.slice(0, 4)}{e.time ? ` · ${e.time}` : ''} · <span className="muted">{relDay(e.date, today)}</span></div>
        {e.location && <div className="muted">📍 {e.location}</div>}
        {e.leadId && <div>Partner: <Link to={`/leads/${e.leadId}`}>{e.company || e.leadId}</Link></div>}
        {e.cost && <div className="muted">Cost: {e.cost}</div>}
        {e.notes && <div className="pre">{e.notes}</div>}
      </div>
      <div className="section-label">Checklist · {open.length} open</div>
      <ul className="list">
        {[...open, ...done].map((t) => (
          <li key={t.id} className="item">
            <button className={`check ${t.status === 'done' ? 'on' : ''}`} onClick={() => toggle.mutate(t.id)} aria-label="Toggle">✓</button>
            <span className={`grow ${t.status === 'done' ? 'done-text' : ''}`}>{t.task}</span>
            {t.status !== 'done' ? <DueTag date={t.due} today={today} /> : <span className="faint" style={{ fontSize: 12 }}>{t.completed && relDay(t.completed, today)}</span>}
            <button className="btn sm ghost icon" title="Delete" onClick={() => confirm('Delete this task?') && drop.mutate(t.id)}>✕</button>
          </li>
        ))}
      </ul>
      <form className="row card-pad" onSubmit={(ev) => { ev.preventDefault(); if (task.trim()) add.mutate(undefined); }}>
        <input type="text" className="grow" placeholder="New task…" value={task} onChange={(ev) => setTask(ev.target.value)} />
        <input type="date" value={due} onChange={(ev) => setDue(ev.target.value)} style={{ width: 150 }} />
        <button className="btn" disabled={!task.trim() || add.isPending}>Add</button>
      </form>
    </section>
  );
}

function EventForm({ value, onClose }: { value: Partial<CrmEvent> | null; onClose: () => void }) {
  const nav = useNavigate();
  const leads = useQuery({ queryKey: ['leads'], queryFn: api.leads, enabled: !!value });
  const [d, setD] = useState<Partial<CrmEvent>>({});
  useEffect(() => { if (value) setD(value); }, [value]);
  const save = useAction(() => api.saveEvent(d), { ok: 'Saved', onDone: (e) => { onClose(); nav(`/events/${e.id}`); } });
  const del = useAction(() => api.deleteEvent(d.id!), { ok: 'Deleted', onDone: () => { onClose(); nav('/events'); } });
  const s = (k: keyof CrmEvent) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value });
  const partners = (leads.data || []).filter((l) => l.stage !== 'disqualified' && l.stage !== 'new');

  return (
    <Modal open={!!value} onClose={onClose} title={d.id ? 'Edit event' : 'New event'} wide
      footer={<>
        {d.id && <button className="btn danger" style={{ marginRight: 'auto' }}
          onClick={() => confirm('Delete this event and its tasks?') && del.mutate(undefined)}>Delete</button>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!d.title?.trim() || !d.date || save.isPending} onClick={() => save.mutate(undefined)}>Save</button>
      </>}>
      <div className="fields">
        <label className="field wide"><span>Title *</span><input type="text" value={d.title || ''} onChange={s('title')} autoFocus /></label>
        <label className="field"><span>Type</span>
          <select value={d.type || 'Other'} onChange={s('type')}>{EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="field"><span>Status</span>
          <select value={d.status || 'planned'} onChange={s('status')}>{EVENT_STATUS.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="field"><span>Date *</span><input type="date" value={d.date || ''} onChange={s('date')} /></label>
        <label className="field"><span>Time</span><input type="text" placeholder="16:30-17:30" value={d.time || ''} onChange={s('time')} /></label>
        <label className="field wide"><span>Location</span><input type="text" value={d.location || ''} onChange={s('location')} /></label>
        <label className="field"><span>Partner company</span>
          <select value={d.leadId || ''} onChange={(e) => setD({ ...d, leadId: e.target.value, company: '' })}>
            <option value="">—</option>
            {d.leadId && !partners.some((p) => p.id === d.leadId) && <option value={d.leadId}>{d.company || d.leadId}</option>}
            {partners.map((l) => <option key={l.id} value={l.id}>{l.company}</option>)}
          </select></label>
        <label className="field"><span>Cost</span><input type="text" value={d.cost || ''} onChange={s('cost')} /></label>
        <label className="field wide"><span>Notes</span><textarea rows={3} value={d.notes || ''} onChange={s('notes')} /></label>
      </div>
    </Modal>
  );
}
