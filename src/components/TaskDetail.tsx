import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, Share2, Mail, Trash2, Pencil, ChevronDown, FileText, Paperclip, X, Phone, UserRound } from 'lucide-react';
import { api } from '../api';
import { FileCard } from './Files';
import { DueTag, Modal, copyText, telHref, useAction, useToast, useToday } from './ui';
import { PersonForm } from '../pages/People';
import type { Material, Person, Task } from '../../shared/domain';

/** Share a ready-made text: the phone's share sheet (WhatsApp, Messenger, mail…) or the clipboard. */
export async function shareText(title: string, text: string, toast: (m: string) => void) {
  if (navigator.share) {
    try { await navigator.share({ title, text }); return; } catch { /* cancelled */ }
  }
  await copyText(text);
  toast('Skopiowano');
}

export interface Recipient { id?: number; name: string; role?: string; email: string; phone?: string }

function CopyField({ label, value, rows }: { label: string; value: string; rows?: number }) {
  const toast = useToast();
  return (
    <div className="copy-field">
      <div className="row between"><span className="small soft">{label}</span>
        <button className="btn sm ghost" onClick={() => { copyText(value); toast(`Skopiowano: ${label.toLowerCase()}`); }} disabled={!value}><Copy size={14} /> Kopiuj</button>
      </div>
      <div className={rows ? 'mtext' : 'mtext one'}>{value || <span className="faint">—</span>}</div>
    </div>
  );
}

/**
 * A ready-made text. An email shows To / Subject / Body as three separate copyable fields —
 * nobody wants to cut "Temat:" out of the body by hand.
 */
export function MaterialView({ m, onChange, onRemove, open, to, onSent }: {
  m: Material; onChange?: (m: Material) => void; onRemove?: () => void; open?: boolean;
  to?: Recipient; onSent?: () => void;
}) {
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  const isMail = m.subject !== undefined || /\bmail/i.test(m.title);
  const address = m.to || to?.email || '';
  return (
    <details className="material" open={open}>
      <summary><span className="grow trunc">{isMail && <Mail size={14} className="faint" style={{ verticalAlign: -2, marginRight: 6 }} />}{m.title}</span><ChevronDown size={16} className="faint" /></summary>
      <div className="mbody col tight">
        {edit && onChange ? (
          <>
            <input type="text" value={m.title} onChange={(e) => onChange({ ...m, title: e.target.value })} placeholder="Nazwa" />
            {isMail && <input type="email" value={m.to || ''} onChange={(e) => onChange({ ...m, to: e.target.value })} placeholder={to?.email || 'Do (e-mail)'} />}
            {isMail && <input type="text" value={m.subject || ''} onChange={(e) => onChange({ ...m, subject: e.target.value })} placeholder="Temat" />}
            <textarea rows={10} value={m.body} onChange={(e) => onChange({ ...m, body: e.target.value })} />
          </>
        ) : isMail ? (
          <>
            <CopyField label={to?.name && !m.to ? `Do — ${to.name}${to.role ? `, ${to.role}` : ''}` : 'Do'} value={address} />
            {!address && <div className="small" style={{ color: 'var(--warn)' }}>Brak adresu — wybierz osobę w polu „Do kogo” albo wpisz adres w edycji.</div>}
            <CopyField label="Temat" value={m.subject || ''} />
            <CopyField label="Treść" value={m.body} rows={8} />
          </>
        ) : <div className="mtext">{m.body}</div>}
        <div className="row wrap" style={{ gap: 4 }}>
          {isMail ? (
            <a className="btn sm" href={`mailto:${encodeURIComponent(address)}?subject=${encodeURIComponent(m.subject || '')}&body=${encodeURIComponent(m.body)}`}
              onClick={() => onSent?.()}><Mail size={14} /> Otwórz w poczcie</a>
          ) : (
            <>
              <button className="btn sm" onClick={() => { copyText(m.body); toast('Skopiowano'); }}><Copy size={14} /> Kopiuj</button>
              <button className="btn sm" onClick={() => shareText(m.title, m.body, toast)}><Share2 size={14} /> Wyślij dalej</button>
            </>
          )}
          {onChange && <button className="btn sm ghost" onClick={() => setEdit(!edit)}><Pencil size={14} /> {edit ? 'Gotowe' : 'Edytuj'}</button>}
          {onRemove && <button className="btn sm ghost danger" onClick={onRemove}><Trash2 size={14} /> Usuń</button>}
        </div>
      </div>
    </details>
  );
}

/** "Do kogo": the person a task is for, with phone and email at hand, or a picker when nobody is set. */
export function PersonPicker({ personId, onChange }: { personId: number; onChange: (id: number) => void }) {
  const people = useQuery({ queryKey: ['people'], queryFn: api.people });
  const [adding, setAdding] = useState<Partial<Person> | null>(null);
  const p = (people.data || []).find((x) => x.id === personId);
  return (
    <div className="person-pick">
      <div className="small soft row" style={{ gap: 6 }}><UserRound size={14} /> Do kogo</div>
      {p ? (
        <div className="row wrap" style={{ gap: 8 }}>
          <div className="grow" style={{ minWidth: 0 }}>
            <b>{p.name}</b>{p.role && <span className="soft"> · {p.role}</span>}
            <div className="small soft trunc">{[p.email, p.phone].filter(Boolean).join(' · ') || <span style={{ color: 'var(--warn)' }}>brak e-maila i telefonu</span>}</div>
          </div>
          {p.phone && <a className="btn sm icon" href={telHref(p.phone)} aria-label="Zadzwoń"><Phone size={14} /></a>}
          <button className="btn sm ghost" onClick={() => setAdding(p)}><Pencil size={14} /></button>
          <button className="btn sm ghost icon" onClick={() => onChange(0)} aria-label="Odepnij osobę"><X size={14} /></button>
        </div>
      ) : (
        <div className="row wrap" style={{ gap: 6 }}>
          <select value="" onChange={(e) => e.target.value === 'new' ? setAdding({}) : onChange(Number(e.target.value))} style={{ flex: 1, minWidth: 180 }}>
            <option value="">— wybierz osobę —</option>
            {(people.data || []).map((x) => <option key={x.id} value={x.id}>{x.name}{x.role ? ` · ${x.role}` : ''}</option>)}
            <option value="new">+ Dodaj nową osobę…</option>
          </select>
        </div>
      )}
      <PersonForm value={adding} onClose={() => setAdding(null)} onSaved={(np) => onChange(np.id)} />
    </div>
  );
}

/** Everything about one task: where it belongs, who it is for, its ready-made materials and attached files. */
export function TaskDetail({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const today = useToday();
  const kb = useQuery({ queryKey: ['knowledge'], queryFn: api.knowledge, enabled: !!task });
  const people = useQuery({ queryKey: ['people'], queryFn: api.people, enabled: !!task });
  const [materials, setMaterials] = useState<Material[]>([]);
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [attached, setAttached] = useState<number[]>([]);
  const [personId, setPersonId] = useState(0);
  useEffect(() => {
    if (task) { setMaterials(task.materials); setText(task.task); setDue(task.due); setAttached(task.attachments); setPersonId(task.personId || 0); }
  }, [task]);
  const dirty = !!task && (JSON.stringify(materials) !== JSON.stringify(task.materials) || text !== task.task || due !== task.due
    || attached.join() !== task.attachments.join() || personId !== (task.personId || 0));

  const save = useAction(() => api.saveTask({ id: task!.id, task: text, due, materials, attachments: attached, personId }), { ok: 'Zapisano', onDone: onClose });
  const toggle = useAction(() => api.saveTask({ id: task!.id, task: text, due, materials, attachments: attached, personId,
    status: task!.status === 'done' ? 'todo' : 'done' }), { ok: (t) => t.status === 'done' ? 'Zrobione' : 'Przywrócone', onDone: onClose });
  const drop = useAction(() => api.deleteTask(task!.id), { ok: 'Usunięto', onDone: onClose });
  const touch = useAction((id: number) => api.touchPerson(id));
  if (!task) return null;
  const files = (kb.data || []).filter((k) => attached.includes(k.id));
  const p = (people.data || []).find((x) => x.id === personId);
  const to: Recipient | undefined = p ? { id: p.id, name: p.name, role: p.role, email: p.email, phone: p.phone } : undefined;

  return (
    <Modal open={!!task} onClose={() => (!dirty || confirm('Masz niezapisane zmiany. Zamknąć bez zapisu?')) && onClose()} wide
      title={task.status === 'done' ? <span className="done-text">{task.task}</span> : task.task}
      footer={<>
        <button className="btn ghost danger" style={{ marginRight: 'auto' }} onClick={() => confirm('Usunąć zadanie?') && drop.mutate(undefined)}><Trash2 size={15} /></button>
        {dirty && <button className="btn" onClick={() => save.mutate(undefined)} disabled={save.isPending}>Zapisz zmiany</button>}
        <button className="btn primary" onClick={() => toggle.mutate(undefined)} disabled={toggle.isPending}>
          <Check size={16} /> {task.status === 'done' ? 'Przywróć' : 'Zrobione'}
        </button>
      </>}>
      <div className="row wrap" style={{ gap: 8 }}>
        {task.due && <DueTag date={task.due} today={today} />}
        {task.eventTitle && <Link className="tag soon" to={`/wydarzenia/${task.eventId}`} onClick={onClose}>{task.eventTitle}</Link>}
        {task.company && <Link className="tag" to={`/firmy/${task.leadId}`} onClick={onClose}>{task.company}</Link>}
      </div>
      <PersonPicker personId={personId} onChange={setPersonId} />
      <div className="fields">
        <label className="field wide">Zadanie<input type="text" value={text} onChange={(e) => setText(e.target.value)} /></label>
        <label className="field">Termin<input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
      </div>
      {task.notes && <div className="soft pre small">{task.notes}</div>}

      <div className="col tight">
        <div className="row between"><b>Gotowe materiały</b>
          <span className="row" style={{ gap: 4 }}>
            <button className="btn sm ghost" onClick={() => setMaterials([...materials, { title: 'Mail', subject: '', body: '' }])}><Mail size={14} /> Mail</button>
          </span></div>
        {materials.map((m, i) => (
          <MaterialView key={`${i}-${materials.length}`} m={m} open={materials.length === 1} to={to}
            onSent={() => personId && touch.mutate(personId)}
            onChange={(nm) => setMaterials(materials.map((x, j) => j === i ? nm : x))}
            onRemove={() => setMaterials(materials.filter((_, j) => j !== i))} />
        ))}
        {!materials.length && <div className="soft small">Brak. Poproś asystenta: „przygotuj do tego zadania maila do dyrektora”.</div>}
      </div>

      {files.length > 0 && (
        <div className="col tight">
          <b>Załączniki</b>
          <div className="files">{files.map((f) => (
            <div key={f.id} className="row" style={{ gap: 6 }}>
              <div className="grow" style={{ minWidth: 0 }}><FileCard f={f} /></div>
              <button className="btn sm ghost icon" title="Odepnij od zadania (plik zostaje w Bazie wiedzy)" aria-label="Odepnij"
                onClick={() => setAttached(attached.filter((id) => id !== f.id))}><X size={15} /></button>
            </div>
          ))}</div>
        </div>
      )}
    </Modal>
  );
}

/** One project task in a list: tick it off, or tap to open its materials. */
export function ProjectTaskRow({ t, today, onOpen, sub }: { t: Task; today: string; onOpen: (t: Task) => void; sub?: string }) {
  const toggle = useAction((id: string) => api.toggleTask(id));
  const done = t.status === 'done';
  const meta = [sub, t.person && `do: ${t.person.name}`].filter(Boolean).join(' · ');
  return (
    <li className="li">
      <button className={`check ${done ? 'on' : ''}`} onClick={() => toggle.mutate(t.id)} aria-label={done ? 'Przywróć' : 'Zrobione'}>✓</button>
      <button className="grow plain" style={{ textAlign: 'left', minWidth: 0 }} onClick={() => onOpen(t)}>
        <div className={`small ${done ? 'done-text' : ''}`}>{t.task}</div>
        {(meta || t.materials.length > 0 || t.attachments.length > 0) && (
          <div className="meta row" style={{ gap: 8 }}>
            {meta && <span className="trunc">{meta}</span>}
            {t.materials.length > 0 && <span className="row" style={{ gap: 3 }}><FileText size={12} /> {t.materials.length}</span>}
            {t.attachments.length > 0 && <span className="row" style={{ gap: 3 }}><Paperclip size={12} /> {t.attachments.length}</span>}
          </div>
        )}
      </button>
      {!done && t.due && <DueTag date={t.due} today={today} />}
    </li>
  );
}
