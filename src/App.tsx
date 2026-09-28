import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.ts';
import { searchKey } from '../shared/domain.ts';
import { Loading, Modal, StagePill } from './components/ui.tsx';
import { TodayPage } from './pages/Today.tsx';
import { LeadsPage } from './pages/Leads.tsx';
import { LeadPage } from './pages/Lead.tsx';
import { CalendarPage } from './pages/Calendar.tsx';
import { EventsPage } from './pages/Events.tsx';
import { StatsPage } from './pages/Stats.tsx';
import { ReportPage } from './pages/Report.tsx';
import { PlaybookPage } from './pages/Playbook.tsx';
import { DataPage } from './pages/Data.tsx';

export function App() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: Infinity });

  useEffect(() => {
    const out = () => qc.setQueryData(['me'], (m: any) => ({ ...(m || {}), authenticated: false }));
    window.addEventListener('crm:signed-out', out);
    return () => window.removeEventListener('crm:signed-out', out);
  }, [qc]);

  if (me.isLoading) return <Loading />;
  if (!me.data?.authenticated) return <Login onDone={() => { qc.clear(); me.refetch(); }} />;
  return <Shell passwordRequired={!!me.data.passwordRequired} />;
}

function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await api.login(pw); onDone(); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="login">
      <form className="card card-pad stack" onSubmit={submit}>
        <div className="brand" style={{ padding: 0 }}><span className="brand-mark">B</span> B2B CRM</div>
        <label className="field"><span>Password</span>
          <input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        {err && <div className="error-box">{err}</div>}
        <button className="btn primary" disabled={busy || !pw}>Sign in</button>
      </form>
    </div>
  );
}

const NAV = [
  { to: '/', label: 'Today', icon: '◉', end: true },
  { to: '/leads', label: 'Leads', icon: '☰' },
  { to: '/calendar', label: 'Calendar', icon: '▦' },
  { to: '/events', label: 'Events', icon: '★' },
  { to: '/stats', label: 'Stats', icon: '▲' },
  { to: '/report', label: 'Report', icon: '✉' },
  { to: '/playbook', label: 'Playbook', icon: '❡' },
  { to: '/data', label: 'Data', icon: '⇅' },
];

function Shell({ passwordRequired }: { passwordRequired: boolean }) {
  const today = useQuery({ queryKey: ['today'], queryFn: api.today });
  const late = (today.data?.overdue.length || 0) + (today.data?.due.length || 0);
  const [finder, setFinder] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) ||
          (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName))) {
        e.preventDefault();
        setFinder(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><span className="brand-mark">B</span> B2B CRM</div>
        <nav className="nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              <span aria-hidden>{n.icon}</span> {n.label}
              {n.to === '/' && late > 0 && <span className="count">{late}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot stack tight">
          <button className="btn sm" onClick={() => setFinder(true)}>Find company <span className="kbd">/</span></button>
          {passwordRequired && (
            <button className="btn sm ghost" onClick={async () => { await api.logout(); qc.clear(); location.reload(); }}>
              Sign out
            </button>
          )}
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/leads" element={<LeadsPage />} />
          <Route path="/leads/:id" element={<LeadPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/:id" element={<EventsPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/playbook" element={<PlaybookPage />} />
          <Route path="/data" element={<DataPage />} />
          <Route path="*" element={<div className="empty">Nothing here.</div>} />
        </Routes>
      </main>
      <Finder open={finder} onClose={() => setFinder(false)} />
    </div>
  );
}

/** Jump to any company by typing part of its name, city, phone or email. */
function Finder({ open, onClose }: { open: boolean; onClose: () => void }) {
  const leads = useQuery({ queryKey: ['leads'], queryFn: api.leads, enabled: open });
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const nav = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => input.current?.focus(), 30); } }, [open]);

  const hits = useMemo(() => {
    const k = searchKey(q);
    if (!k || !leads.data) return [];
    const digits = q.replace(/\D/g, '');
    return leads.data.filter((l) =>
      searchKey(l.company).includes(k) || searchKey(l.city) === k || l.email.includes(k) ||
      (digits.length >= 3 && l.phone.replace(/\D/g, '').includes(digits)) || l.id.toLowerCase() === k,
    ).sort((a, b) => Number(searchKey(b.company).startsWith(k)) - Number(searchKey(a.company).startsWith(k)) ||
      b.priority - a.priority).slice(0, 12);
  }, [q, leads.data]);

  const go = (id: string) => { onClose(); nav(`/leads/${id}`); };
  return (
    <Modal open={open} onClose={onClose} title="Find company">
      <input ref={input} type="search" placeholder="Name, city, phone, email…" value={q}
        onChange={(e) => { setQ(e.target.value); setSel(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
          if (e.key === 'Enter' && hits[sel]) go(hits[sel].id);
        }} />
      <ul className="list">
        {hits.map((l, i) => (
          <li key={l.id} className="item" style={{ cursor: 'pointer', background: i === sel ? 'var(--panel-2)' : undefined, padding: '8px 6px' }}
            onMouseEnter={() => setSel(i)} onClick={() => go(l.id)}>
            <div className="grow">
              <div className="title ellipsis">{l.company}</div>
              <div className="muted ellipsis" style={{ fontSize: 12.5 }}>{[l.city, l.segment, l.phone].filter(Boolean).join(' · ')}</div>
            </div>
            <StagePill stage={l.stage} />
          </li>
        ))}
        {q && leads.data && !hits.length && <li className="empty">No match.</li>}
      </ul>
    </Modal>
  );
}
