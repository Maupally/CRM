import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { DateChips } from './ActivityForms';
import { Modal, useAction, useConfig } from './ui';

const EMPTY = { company: '', segment: '', industry: '', city: '', phone: '', email: '', web: '', person: '', notes: '', source: 'Manual', next: '' };

export function AddCompany({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cfg = useConfig();
  const nav = useNavigate();
  const [d, setD] = useState(EMPTY);
  const act = useAction(() => api.createLead(d), {
    ok: (l) => `Dodano: ${l.company}`,
    onDone: (l) => { setD(EMPTY); onClose(); nav(`/firmy/${l.id}`); },
  });
  const f = (k: keyof typeof EMPTY, label: string, type = 'text', inputMode?: 'tel' | 'email' | 'url') => (
    <label className="field">{label}
      <input type={type} inputMode={inputMode} value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} />
    </label>
  );
  const submit = (e?: FormEvent) => { e?.preventDefault(); if (d.company.trim()) act.mutate(undefined); };
  return (
    <Modal open={open} onClose={onClose} title="Nowa firma" wide
      footer={<><button className="btn" onClick={onClose}>Anuluj</button>
        <button className="btn primary" disabled={!d.company.trim() || act.isPending} onClick={() => submit()}>Dodaj firmę</button></>}>
      <form onSubmit={submit} className="fields">
        <label className="field wide">Nazwa firmy *
          <input type="text" autoFocus value={d.company} onChange={(e) => setD({ ...d, company: e.target.value })} />
        </label>
        <label className="field">Segment
          <select value={d.segment} onChange={(e) => setD({ ...d, segment: e.target.value })}>
            <option value="">NIEZNANA</option>
            {cfg.data?.segments.filter((s) => s.name !== 'NIEZNANA').map((s) => <option key={s.name}>{s.name}</option>)}
          </select>
        </label>
        {f('industry', 'Branża')}
        {f('city', 'Miasto')}
        {f('phone', 'Telefon', 'tel', 'tel')}
        {f('email', 'E-mail', 'email', 'email')}
        {f('web', 'Strona www', 'text', 'url')}
        {f('person', 'Osoba / stanowisko')}
        {f('source', 'Źródło')}
        <label className="field wide">Notatki
          <textarea rows={2} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
        </label>
        <div className="field wide">Pierwszy telefon
          <DateChips allowNone value={d.next} onChange={(next) => setD({ ...d, next })} />
        </div>
        <button hidden />
      </form>
      <div className="hint">Duplikaty są blokowane — „ABC Sp. z o.o.” i „abc” to ta sama firma.</div>
    </Modal>
  );
}
