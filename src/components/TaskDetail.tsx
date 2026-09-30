import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, Share2, Mail, Trash2, Pencil, ChevronDown, Plus, FileText, Paperclip, X } from 'lucide-react';
import { api } from '../api';
import { FileCard } from './Files';
import { DueTag, Modal, copyText, useAction, useToast, useToday } from './ui';
import type { Material, Task } from '../../shared/domain';

/** Share a ready-made text: the phone's share sheet (WhatsApp, Messenger, mail…) or the clipboard. */
export async function shareText(title: string, text: string, toast: (m: string) => void) {
  if (navigator.share) {
    try { await navigator.share({ title, text }); return; } catch { /* cancelled */ }
  }
  await copyText(text);
  toast('Skopiowano');
}

export function MaterialView({ m, onChange, onRemove, open }: { m: Material; onChange?: (m: Material) => void; onRemove?: () => void; open?: boolean }) {
  const toast = useToast();
  const [edit, setEdit] = useState(false);
  return (
    <details className="material" open={open}>
      <summary><span className="grow trunc">{m.title}</span><ChevronDown size={16} className="faint" /></summary>
      <div className="mbody col tight">
        {edit && onChange ? (
          <>
            <input type="text" value={m.title} onChange={(e) => onChange({ ...m, title: e.target.value })} />
            <textarea rows={10} value={m.body} onChange={(e) => onChange({ ...m, body: e.target.value })} />
          </>
        ) : <div className="mtext">{m.body}</div>}
        <div className="row wrap" style={{ gap: 4 }}>
          <button className="btn sm" onClick={() => { copyText(m.body); toast('Skopiowano'); }}><Copy size={14} /> Kopiuj</button>
          <button className="btn sm" onClick={() => shareText(m.title, m.body, toast)}><Share2 size={14} /> Wyślij dalej</button>
          <a className="btn sm ghost" href={`mailto:?subject=${encodeURIComponent(m.title)}&body=${encodeURIComponent(m.body)}`}><Mail size={14} /> Mail</a>
          {onChange && <button className="btn sm ghost" onClick={() => setEdit(!edit)}><Pencil size={14} /> {edit ? 'Gotowe' : 'Edytuj'}</button>}
          {onRemove && <button className="btn sm ghost danger" onClick={onRemove}><Trash2 size={14} /> Usuń</button>}
        </div>
      </div>
    </details>
  );
}

/** Everything about one task: where it belongs, its ready-made materials and attached files. */
export function TaskDetail({ task, onClose }: { task: Task | null; onClose: () => void }) {
  const today = useToday();
  const kb = useQuery({ queryKey: ['knowledge'], queryFn: api.knowledge, enabled: !!task });
  const [materials, setMaterials] = useState<Material[]>([]);
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [attached, setAttached] = useState<number[]>([]);
  useEffect(() => { if (task) { setMaterials(task.materials); setText(task.task); setDue(task.due); setAttached(task.attachments); } }, [task]);
  const dirty = !!task && (JSON.stringify(materials) !== JSON.stringify(task.materials) || text !== task.task || due !== task.due
    || attached.join() !== task.attachments.join());

  const save = useAction(() => api.saveTask({ id: task!.id, task: text, due, materials, attachments: attached }), { ok: 'Zapisano', onDone: onClose });
  const toggle = useAction(() => api.toggleTask(task!.id), { ok: (t) => t.status === 'done' ? 'Zrobione' : 'Przywrócone', onDone: onClose });
  const drop = useAction(() => api.deleteTask(task!.id), { ok: 'Usunięto', onDone: onClose });
  if (!task) return null;
  const files = (kb.data || []).filter((k) => attached.includes(k.id));

  return (
    <Modal open={!!task} onClose={() => (!dirty || confirm('Masz niezapisane zmiany. Zamknąć bez zapisu?')) && onClose()} wide title={task.status === 'done' ? <span className="done-text">{task.task}</span> : task.task}
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
      <div className="fields">
        <label className="field wide">Zadanie<input type="text" value={text} onChange={(e) => setText(e.target.value)} /></label>
        <label className="field">Termin<input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
      </div>
      {task.notes && <div className="soft pre small">{task.notes}</div>}

      <div className="col tight">
        <div className="row between"><b>Gotowe materiały</b>
          <button className="btn sm ghost" onClick={() => setMaterials([...materials, { title: 'Nowy tekst', body: '' }])}><Plus size={14} /> Dodaj</button></div>
        {materials.map((m, i) => (
          <MaterialView key={`${i}-${materials.length}`} m={m} open={materials.length === 1} onChange={(nm) => setMaterials(materials.map((x, j) => j === i ? nm : x))}
            onRemove={() => setMaterials(materials.filter((_, j) => j !== i))} />
        ))}
        {!materials.length && <div className="soft small">Brak. Poproś asystenta: „przygotuj do tego zadania post i mail do rodziców”.</div>}
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
  return (
    <li className="li">
      <button className={`check ${done ? 'on' : ''}`} onClick={() => toggle.mutate(t.id)} aria-label={done ? 'Przywróć' : 'Zrobione'}>✓</button>
      <button className="grow plain" style={{ textAlign: 'left', minWidth: 0 }} onClick={() => onOpen(t)}>
        <div className={`small ${done ? 'done-text' : ''}`}>{t.task}</div>
        {(sub || t.materials.length > 0 || t.attachments.length > 0) && (
          <div className="meta row" style={{ gap: 8 }}>
            {sub && <span className="trunc">{sub}</span>}
            {t.materials.length > 0 && <span className="row" style={{ gap: 3 }}><FileText size={12} /> {t.materials.length}</span>}
            {t.attachments.length > 0 && <span className="row" style={{ gap: 3 }}><Paperclip size={12} /> {t.attachments.length}</span>}
          </div>
        )}
      </button>
      {!done && t.due && <DueTag date={t.due} today={today} />}
    </li>
  );
}
