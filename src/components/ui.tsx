import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Phone, Mail, MessageSquare, Handshake, MapPin, StickyNote, X, Moon, Sun, type LucideIcon,
} from 'lucide-react';
import { api } from '../api';
import {
  daysBetween, shortDate, weekday, STAGE_INFO, STAGE_LABEL, RESULT_LABEL, TYPE_LABEL, type Stage, type Result,
  type ActivityType,
} from '../../shared/domain';

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
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), kind === 'error' ? 6000 : 2600);
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

/* ------------------------------------------------------------ modal (bottom sheet on phones) */

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
            <button className="btn ghost icon sm" onClick={onClose} aria-label="Zamknij"><X size={18} /></button>
          </div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

/** Small dropdown menu that closes on outside click. */
export function Menu({ trigger, children }: { trigger: (toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      {trigger(() => setOpen((o) => !o))}
      {open && <div className="menu-pop">{children(() => setOpen(false))}</div>}
    </div>
  );
}

/* ------------------------------------------------------------ theme */

export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark' ||
    (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches));
  const flip = () => {
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('crm-theme', next); } catch { /* private mode */ }
    setDark(!dark);
  };
  return (
    <button className="btn ghost icon" onClick={flip} aria-label={dark ? 'Jasny motyw' : 'Ciemny motyw'} title={dark ? 'Jasny motyw' : 'Ciemny motyw'}>
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

/* ------------------------------------------------------------ bits */

export const stageClass = (s: string) => 'st-' + s.replace(/\s+/g, '-');
export const stageLabel = (s: string) => STAGE_LABEL[s as Stage] || s;
export const typeLabel = (t: string) => TYPE_LABEL[t as ActivityType] || t;
export const resultLabel = (r: string) => RESULT_LABEL[r as Result] || r;

export const STAGE_COLOR: Record<string, string> = {
  new: 'var(--faint)', contacting: 'var(--accent)', 'scheduled visit': 'var(--violet)', negotiation: 'var(--warn)',
  active: 'var(--ok)', disqualified: 'var(--bad)',
};

export function StagePill({ stage }: { stage: string }) {
  return <span className={`pill ${stageClass(stage)}`} title={STAGE_INFO[stage as Stage]}><span className="d" />{stageLabel(stage)}</span>;
}

export function Prio({ n }: { n: number }) {
  return <span className={`prio ${n >= 7 ? 'hi' : n >= 4 ? 'mid' : 'lo'}`} title="Priorytet">{n}</span>;
}

export const TYPE_ICON: Record<string, LucideIcon> = {
  Call: Phone, Email: Mail, SMS: MessageSquare, Meeting: Handshake, Visit: MapPin, Note: StickyNote,
};

export function TypeIcon({ type, size = 15 }: { type: string; size?: number }) {
  const I = TYPE_ICON[type] || StickyNote;
  return <span className={`type-ic ${type}`}><I size={size} /></span>;
}

export function ResultTag({ result }: { result: string }) {
  return <span className={`r-${result.replace(/\s+/g, '-')}`} style={{ fontWeight: 600 }}>{resultLabel(result)}</span>;
}

/** Company monogram in a colour derived from the name, like the avatars in most CRMs. */
export function Avatar({ name, size = '' }: { name: string; size?: '' | 'sm' | 'lg' }) {
  const letters = name.replace(/["„”'().]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  const hue = [220, 250, 200, 160, 280, 30][h % 6];
  return (
    <span className={`avatar ${size}`} style={{ background: `hsl(${hue} 70% 92% / var(--av-a, 1))`, color: `hsl(${hue} 55% 38%)` }}>
      {letters}
    </span>
  );
}

const WD = ['pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.', 'niedz.'];
export const weekdayName = (d: string) => WD[weekday(d)];

/** "dziś", "jutro", "3 dni temu", "czw. 02.10" … */
export function relDay(d: string, today: string): string {
  if (!d) return '';
  const n = daysBetween(today, d);
  if (n === 0) return 'dziś';
  if (n === 1) return 'jutro';
  if (n === -1) return 'wczoraj';
  if (n < 0 && n > -7) return `${-n} dni temu`;
  if (n > 0 && n < 7) return `${weekdayName(d)} ${shortDate(d)}`;
  return `${shortDate(d)}${d.slice(0, 4) !== today.slice(0, 4) ? '.' + d.slice(0, 4) : ''}`;
}

export function DueTag({ date, today }: { date: string; today: string }) {
  if (!date) return null;
  const late = date < today ? daysBetween(date, today) : 0;
  const cls = late ? 'overdue' : date === today ? 'today' : daysBetween(today, date) <= 2 ? 'soon' : '';
  return <span className={`tag ${cls}`}>{late ? `${late} dni po terminie` : relDay(date, today)}</span>;
}

export function Loading() { return <div className="spinner" aria-label="Ładowanie" />; }
export function ErrorBox({ error }: { error: unknown }) {
  return <div className="error-box">{error instanceof Error ? error.message : String(error)}</div>;
}
export function Empty({ icon: I, children }: { icon?: LucideIcon; children: ReactNode }) {
  return <div className="empty">{I && <I size={28} />}{children}</div>;
}

export function Seg<T extends string>({ value, options, onChange, className = '', labels }: {
  value: T; options: readonly T[]; onChange: (v: T) => void; className?: string; labels?: Partial<Record<T, ReactNode>>;
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

export function StatTile({ label, value, hint, icon: I, tone = '', to }: {
  label: string; value: ReactNode; hint?: ReactNode; icon: LucideIcon; tone?: '' | 'red' | 'green' | 'amber' | 'violet'; to?: string;
}) {
  const inner = (
    <>
      <div className="top"><span>{label}</span><span className={`ic ${tone}`}><I size={17} /></span></div>
      <div className="val">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </>
  );
  return to ? <Link to={to} className="card stat">{inner}</Link> : <div className="card stat">{inner}</div>;
}

export function copyText(text: string) {
  return navigator.clipboard?.writeText(text);
}

export const telHref = (phone: string) => 'tel:' + phone.replace(/[^\d+]/g, '').slice(0, 13);
