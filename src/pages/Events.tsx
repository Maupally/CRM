import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, MapPin, Pencil, Trash2, X, PartyPopper } from 'lucide-react';
import { api } from '../api';
import { Empty, ErrorBox, Loading, Modal, relDay, useAction, useToday, weekdayName } from '../components/ui';
import { ProjectTaskRow, TaskDetail } from '../components/TaskDetail';
import { EVENT_STATUS, EVENT_STATUS_LABEL, EVENT_TYPES, EVENT_TYPE_LABEL, shortDate, type CrmEvent, type Task } from '../../shared/domain';

export function EventsPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const today = useToday();
  const ev = useQuery({ queryKey: ['events'], queryFn: api.events });
  const tasks = useQuery({ queryKey: ['tasks'], queryFn: api.tasks });
  const [editing, setEditing] = useState<Partial<CrmEvent> | null>(null);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    if (sp.get('nowe')) { setEditing({ type: 'Open day', status: 'planned', date: today }); setSp({}, { replace: true }); }
  }, [sp, setSp, today]);

  if (ev.isLoading || tasks.isLoading) return <Loading />;
  if (ev.error) return <ErrorBox error={ev.error} />;
  const events = ev.data!;
  const shown = events.filter((e) => showPast || e.date >= today || e.id === id);
  const current = events.find((e) => e.id === id) || null;

  return (
    <>
      <div className="page-head">
        <div><h1>Wydarzenia</h1><div className="sub">Dni otwarte, targi, sponsoring — każde z listą rzeczy do przygotowania.</div></div>
        <span className="spacer" />
        <label className="row small soft"><input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> minione</label>
        <button className="btn primary" onClick={() => setEditing({ type: 'Open day', status: 'planned', date: today })}><Plus size={16} /> Nowe wydarzenie</button>
      </div>
      <div className="grid halves">
        <section className="card">
          <ul className="list">
            {shown.map((e) => {
              const done = (e.totalTasks || 0) - (e.openTasks || 0);
              return (
                <li key={e.id} className="li click" style={e.id === id ? { background: 'var(--tint)' } : undefined} onClick={() => nav(`/wydarzenia/${e.id}`)}>
                  <div style={{ width: 52, textAlign: 'center' }}>
                    <div className="mono" style={{ fontWeight: 600, fontSize: 20, lineHeight: 1 }}>{e.date.slice(8)}</div>
                    <div className="eyebrow" style={{ color: 'var(--faint)', marginTop: 4 }}>{e.date.slice(5, 7)} · {weekdayName(e.date)}</div>
                  </div>
                  <div className="grow">
                    <div className="row wrap" style={{ gap: 6 }}><span className="title">{e.title}</span><span className="tag">{EVENT_TYPE_LABEL[e.type] || e.type}</span>
                      {e.status !== 'planned' && <span className="tag soon">{EVENT_STATUS_LABEL[e.status] || e.status}</span>}</div>
                    <div className="meta trunc">{[e.time, e.location, e.company].filter(Boolean).join(' · ')}</div>
                    {!!e.totalTasks && (
                      <div className="row" style={{ marginTop: 7 }}>
                        <div className="progress grow"><div style={{ width: `${(done / e.totalTasks) * 100}%` }} /></div>
                        <span className="faint small mono">{done}/{e.totalTasks}</span>
                      </div>
                    )}
                  </div>
                  <span className="soft small nowrap hide-sm">{relDay(e.date, today)}</span>
                </li>
              );
            })}
            {!shown.length && <Empty icon={PartyPopper}>Brak nadchodzących wydarzeń.</Empty>}
          </ul>
        </section>

        {current ? (
          <EventDetail key={current.id} event={current} tasks={(tasks.data || []).filter((t) => t.eventId === current.id)}
            onEdit={() => setEditing(current)} onClose={() => nav('/wydarzenia')} />
        ) : (
          <section className="card pad soft hide-sm">Wybierz wydarzenie, żeby zobaczyć checklistę.</section>
        )}
      </div>
      <EventForm value={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function EventDetail({ event: e, tasks, onEdit, onClose }: { event: CrmEvent; tasks: Task[]; onEdit: () => void; onClose: () => void }) {
  const today = useToday();
  const [task, setTask] = useState('');
  const [due, setDue] = useState('');
  const add = useAction(() => api.saveTask({ eventId: e.id, task, due }), { onDone: () => { setTask(''); setDue(''); } });
  const [detail, setDetail] = useState<Task | null>(null);
  const open = tasks.filter((t) => t.status !== 'done');
  const done = tasks.filter((t) => t.status === 'done');

  return (
    <section className="card">
      <div className="card-head">
        <h2>{e.title}</h2>
        <button className="btn sm" onClick={onEdit}><Pencil size={14} /> Edytuj</button>
        <button className="btn sm ghost icon only-sm" onClick={onClose} aria-label="Zamknij"><X size={16} /></button>
      </div>
      <div className="col tight" style={{ padding: '0 20px 14px' }}>
        <div>{weekdayName(e.date)} {shortDate(e.date)}.{e.date.slice(0, 4)}{e.time ? ` · ${e.time}` : ''} · <span className="soft">{relDay(e.date, today)}</span></div>
        {e.location && <div className="soft row"><MapPin size={14} /> {e.location}</div>}
        {e.leadId && <div>Partner: <Link to={`/firmy/${e.leadId}`} style={{ color: 'var(--accent)' }}>{e.company || e.leadId}</Link></div>}
        {e.cost && <div className="soft">Koszt: {e.cost}</div>}
        {e.notes && <div className="pre">{e.notes}</div>}
      </div>
      <div className="group-label">Checklista · {open.length} otwartych</div>
      <ul className="list">
        {[...open, ...done].map((t) => <ProjectTaskRow key={t.id} t={t} today={today} onOpen={setDetail} />)}
      </ul>
      <TaskDetail task={detail} onClose={() => setDetail(null)} />
      <form className="row wrap pad" onSubmit={(ev) => { ev.preventDefault(); if (task.trim()) add.mutate(undefined); }}>
        <input type="text" className="grow" placeholder="Nowe zadanie…" value={task} onChange={(ev) => setTask(ev.target.value)} style={{ minWidth: 180 }} />
        <input type="date" value={due} onChange={(ev) => setDue(ev.target.value)} style={{ width: 160 }} />
        <button className="btn" disabled={!task.trim() || add.isPending}>Dodaj</button>
      </form>
    </section>
  );
}

function EventForm({ value, onClose }: { value: Partial<CrmEvent> | null; onClose: () => void }) {
  const nav = useNavigate();
  const leads = useQuery({ queryKey: ['leads'], queryFn: api.leads, enabled: !!value });
  const [d, setD] = useState<Partial<CrmEvent>>({});
  useEffect(() => { if (value) setD(value); }, [value]);
  const save = useAction(() => api.saveEvent(d), { ok: 'Zapisano', onDone: (e) => { onClose(); nav(`/wydarzenia/${e.id}`); } });
  const del = useAction(() => api.deleteEvent(d.id!), { ok: 'Usunięto', onDone: () => { onClose(); nav('/wydarzenia'); } });
  const s = (k: keyof CrmEvent) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value });
  const partners = (leads.data || []).filter((l) => l.stage !== 'disqualified' && l.stage !== 'new');

  return (
    <Modal open={!!value} onClose={onClose} title={d.id ? 'Edytuj wydarzenie' : 'Nowe wydarzenie'} wide
      footer={<>
        {d.id && <button className="btn ghost danger" style={{ marginRight: 'auto' }}
          onClick={() => confirm('Usunąć wydarzenie razem z zadaniami?') && del.mutate(undefined)}><Trash2 size={15} /> Usuń</button>}
        <button className="btn" onClick={onClose}>Anuluj</button>
        <button className="btn primary" disabled={!d.title?.trim() || !d.date || save.isPending} onClick={() => save.mutate(undefined)}>Zapisz</button>
      </>}>
      <div className="fields">
        <label className="field wide">Nazwa *<input type="text" value={d.title || ''} onChange={s('title')} autoFocus /></label>
        <label className="field">Typ
          <select value={d.type || 'Other'} onChange={s('type')}>{EVENT_TYPES.map((t) => <option key={t} value={t}>{EVENT_TYPE_LABEL[t]}</option>)}</select></label>
        <label className="field">Status
          <select value={d.status || 'planned'} onChange={s('status')}>{EVENT_STATUS.map((t) => <option key={t} value={t}>{EVENT_STATUS_LABEL[t]}</option>)}</select></label>
        <label className="field">Data *<input type="date" value={d.date || ''} onChange={s('date')} /></label>
        <label className="field">Godzina<input type="text" placeholder="16:30-17:30" value={d.time || ''} onChange={s('time')} /></label>
        <label className="field wide">Miejsce<input type="text" value={d.location || ''} onChange={s('location')} /></label>
        <label className="field">Firma partnerska
          <select value={d.leadId || ''} onChange={(e) => setD({ ...d, leadId: e.target.value, company: '' })}>
            <option value="">—</option>
            {d.leadId && !partners.some((p) => p.id === d.leadId) && <option value={d.leadId}>{d.company || d.leadId}</option>}
            {partners.map((l) => <option key={l.id} value={l.id}>{l.company}</option>)}
          </select></label>
        <label className="field">Koszt<input type="text" value={d.cost || ''} onChange={s('cost')} /></label>
        <label className="field wide">Notatki<textarea rows={3} value={d.notes || ''} onChange={s('notes')} /></label>
      </div>
    </Modal>
  );
}
