import { useState, type KeyboardEvent } from 'react';
import { CalendarPlus, CheckCircle2 } from 'lucide-react';
import { api, type FollowUp } from '../api';
import {
  autoStage, quickDates, DISQUALIFY_REASONS, STAGES, TYPES, type Activity, type Lead, type Stage,
} from '../../shared/domain';
import { Modal, Seg, StagePill, TYPE_ICON, relDay, stageLabel, typeLabel, useAction, useToday } from './ui';

/* ------------------------------------------------------------ next step picker */

export interface NextStepValue { on: boolean; date: string; type: string; note: string }
export const noNextStep = (): NextStepValue => ({ on: false, date: '', type: 'Call', note: '' });
export const toFollowUp = (v: NextStepValue): FollowUp | null =>
  v.on && v.date ? { date: v.date, type: v.type, note: v.note } : null;

export function DateChips({ value, onChange, allowNone, min }: {
  value: string; onChange: (d: string) => void; allowNone?: boolean; min?: string;
}) {
  const today = useToday();
  return (
    <div className="chips">
      {allowNone && <button type="button" className={`chip ${!value ? 'on' : ''}`} onClick={() => onChange('')}>Bez</button>}
      {quickDates(today).map((q) => (
        <button type="button" key={q.label} className={`chip ${value === q.date ? 'on' : ''}`}
          onClick={() => onChange(q.date)} title={q.date}>{q.label}</button>
      ))}
      <input type="date" value={value} min={min ?? today} onChange={(e) => onChange(e.target.value)}
        style={{ width: 150, height: 30, borderRadius: 99, fontSize: 13 }} aria-label="Inna data" />
    </div>
  );
}

export function NextStep({ value, onChange, title = 'Następny krok' }: {
  value: NextStepValue; onChange: (v: NextStepValue) => void; title?: string;
}) {
  const set = (p: Partial<NextStepValue>) => onChange({ ...value, ...p });
  return (
    <div>
      <div className="lbl">{title}</div>
      <DateChips allowNone value={value.on ? value.date : ''} onChange={(d) => set({ on: !!d, date: d })} />
      {value.on && (
        <div className="row wrap" style={{ marginTop: 8 }}>
          <select value={value.type} onChange={(e) => set({ type: e.target.value })} style={{ width: 140 }}>
            {TYPES.filter((t) => t !== 'Note').map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
          </select>
          <input type="text" className="grow" placeholder="Po co? (opcjonalnie)" value={value.note}
            onChange={(e) => set({ note: e.target.value })} style={{ minWidth: 160 }} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ stage picker */

export interface StageValue { stage: string; reason: string }

export function ReasonPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="col tight">
      <div className="chips">
        {DISQUALIFY_REASONS.map((r) => (
          <button type="button" key={r} className={`chip ${value.startsWith(r) ? 'on' : ''}`} onClick={() => onChange(r)}>{r}</button>
        ))}
      </div>
      <input type="text" placeholder="Powód (wymagany) — co dokładnie powiedzieli?" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function StageChoice({ from, auto, value, onChange }: {
  from: Stage; auto: Stage; value: StageValue; onChange: (v: StageValue) => void;
}) {
  const dq = value.stage === 'disqualified' && from !== 'disqualified';
  return (
    <div>
      <div className="lbl">Etap</div>
      <div className="row wrap">
        <select value={value.stage} onChange={(e) => onChange({ ...value, stage: e.target.value })} style={{ width: 'auto', minWidth: 220 }}>
          <option value="">{auto === from ? `Bez zmian: ${stageLabel(from)}` : `Automatycznie: ${stageLabel(auto)}`}</option>
          {STAGES.filter((s) => s !== from).map((s) => <option key={s} value={s}>Przenieś do: {stageLabel(s)}</option>)}
        </select>
        {!value.stage && auto !== from && <span className="hint row">zmieni się na <StagePill stage={auto} /></span>}
      </div>
      {dq && <div style={{ marginTop: 8 }}><ReasonPicker value={value.reason} onChange={(r) => onChange({ ...value, reason: r })} /></div>}
    </div>
  );
}

const ctrlEnter = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); fn(); }
};

const RESULT_LABELS = { reached: 'Odebrał', 'no answer': 'Nie odebrał', done: 'Zrobione / wysłane' } as const;

/* ------------------------------------------------------------ composer (record page) */

type Mode = 'log' | 'plan';

export function Composer({ lead, initialMode = 'log', initialDate = '', onDone }: { lead: Lead; initialMode?: Mode; initialDate?: string; onDone?: () => void }) {
  const today = useToday();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [type, setType] = useState<string>('Call');
  const [result, setResult] = useState<string>('reached');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(initialDate);
  const [stage, setStage] = useState<StageValue>({ stage: '', reason: '' });
  const [next, setNext] = useState<NextStepValue>(noNextStep());

  const reset = () => { setNote(''); setDate(''); setStage({ stage: '', reason: '' }); setNext(noNextStep()); onDone?.(); };
  const act = useAction(
    () => mode === 'plan'
      ? api.log(lead.id, { type, result: 'planned', note, date })
      : api.log(lead.id, {
        type, result: type === 'Note' ? 'done' : result, note, date: date || undefined,
        stage: stage.stage || undefined, reason: stage.reason || undefined, followUp: toFollowUp(next),
      }),
    { ok: mode === 'plan' ? 'Zaplanowano' : 'Zapisano', onDone: reset },
  );

  const effResult = type === 'Note' ? 'done' : result;
  const auto = autoStage(lead.stage, type, effResult);
  const needReason = mode === 'log' && stage.stage === 'disqualified' && lead.stage !== 'disqualified' && !stage.reason.trim();
  const planNeedsDate = mode === 'plan' && !date;
  const submit = () => { if (!needReason && !planNeedsDate && !act.isPending) act.mutate(undefined); };
  const types = mode === 'plan' ? TYPES.filter((t) => t !== 'Note') : TYPES;

  return (
    <div className="composer" onKeyDown={ctrlEnter(submit)}>
      <Seg className="accent" value={mode} options={['log', 'plan'] as const} onChange={(m) => { setMode(m); setDate(''); if (m === 'plan' && type === 'Note') setType('Call'); }}
        labels={{ log: <><CheckCircle2 size={15} /> Co się wydarzyło</>, plan: <><CalendarPlus size={15} /> Zaplanuj</> }} />
      <div className="chips">
        {types.map((t) => {
          const I = TYPE_ICON[t];
          return <button type="button" key={t} className={`chip ${t === type ? 'on' : ''}`} onClick={() => setType(t)}><I size={14} /> {typeLabel(t)}</button>;
        })}
      </div>

      {mode === 'log' && type !== 'Note' && (
        <Seg className="results" value={result} options={['reached', 'no answer', 'done'] as const} onChange={setResult} labels={RESULT_LABELS} />
      )}

      <textarea rows={3} placeholder={mode === 'plan' ? 'Co trzeba zrobić?' : type === 'Note' ? 'Notatka…' : 'Co ustaliliście? Jedno zdanie wystarczy.'}
        value={note} onChange={(e) => setNote(e.target.value)} />

      {mode === 'plan' ? (
        <div><div className="lbl">Kiedy</div><DateChips value={date} onChange={setDate} /></div>
      ) : (
        <>
          <StageChoice from={lead.stage} auto={auto} value={stage} onChange={setStage} />
          {type !== 'Note' && <NextStep value={next} onChange={setNext} />}
          <details>
            <summary className="hint" style={{ cursor: 'pointer' }}>Było innego dnia?</summary>
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} style={{ width: 170, marginTop: 8 }} />
          </details>
        </>
      )}

      <div className="row wrap">
        <button className="btn primary" disabled={needReason || planNeedsDate || act.isPending} onClick={submit}>
          {mode === 'plan' ? `Zaplanuj${date ? ' · ' + relDay(date, today) : ''}` : 'Zapisz'}
        </button>
        <span className="hint hide-sm"><kbd>Ctrl</kbd> + <kbd>Enter</kbd></span>
        {needReason && <span className="hint">Podaj powód odrzucenia.</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ complete a planned activity */

export function CompleteDialog({ activity, stage, company, onClose }: {
  activity: Activity | null; stage: Stage; company?: string; onClose: () => void;
}) {
  const [result, setResult] = useState<string>('reached');
  const [note, setNote] = useState('');
  const [st, setSt] = useState<StageValue>({ stage: '', reason: '' });
  const [next, setNext] = useState<NextStepValue>(noNextStep());

  const close = () => { setResult('reached'); setNote(''); setSt({ stage: '', reason: '' }); setNext(noNextStep()); onClose(); };
  const act = useAction(
    () => api.complete(activity!.id, {
      result, note, stage: st.stage || undefined, reason: st.reason || undefined, followUp: toFollowUp(next),
    }),
    { ok: 'Zrobione', onDone: close },
  );
  if (!activity) return null;
  const auto = autoStage(stage, activity.type, result);
  const needReason = st.stage === 'disqualified' && stage !== 'disqualified' && !st.reason.trim();
  const submit = () => { if (!needReason && !act.isPending) act.mutate(undefined); };

  return (
    <Modal open={!!activity} onClose={close} title={<>{typeLabel(activity.type)}{company ? ` · ${company}` : ''}</>}
      footer={<>
        <button className="btn" onClick={close}>Anuluj</button>
        <button className="btn primary" disabled={needReason || act.isPending} onClick={submit}>Zapisz</button>
      </>}>
      <div onKeyDown={ctrlEnter(submit)} className="composer" style={{ padding: 0 }}>
        {activity.note && <div className="soft pre">{activity.note}</div>}
        <Seg className="results" value={result} options={['reached', 'no answer', 'done'] as const} onChange={(r) => {
          setResult(r);
          // a missed call almost always means "try again" — offer it straight away
          if (r === 'no answer' && !next.on) setNext({ on: false, date: '', type: activity.type, note: 'Ponowić' });
        }} labels={RESULT_LABELS} />
        <textarea rows={3} placeholder="Jak poszło?" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
        <StageChoice from={stage} auto={auto} value={st} onChange={setSt} />
        <NextStep value={next} onChange={setNext} title={result === 'no answer' ? 'Kiedy ponowić?' : 'Następny krok'} />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ stage change with a reason */

export function DisqualifyDialog({ lead, onClose }: { lead: Pick<Lead, 'id' | 'company' | 'openCount'> | null; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const act = useAction(() => api.setStage(lead!.id, 'disqualified', reason), {
    ok: 'Odrzucono', onDone: () => { setReason(''); onClose(); },
  });
  return (
    <Modal open={!!lead} onClose={onClose} title={`Odrzuć: ${lead?.company || ''}`}
      footer={<><button className="btn" onClick={onClose}>Anuluj</button>
        <button className="btn primary" style={{ background: 'var(--bad)', borderColor: 'var(--bad)' }}
          disabled={!reason.trim() || act.isPending} onClick={() => act.mutate(undefined)}>Odrzuć</button></>}>
      <ReasonPicker value={reason} onChange={setReason} />
      {!!lead?.openCount && <div className="hint">Zaplanowane follow-upy ({lead.openCount}) zostaną anulowane.</div>}
    </Modal>
  );
}
