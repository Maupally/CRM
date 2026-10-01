import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mail, Phone, Plus, Trash2, Users } from 'lucide-react';
import { api } from '../api';
import { Avatar, Empty, ErrorBox, Loading, Modal, relDay, telHref, useAction, useToday } from '../components/ui';
import type { Person } from '../../shared/domain';

/** The people Martin works with: director, colleagues, teachers. Tasks and emails point at them. */
export function PeoplePage() {
  const q = useQuery({ queryKey: ['people'], queryFn: api.people });
  const today = useToday();
  const [edit, setEdit] = useState<Partial<Person> | null>(null);

  return (
    <>
      <div className="page-head">
        <div><h1>Zespół</h1><div className="sub">Dyrekcja, koordynatorzy, nauczyciele — do kogo idą zadania i maile. Najczęstsze kontakty są na górze.</div></div>
        <span className="spacer" />
        <button className="btn primary" onClick={() => setEdit({})}><Plus size={16} /> Dodaj osobę</button>
      </div>
      <section className="card">
        {q.isLoading ? <Loading /> : q.error ? <div className="pad"><ErrorBox error={q.error} /></div> : (
          <ul className="list">
            {(q.data || []).map((p) => (
              <li key={p.id} className="li" onClick={() => setEdit(p)} style={{ cursor: 'pointer' }}>
                <Avatar name={p.name} size="sm" />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="title trunc">{p.name}</div>
                  <div className="meta trunc">{[p.role, p.aliases && `„${p.aliases}”`].filter(Boolean).join(' · ') || 'bez funkcji'}</div>
                  <div className="meta trunc">{[p.email, p.phone].filter(Boolean).join(' · ') || <span style={{ color: 'var(--warn)' }}>brak e-maila i telefonu</span>}</div>
                </div>
                <span className="soft small hide-sm nowrap">{p.contacts ? `${p.contacts}× · ${relDay(p.lastContact, today)}` : ''}</span>
                {p.phone && <a className="btn sm icon" href={telHref(p.phone)} onClick={(e) => e.stopPropagation()} aria-label="Zadzwoń"><Phone size={14} /></a>}
                {p.email && <a className="btn sm icon" href={`mailto:${p.email}`} onClick={(e) => e.stopPropagation()} aria-label="Napisz"><Mail size={14} /></a>}
              </li>
            ))}
            {!q.data?.length && (
              <Empty icon={Users}>Pusto. Dodaj dyrektora, Patryka i resztę osób, do których wysyłasz maile —
                asystent będzie wiedział, kto to jest, i przypnie ich do zadań.</Empty>
            )}
          </ul>
        )}
      </section>
      <PersonForm value={edit} onClose={() => setEdit(null)} />
    </>
  );
}

export function PersonForm({ value, onClose, onSaved }: { value: Partial<Person> | null; onClose: () => void; onSaved?: (p: Person) => void }) {
  const [d, setD] = useState<Partial<Person>>({});
  useEffect(() => { if (value) setD(value); }, [value]);
  const save = useAction(() => api.savePerson(d), { ok: 'Zapisano', onDone: (p) => { onSaved?.(p); onClose(); } });
  const drop = useAction(() => api.deletePerson(d.id!), { ok: 'Usunięto', onDone: onClose });
  const f = (k: keyof Person, label: string, type = 'text', placeholder = '') => (
    <label className="field">{label}
      <input type={type} value={String(d[k] ?? '')} placeholder={placeholder} onChange={(e) => setD({ ...d, [k]: e.target.value })} />
    </label>
  );
  return (
    <Modal open={!!value} onClose={onClose} title={value?.id ? value.name : 'Nowa osoba'}
      footer={<>
        {value?.id && <button className="btn ghost danger" style={{ marginRight: 'auto' }} onClick={() => confirm('Usunąć z Zespołu?') && drop.mutate(undefined)}><Trash2 size={15} /></button>}
        <button className="btn" onClick={onClose}>Anuluj</button>
        <button className="btn primary" disabled={!d.name?.trim() || save.isPending} onClick={() => save.mutate(undefined)}>Zapisz</button>
      </>}>
      <div className="fields">
        {f('name', 'Imię i nazwisko', 'text', 'np. Patryk Nowak')}
        {f('role', 'Funkcja', 'text', 'np. Dyrektor szkoły')}
        {f('email', 'E-mail', 'email')}
        {f('phone', 'Telefon', 'tel')}
      </div>
      {f('aliases', 'Jak go nazywasz (dla asystenta)', 'text', 'np. dyrektor, szef, Patryk')}
      <label className="field">Notatki<textarea rows={2} value={d.notes || ''} onChange={(e) => setD({ ...d, notes: e.target.value })}
        placeholder="np. woli krótkie maile, decyduje o budżecie wydarzeń" /></label>
    </Modal>
  );
}
