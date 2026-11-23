import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Hourglass, Minus, Plus, Target, Trash2, TrendingUp, AlarmClock } from 'lucide-react';
import { api } from '../api';
import { Empty, ErrorBox, Loading, Modal, StatTile, relDay, useAction, useToday } from '../components/ui';
import { shortDate, type B2cItem } from '../../shared/domain';

const pct = (i: B2cItem) => i.target ? Math.min(100, Math.round((i.done / i.target) * 100)) : 0;
const left = (i: B2cItem) => Math.max(0, i.target - i.done);

/**
 * B2C progress: what is left and how much got done. Standalone for now — counts are added here
 * or from claude.ai through the connector ("zadzwoniłem do 5 rodziców").
 */
export function B2cPage() {
  const q = useQuery({ queryKey: ['b2c'], queryFn: api.b2c });
  const today = useToday();
  const [edit, setEdit] = useState<Partial<B2cItem> | null>(null);
  const [step, setStep] = useState<{ item: B2cItem; sign: 1 | -1 } | null>(null);
  const bump = useAction((a: { id: number; delta: number }) => api.b2cProgress(a.id, a.delta));

  const groups = useMemo(() => {
    const m = new Map<string, B2cItem[]>();
    for (const i of q.data || []) m.set(i.category || 'Inne', [...(m.get(i.category || 'Inne') || []), i]);
    return [...m.entries()];
  }, [q.data]);

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const all = q.data!;
  const withTarget = all.filter((i) => i.target);
  const doneAll = withTarget.reduce((n, i) => n + Math.min(i.done, i.target), 0);
  const targetAll = withTarget.reduce((n, i) => n + i.target, 0);
  const finished = withTarget.filter((i) => i.done >= i.target).length;
  const week = all.reduce((n, i) => n + i.week, 0);
  const late = withTarget.filter((i) => i.due && i.due < today && left(i)).length;

  return (
    <>
      <div className="page-head">
        <div><h1>B2C</h1><div className="sub">Cele z rekrutacji i pracy z rodzicami — ile zrobione, ile zostało. Licznik zwiększasz tutaj albo mówiąc w claude.ai.</div></div>
        <span className="spacer" />
      </div>

      {all.length > 0 && (
        <div className="grid kpis" style={{ marginBottom: 18 }}>
          <StatTile label="Wykonanie" value={`${targetAll ? Math.round((doneAll / targetAll) * 100) : 0}%`} icon={Target} tone="violet" hint={`${doneAll} z ${targetAll}`} />
          <StatTile label="Zostało" value={targetAll - doneAll} icon={Hourglass} tone="amber" hint={`${withTarget.length - finished} celów w toku`} />
          <StatTile label="Zrobione cele" value={finished} icon={CheckCircle2} tone="green" hint={`z ${withTarget.length}`} />
          <StatTile label="Ostatnie 7 dni" value={`+${week}`} icon={TrendingUp} hint="dopisane do liczników" />
          {late > 0 && <StatTile label="Po terminie" value={late} icon={AlarmClock} tone="red" hint="niedokończone" />}
        </div>
      )}

      {!all.length ? (
        <section className="card"><Empty icon={Target}>Powiedz Claude'owi w claude.ai, jakie masz cele, np. „Telefony do rodziców z dnia otwartego — 60”, „Zapisy na rok 2027/28 — 25 rodzin”, „Posty na Instagram — 12”.</Empty></section>
      ) : groups.map(([cat, items]) => (
        <section key={cat} className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><h2>{cat}</h2></div>
          <ul className="list">
            {items.map((i) => {
              const overdue = i.due && i.due < today && left(i) > 0;
              return (
                <li key={i.id} className="li b2c-row">
                  <button className="grow b2c-main" onClick={() => setEdit(i)}>
                    <div className="row" style={{ gap: 8 }}>
                      <b className="grow trunc">{i.title}</b>
                      <span className="nowrap"><b>{i.done}</b>{i.target ? <span className="soft"> / {i.target}</span> : null} <span className="soft small">{i.unit}</span></span>
                    </div>
                    {i.target > 0 && <div className="progress" style={{ margin: '6px 0' }}><div style={{ width: `${pct(i)}%`, background: i.done >= i.target ? 'var(--ok)' : 'var(--accent)' }} /></div>}
                    <div className="meta">
                      {i.target ? (i.done >= i.target ? 'Zrobione ✓' : `Zostało ${left(i)} · ${pct(i)}%`) : 'bez limitu'}
                      {i.week ? ` · +${i.week} w 7 dni` : ''}
                      {i.due && <span style={overdue ? { color: 'var(--bad)', fontWeight: 600 } : undefined}> · termin {shortDate(i.due)}{relDay(i.due, today) !== shortDate(i.due) ? ` (${relDay(i.due, today)})` : ''}</span>}
                    </div>
                  </button>
                  <div className="row" style={{ gap: 4 }}>
                    <button className="btn sm icon" onClick={() => setStep({ item: i, sign: -1 })} disabled={!i.done} aria-label="Odejmij"><Minus size={14} /></button>
                    <button className="btn sm primary" onClick={() => bump.mutate({ id: i.id, delta: 1 })} disabled={bump.isPending}><Plus size={14} /> 1</button>
                    <button className="btn sm" onClick={() => setStep({ item: i, sign: 1 })}>+ ile?</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <ItemForm value={edit} onClose={() => setEdit(null)} />
      <StepDialog value={step} onClose={() => setStep(null)} />
    </>
  );
}

function StepDialog({ value, onClose }: { value: { item: B2cItem; sign: 1 | -1 } | null; onClose: () => void }) {
  const [n, setN] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => { setN(''); setNote(''); }, [value]);
  const save = useAction(() => api.b2cProgress(value!.item.id, value!.sign * Math.abs(Math.round(Number(n))), note), { ok: 'Zapisano', onDone: onClose });
  const ok = Number(n) > 0;
  return (
    <Modal open={!!value} onClose={onClose} title={value ? `${value.sign > 0 ? 'Dodaj do' : 'Odejmij od'}: ${value.item.title}` : ''}
      footer={<><button className="btn" onClick={onClose}>Anuluj</button>
        <button className="btn primary" disabled={!ok || save.isPending} onClick={() => save.mutate(undefined)}>Zapisz</button></>}>
      <div className="fields">
        <label className="field">Ile {value?.item.unit}<input type="number" min={1} inputMode="numeric" autoFocus value={n} onChange={(e) => setN(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && ok) save.mutate(undefined); }} /></label>
        <label className="field">Notatka (opcjonalnie)<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="np. po dniu otwartym" /></label>
      </div>
    </Modal>
  );
}

function ItemForm({ value, onClose }: { value: Partial<B2cItem> | null; onClose: () => void }) {
  const [d, setD] = useState<Partial<B2cItem>>({});
  useEffect(() => { if (value) setD(value); }, [value]);
  const log = useQuery({ queryKey: ['b2c-log', value?.id], queryFn: () => api.b2cLog(value!.id!), enabled: !!value?.id });
  const cats = useQuery({ queryKey: ['b2c'], queryFn: api.b2c, enabled: !!value });
  const save = useAction(() => api.saveB2c({ ...d, target: Number(d.target) || 0, done: d.done === undefined ? undefined : Number(d.done) || 0 }), { ok: 'Zapisano', onDone: onClose });
  const drop = useAction(() => api.deleteB2c(d.id!), { ok: 'Usunięto', onDone: onClose });
  const set = (k: keyof B2cItem) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value });
  const categories = [...new Set((cats.data || []).map((i) => i.category).filter(Boolean))];
  return (
    <Modal open={!!value} onClose={onClose} title={value?.id ? value.title : 'Nowy cel B2C'}
      footer={<>
        {value?.id && <button className="btn ghost danger" style={{ marginRight: 'auto' }} onClick={() => confirm('Usunąć ten cel z historią?') && drop.mutate(undefined)}><Trash2 size={15} /></button>}
        <button className="btn" onClick={onClose}>Anuluj</button>
        <button className="btn primary" disabled={!d.title?.trim() || save.isPending} onClick={() => save.mutate(undefined)}>Zapisz</button>
      </>}>
      <label className="field">Co<input value={d.title || ''} onChange={set('title')} placeholder="np. Telefony do rodziców z dnia otwartego" autoFocus={!value?.id} /></label>
      <div className="fields">
        <label className="field">Kategoria<input value={d.category || ''} onChange={set('category')} list="b2c-cats" placeholder="np. Rekrutacja" />
          <datalist id="b2c-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist></label>
        <label className="field">Jednostka<input value={d.unit || ''} onChange={set('unit')} placeholder="np. telefonów, rodzin" /></label>
        <label className="field">Cel (ile w sumie)<input type="number" min={0} inputMode="numeric" value={d.target ?? ''} onChange={set('target')} placeholder="0 = bez limitu" /></label>
        <label className="field">Zrobione<input type="number" min={0} inputMode="numeric" value={d.done ?? ''} onChange={set('done')} placeholder="0" /></label>
        <label className="field">Termin<input type="date" value={d.due || ''} onChange={set('due')} /></label>
      </div>
      <label className="field">Notatki<textarea rows={2} value={d.notes || ''} onChange={set('notes')} /></label>
      {!!log.data?.length && (
        <div className="col tight">
          <span className="small soft">Historia</span>
          <ul className="b2c-log">
            {log.data.map((l) => <li key={l.id}><b style={{ color: l.delta > 0 ? 'var(--ok)' : 'var(--bad)' }}>{l.delta > 0 ? '+' : ''}{l.delta}</b> <span className="soft small">{shortDate(l.day)}</span>{l.note && ` · ${l.note}`}</li>)}
          </ul>
        </div>
      )}
    </Modal>
  );
}
