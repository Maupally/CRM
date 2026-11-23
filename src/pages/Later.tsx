import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BellRing, Check, ExternalLink, Lightbulb, Trash2, Undo2, X } from 'lucide-react';
import { api } from '../api';
import { Empty, ErrorBox, Loading, Modal, relDay, useAction, useToday } from '../components/ui';
import { IDEA_STATUS_LABEL, addDays, shortDate, type Idea } from '../../shared/domain';

/**
 * Na później: things to come back to, not tied to a company, event or task. Saved by saying it in claude.ai
 * ("zapamiętaj, przyda się przy zajęciach dodatkowych"); Claude brings them up on their day and when the talk touches them.
 */
export function LaterPage() {
  const q = useQuery({ queryKey: ['ideas'], queryFn: api.ideas });
  const today = useToday();
  const [edit, setEdit] = useState<Idea | null>(null);
  const [closed, setClosed] = useState(false);
  const status = useAction((a: { i: Idea; status: Idea['status'] }) => api.saveIdea({ id: a.i.id, status: a.status }),
    { ok: (r) => (r.status === 'open' ? 'Wraca na listę' : `${IDEA_STATUS_LABEL[r.status]}: ${r.title}`) });

  const groups = useMemo(() => {
    const m = new Map<string, Idea[]>();
    for (const i of (q.data || []).filter((x) => x.status === 'open')) m.set(i.topic || 'Bez tematu', [...(m.get(i.topic || 'Bez tematu') || []), i]);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, 'pl'));
  }, [q.data]);

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const all = q.data!;
  const done = all.filter((i) => i.status !== 'open');
  const due = all.filter((i) => i.status === 'open' && i.remindOn && i.remindOn <= today);

  return (
    <>
      <div className="page-head">
        <div><h1>Na później</h1><div className="sub">Firmy, oferty i pomysły, które dziś nie są potrzebne. Claude przypomni o nich w swoim czasie — w dniu przypomnienia, gdy rozmowa zejdzie na ich temat, i od czasu do czasu sam z siebie.</div></div>
      </div>

      {due.length > 0 && (
        <section className="card pad row" style={{ marginBottom: 16, gap: 10, borderColor: 'var(--warn)' }}>
          <BellRing size={18} style={{ color: 'var(--warn)' }} />
          <span className="grow"><b>Dziś wraca: {due.map((i) => i.title).join(', ')}</b></span>
        </section>
      )}

      {!groups.length ? (
        <section className="card"><Empty icon={Lightbulb}>Lista jest pusta. Powiedz w claude.ai np. „zapamiętaj Dziką Drogę — zajęcia survivalowe dla szkół, to temat dyrekcji, wróćmy do tego przy zajęciach dodatkowych na przyszły rok”.</Empty></section>
      ) : groups.map(([topic, items]) => (
        <section key={topic} className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><h2>{topic}</h2><span className="count">{items.length}</span></div>
          <ul className="list">
            {items.map((i) => (
              <li key={i.id} className="li" style={{ alignItems: 'flex-start' }}>
                <button className="grow col" style={{ gap: 3, textAlign: 'left', background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', minWidth: 0 }} onClick={() => setEdit(i)}>
                  <b>{i.title}</b>
                  {i.note && <span className="small soft clamp2">{i.note}</span>}
                  <span className="row wrap small" style={{ gap: 6 }}>
                    {i.whenRelevant && <span className="tag soon">wraca: {i.whenRelevant}</span>}
                    {i.remindOn && <span className={`tag ${i.remindOn <= today ? 'today' : ''}`}>przypomnienie {shortDate(i.remindOn)}{relDay(i.remindOn, today) !== shortDate(i.remindOn) ? ` (${relDay(i.remindOn, today)})` : ''}</span>}
                    {i.owner && <span className="tag">temat: {i.owner}</span>}
                    {i.contact && <span className="soft">{i.contact}</span>}
                  </span>
                </button>
                <div className="row" style={{ gap: 4 }}>
                  {i.url && <a className="btn sm icon" href={i.url} target="_blank" rel="noreferrer" aria-label="Otwórz stronę"><ExternalLink size={14} /></a>}
                  <button className="btn sm" title="Wykorzystane" onClick={() => status.mutate({ i, status: 'used' })}><Check size={14} /></button>
                  <button className="btn sm ghost" title="Odpuść" onClick={() => status.mutate({ i, status: 'dropped' })}><X size={14} /></button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {done.length > 0 && (
        <section className="card" style={{ marginTop: 6 }}>
          <div className="card-head"><h2>Zamknięte</h2><button className="btn sm ghost" onClick={() => setClosed(!closed)}>{closed ? 'Ukryj' : `Pokaż (${done.length})`}</button></div>
          {closed && (
            <ul className="list">
              {done.map((i) => (
                <li key={i.id} className="li">
                  <span className="grow soft"><s>{i.title}</s> · {IDEA_STATUS_LABEL[i.status]}</span>
                  <button className="btn sm ghost" onClick={() => status.mutate({ i, status: 'open' })}><Undo2 size={14} /> Przywróć</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <IdeaForm value={edit} onClose={() => setEdit(null)} />
    </>
  );
}

function IdeaForm({ value, onClose }: { value: Idea | null; onClose: () => void }) {
  const today = useToday();
  const [d, setD] = useState<Partial<Idea>>({});
  useEffect(() => { if (value) setD(value); }, [value]);
  const save = useAction(() => api.saveIdea(d), { ok: 'Zapisano', onDone: onClose });
  const drop = useAction(() => api.deleteIdea(d.id!), { ok: 'Usunięto', onDone: onClose });
  const set = (k: keyof Idea) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value });
  const inMonths = (m: number) => { const x = new Date(`${today}T12:00:00`); x.setMonth(x.getMonth() + m); return x.toISOString().slice(0, 10); };
  return (
    <Modal open={!!value} onClose={onClose} title={value?.title || ''}
      footer={<>
        <button className="btn ghost danger" style={{ marginRight: 'auto' }} onClick={() => confirm('Usunąć na dobre?') && drop.mutate(undefined)}><Trash2 size={15} /></button>
        <button className="btn" onClick={onClose}>Anuluj</button>
        <button className="btn primary" disabled={!d.title?.trim() || save.isPending} onClick={() => save.mutate(undefined)}>Zapisz</button>
      </>}>
      <label className="field">Co<input value={d.title || ''} onChange={set('title')} /></label>
      <div className="fields">
        <label className="field">Temat<input value={d.topic || ''} onChange={set('topic')} placeholder="np. zajęcia dodatkowe" /></label>
        <label className="field">Czyj to temat<input value={d.owner || ''} onChange={set('owner')} placeholder="np. dyrekcja" /></label>
        <label className="field wide">Kiedy wraca (słowami)<input value={d.whenRelevant || ''} onChange={set('whenRelevant')} placeholder="np. przy ustalaniu zajęć dodatkowych na 2027/28" /></label>
        <label className="field">Przypomnij dnia<input type="date" value={d.remindOn || ''} onChange={set('remindOn')} />
          <span className="row wrap" style={{ gap: 4 }}>
            <button type="button" className="btn sm" onClick={() => setD({ ...d, remindOn: addDays(today, 14) })}>za 2 tyg.</button>
            <button type="button" className="btn sm" onClick={() => setD({ ...d, remindOn: inMonths(3) })}>za 3 mies.</button>
            {d.remindOn && <button type="button" className="btn sm ghost" onClick={() => setD({ ...d, remindOn: '' })}>bez daty</button>}
          </span>
        </label>
        <label className="field">Kontakt<input value={d.contact || ''} onChange={set('contact')} /></label>
        <label className="field wide">Link<input value={d.url || ''} onChange={set('url')} /></label>
      </div>
      <label className="field">Notatka<textarea rows={4} value={d.note || ''} onChange={set('note')} /></label>
    </Modal>
  );
}
