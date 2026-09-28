import { useState, type KeyboardEvent } from 'react';
import { api, type FollowUp } from '../api.ts';
import {
  autoStage, quickDates, DISQUALIFY_REASONS, STAGES, TYPES, type Activity, type Lead, type Stage,
} from '../../shared/domain.ts';
import { Modal, Seg, useAction, useToday, StagePill, relDay, typeIcon } from './ui.tsx';

/* ------------------------------------------------------------ next step picker */

export interface NextStepValue { on: boolean; date: string; type: string; note: string }
export const noNextStep = (): NextStepValue => ({ on: false, date: '', type: 'Call', note: '' });
export const toFollowUp = (v: NextStepValue): FollowUp | null =>
  v.on && v.date ? { date: v.date, type: v.type, note: v.note } : null;

export function NextStep({ value, onChange, title = 'Next step' }: {
  value: NextStepValue; onChange: (v: NextStepValue) => void; title?: string;
}) {
  const today = useToday();
  const set = (p: Partial<NextStepValue>) => onChange({ ...value, ...p });
  return (
    <div>
      <div className="label">{title}</div>
      <div className="chips">
        <button type="button" className={`chip ${!value.on ? 'on' : ''}`} onClick={() => set({ on: false })}>None</button>
        {quickDates(today).map((q) => (
          <button type="button" key={q.label} className={`chip ${value.on && value.date === q.date ? 'on' : ''}`}
            onClick={() => set({ on: true, date: q.date })} title={q.date}>{q.label}</button>
        ))}
      </div>
      {value.on && (
        <div className="row wrap" style={{ marginTop: 8 }}>
          <input type="date" value={value.date} min={today} onChange={(e) => set({ date: e.target.value })} style={{ width: 150 }} />
          <select value={value.type} onChange={(e) => set({ type: e.target.value })} style={{ width: 120 }}>
            {TYPES.filter((t) => t !== 'Note').map((t) => <option key={t}>{t}</option>)}
          </select>
          <input type="text" className="grow" placeholder="What for? (optional)" value={value.note}
            onChange={(e) => set({ note: e.target.value })} style={{ minWidth: 160 }} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ stage picker */

export interface StageValue { stage: string; reason: string }

export function StageChoice({ from, auto, value, onChange }: {
  from: Stage; auto: Stage; value: StageValue; onChange: (v: StageValue) => void;
}) {
  const dq = value.stage === 'disqualified' && from !== 'disqualified';
  return (
    <div>
      <div className="label">Stage</div>
      <div className="row wrap">
        <select value={value.stage} onChange={(e) => onChange({ ...value, stage: e.target.value })} style={{ width: 'auto' }}>
          <option value="">{auto === from ? `Keep: ${from}` : `Auto: ${from} → ${auto}`}</option>
          {STAGES.filter((s) => s !== from).map((s) => <option key={s} value={s}>Move to {s}</option>)}
        </select>
        {!value.stage && auto !== from && <span className="hint">moves automatically <StagePill stage={auto} /></span>}
      </div>
      {dq && (
        <div className="stack tight" style={{ marginTop: 8 }}>
          <div className="chips">
            {DISQUALIFY_REASONS.map((r) => (
              <button type="button" key={r} className={`chip ${value.reason.startsWith(r) ? 'on' : ''}`}
                onClick={() => onChange({ ...value, reason: r })}>{r}</button>
            ))}
          </div>
          <input type="text" placeholder="Reason (required)" value={value.reason}
            onChange={(e) => onChange({ ...value, reason: e.target.value })} />
        </div>
      )}
    </div>
  );
}

const submitOnCtrlEnter = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); fn(); }
};

/* ------------------------------------------------------------ log panel (lead page) */

type Mode = 'log' | 'plan';

export function LogPanel({ lead }: { lead: Lead }) {
  const today = useToday();
  const [mode, setMode] = useState<Mode>('log');
  const [type, setType] = useState<string>('Call');
  const [result, setResult] = useState<string>('reached');
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [stage, setStage] = useState<StageValue>({ stage: '', reason: '' });
  const [next, setNext] = useState<NextStepValue>(noNextStep());

  const reset = () => {
    setNote(''); setDate(''); setStage({ stage: '', reason: '' }); setNext(noNextStep());
  };
  const act = useAction(
    () => mode === 'plan'
      ? api.log(lead.id, { type, result: 'planned', note, date: date || today })
      : api.log(lead.id, {
        type, result: type === 'Note' ? 'done' : result, note, date: date || undefined,
        stage: stage.stage || undefined, reason: stage.reason || undefined, followUp: toFollowUp(next),
      }),
    { ok: mode === 'plan' ? 'Planned' : 'Logged', onDone: reset },
  );

  const effResult = type === 'Note' ? 'done' : result;
  const auto = autoStage(lead.stage, type, effResult);
  const needReason = mode === 'log' && stage.stage === 'disqualified' && lead.stage !== 'disqualified' && !stage.reason.trim();
  const planNeedsDate = mode === 'plan' && !date;
  const submit = () => { if (!needReason && !planNeedsDate && !act.isPending) act.mutate(undefined); };

  return (
    <div className="log-panel" onKeyDown={submitOnCtrlEnter(submit)}>
      <div className="row between wrap">
        <Seg value={mode} options={['log', 'plan'] as const} onChange={setMode}
          labels={{ log: 'What happened', plan: 'Plan next' }} />
        <span className="hint"><span className="kbd">Ctrl</span> + <span className="kbd">Enter</span> saves</span>
      </div>
      <Seg value={type} options={TYPES} onChange={setType}
        labels={Object.fromEntries(TYPES.map((t) => [t, `${typeIcon(t)} ${t}`]))} />

      {mode === 'log' && type !== 'Note' && (
        <Seg className="results" value={result} options={['reached', 'no answer', 'done'] as const} onChange={setResult}
          labels={{ reached: 'Reached', 'no answer': 'No answer', done: 'Done / sent' }} />
      )}

      <textarea rows={3} autoFocus={false} placeholder={mode === 'plan' ? 'What is the plan?' : 'What was said? One sentence is enough.'}
        value={note} onChange={(e) => setNote(e.target.value)} />

      {mode === 'plan' ? (
        <div>
          <div className="label">When</div>
          <div className="chips">
            {quickDates(today).map((q) => (
              <button type="button" key={q.label} className={`chip ${date === q.date ? 'on' : ''}`}
                onClick={() => setDate(q.date)}>{q.label}</button>
            ))}
            <input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} style={{ width: 150, height: 26 }} />
          </div>
        </div>
      ) : (
        <>
          <StageChoice from={lead.stage} auto={auto} value={stage} onChange={setStage} />
          <NextStep value={next} onChange={setNext} />
          <details>
            <summary className="hint" style={{ cursor: 'pointer' }}>Happened on another day?</summary>
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} style={{ width: 150, marginTop: 6 }} />
          </details>
        </>
      )}

      <div className="row">
        <button className="btn primary" disabled={needReason || planNeedsDate || act.isPending} onClick={submit}>
          {mode === 'plan' ? `Plan ${type.toLowerCase()}${date ? ' · ' + relDay(date, today) : ''}` : `Save ${type.toLowerCase()}`}
        </button>
        {needReason && <span className="hint">Give a reason to disqualify.</span>}
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
    { ok: 'Done', onDone: close },
  );
  if (!activity) return null;
  const auto = autoStage(stage, activity.type, result);
  const needReason = st.stage === 'disqualified' && stage !== 'disqualified' && !st.reason.trim();
  const submit = () => { if (!needReason && !act.isPending) act.mutate(undefined); };

  return (
    <Modal open={!!activity} onClose={close}
      title={<>{typeIcon(activity.type)} {activity.type}{company ? ` · ${company}` : ''}</>}
      footer={<>
        <button className="btn" onClick={close}>Cancel</button>
        <button className="btn primary" disabled={needReason || act.isPending} onClick={submit}>Save</button>
      </>}>
      <div onKeyDown={submitOnCtrlEnter(submit)} className="stack">
        {activity.note && <div className="muted pre">{activity.note}</div>}
        <Seg className="results" value={result} options={['reached', 'no answer', 'done'] as const} onChange={(r) => {
          setResult(r);
          // a missed call almost always means "try again" — offer it straight away
          if (r === 'no answer' && !next.on) setNext({ on: true, date: '', type: activity.type, note: 'Try again' });
        }} labels={{ reached: 'Reached', 'no answer': 'No answer', done: 'Done / sent' }} />
        <textarea rows={3} placeholder="How did it go?" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
        <StageChoice from={stage} auto={auto} value={st} onChange={setSt} />
        <NextStep value={next} onChange={setNext} />
      </div>
    </Modal>
  );
}
