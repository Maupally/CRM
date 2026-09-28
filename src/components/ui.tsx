import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.ts';
import { daysBetween, shortDate, weekday, STAGE_INFO, type Stage } from '../../shared/domain.ts';

/* ------------------------------------------------------------ data hooks */

export function useConfig() {
  return useQuery({ queryKey: ['config'], queryFn: api.config, staleTime: 60_000 });
}

export function useToday(): string {
  const { data } = useConfig();
  return data?.today || new Date().toISOString().slice(0, 10);
}

/**
 * A mutation that refreshes everything afterwards. The data set is small, so
 * "reload what is on screen" is simpler and safer than hand-patching caches.
 */
export function useAction<A, R>(fn: (a: A) => Promise<R>, opts: { ok?: string | ((r: R) => string); onDone?: (r: R) => void } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      qc.invalidateQueries();
      const msg = typeof opts.ok === 'function' ? opts.ok(r) : opts.ok;
      if (msg) toast(msg);
      opts.onDone?.(r);
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });
}

/* ------------------------------------------------------------ toasts */

type ToastFn = (msg: string, kind?: 'ok' | 'error') => void;
const ToastCtx = createContext<ToastFn>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; kind: string }[]>([]);
  const push = useCallback<ToastFn>((msg, kind = 'ok') => {
    const id = Math.random();
    setItems((x) => [...x.slice(-3), { id, msg, kind }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), kind === 'error' ? 6000 : 2800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status">
        {items.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

/* ------------------------------------------------------------ modal */

export function Modal({ open, onClose, title, children, footer, wide }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={`modal${wide ? ' wide' : ''}`} onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      {open && (
        <>
          <div className="modal-head">
            <h2>{title}</h2>
            <button className="btn ghost icon" onClick={onClose} aria-label="Close">✕</button>
          </div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

/* ------------------------------------------------------------ bits */

export const stageClass = (s: string) => 'st-' + s.replace(/\s+/g, '-');

export function StagePill({ stage }: { stage: string }) {
  return <span className={`pill ${stageClass(stage)}`} title={STAGE_INFO[stage as Stage]}>{stage}</span>;
}

export function Prio({ n }: { n: number }) {
  return <span className={`prio ${n >= 7 ? 'hi' : n >= 4 ? 'mid' : 'lo'}`} title="Priority">{n}</span>;
}

const TYPE_ICON: Record<string, string> = { Call: '☎', Email: '✉', SMS: '💬', Meeting: '🤝', Visit: '📍', Note: '✎' };
export const typeIcon = (t: string) => TYPE_ICON[t] || '•';

export function ResultTag({ result }: { result: string }) {
  return <span className={`r-${result.replace(/\s+/g, '-')}`} style={{ fontWeight: 600 }}>{result}</span>;
}

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const weekdayName = (d: string) => WD[weekday(d)];

/** "today", "tomorrow", "3 days late", "Thu 02.10" … */
export function relDay(d: string, today: string): string {
  if (!d) return '';
  const n = daysBetween(today, d);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n < 0 && n > -7) return `${-n} days ago`;
  if (n > 0 && n < 7) return `${weekdayName(d)} ${shortDate(d)}`;
  return `${shortDate(d)}${d.slice(0, 4) !== today.slice(0, 4) ? '.' + d.slice(0, 4) : ''}`;
}

export function DueTag({ date, today }: { date: string; today: string }) {
  if (!date) return null;
  const cls = date < today ? 'overdue' : date === today ? 'today' : '';
  const late = date < today ? daysBetween(date, today) : 0;
  return <span className={`tag ${cls}`}>{late ? `${late}d late` : relDay(date, today)}</span>;
}

export function Loading() { return <div className="spinner">Loading…</div>; }
export function ErrorBox({ error }: { error: unknown }) {
  return <div className="error-box">{error instanceof Error ? error.message : String(error)}</div>;
}

export function Seg<T extends string>({ value, options, onChange, className = '', labels }: {
  value: T; options: readonly T[]; onChange: (v: T) => void; className?: string; labels?: Partial<Record<T, string>>;
}) {
  return (
    <div className={`seg ${className}`} role="radiogroup">
      {options.map((o) => (
        <button type="button" key={o} data-v={o} className={o === value ? 'on' : ''} role="radio"
          aria-checked={o === value} onClick={() => onChange(o)}>{labels?.[o] ?? o}</button>
      ))}
    </div>
  );
}

export function copyText(text: string) {
  return navigator.clipboard?.writeText(text);
}
