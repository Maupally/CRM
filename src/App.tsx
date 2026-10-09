import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  LayoutDashboard, ListTodo, KanbanSquare, Building2, CalendarDays, PartyPopper, BarChart3, Settings, Search,
  LogOut, MoreHorizontal, CornerDownLeft, type LucideIcon,
  Target, Workflow,
} from 'lucide-react';
import { api } from './api';
import { searchKey } from '../shared/domain';
import { Avatar, Loading, Modal, StagePill, ThemeToggle } from './components/ui';
import { AssistantButton } from './components/Assistant';
import { DashboardPage } from './pages/Dashboard';
import { TasksPage } from './pages/Tasks';
import { PipelinePage } from './pages/Pipeline';
import { CompaniesPage } from './pages/Companies';
import { CompanyPage } from './pages/Company';
import { CalendarPage } from './pages/Calendar';
import { EventsPage } from './pages/Events';
import { ReportsPage } from './pages/Reports';
import { SettingsPage } from './pages/Settings';
import { PeoplePage } from './pages/People';
import { B2cPage } from './pages/B2c';
import { ProcessesPage } from './pages/Processes';

export function App() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: Infinity });

  useEffect(() => {
    const out = () => qc.setQueryData(['me'], (m: any) => ({ ...(m || {}), authenticated: false }));
    window.addEventListener('crm:signed-out', out);
    return () => window.removeEventListener('crm:signed-out', out);
  }, [qc]);

  if (me.isLoading) return <Loading />;
  if (me.error) return <div className="login"><div className="error-box">{(me.error as Error).message}</div></div>;
  if (me.data?.setupNeeded) return <SetPassword />;
  if (!me.data?.authenticated) return <Login onDone={() => { qc.clear(); me.refetch(); }} />;
  return <Shell passwordRequired={!!me.data.passwordRequired} />;
}

/** Online without a password nothing is served — this says how to set one. */
function SetPassword() {
  return (
    <div className="login">
      <div className="card pad col loose" style={{ maxWidth: 460 }}>
        <div className="brand" style={{ padding: 0 }}><span className="brand-mark">O5</span><b>Opal5</b></div>
        <h2 style={{ margin: 0 }}>Ustaw hasło</h2>
        <div className="soft">Opal5 jest zablokowany, dopóki nie ustawisz hasła — inaczej każdy z linkiem widziałby Twoje dane.</div>
        <ol className="steps">
          <li>Wejdź na <b>vercel.com</b> → projekt <b>crm</b> → <b>Settings → Environment Variables</b>.</li>
          <li>Dodaj zmienną <code>APP_PASSWORD</code> z Twoim hasłem (min. 12 znaków) i zapisz.</li>
          <li><b>Deployments</b> → przy ostatnim wdrożeniu „…” → <b>Redeploy</b>.</li>
          <li>Odśwież tę stronę i zaloguj się. Na telefonie i komputerze logujesz się raz na 30 dni.</li>
        </ol>
        <div className="hint">Po ustawieniu hasła zmieni się adres konektora dla claude.ai — skopiuj go na nowo z Ustawienia → Claude.</div>
      </div>
    </div>
  );
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
      <form className="card pad col loose" onSubmit={submit}>
        <div className="brand" style={{ padding: 0 }}><span className="brand-mark">O5</span><b>Opal5</b></div>
        <label className="field">Hasło
          <input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        </label>
        {err && <div className="error-box">{err}</div>}
        <button className="btn primary block" disabled={busy || !pw}>Zaloguj</button>
      </form>
    </div>
  );
}

interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean }
const NAV: { group?: string; items: NavItem[] }[] = [
  { items: [
    { to: '/', label: 'Pulpit', icon: LayoutDashboard, end: true },
    { to: '/zadania', label: 'Zadania', icon: ListTodo },
  ] },
  { group: 'Sprzedaż', items: [
    { to: '/lejek', label: 'Lejek', icon: KanbanSquare },
    { to: '/firmy', label: 'Firmy', icon: Building2 },
    { to: '/b2c', label: 'B2C', icon: Target },
  ] },
  { group: 'Plan', items: [
    { to: '/kalendarz', label: 'Kalendarz', icon: CalendarDays },
    { to: '/wydarzenia', label: 'Wydarzenia', icon: PartyPopper },
    { to: '/zespol', label: 'Zespół', icon: Users },
    { to: '/procesy', label: 'Procesy', icon: Workflow },
  ] },
  { group: 'Analiza', items: [
    { to: '/raporty', label: 'Raporty', icon: BarChart3 },
  ] },
];

function Shell({ passwordRequired }: { passwordRequired: boolean }) {
  const dash = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard, refetchInterval: 5 * 60_000 });
  const due = (dash.data?.overdue.length || 0) + (dash.data?.due.length || 0);
  const [palette, setPalette] = useState(false);
  const [more, setMore] = useState(false);
  const qc = useQueryClient();
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); setMore(false); }, [loc.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName);
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); setPalette(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const signOut = async () => { await api.logout(); qc.clear(); location.reload(); };

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><span className="brand-mark">O5</span><b>Opal5</b></div>
        <nav className="nav">
          {NAV.map((g, i) => (
            <div key={i}>
              {g.group && <div className="nav-group">{g.group}</div>}
              {g.items.map(({ to, label, icon: I, end }) => (
                <NavLink key={to} to={to} end={end}>
                  <I size={18} /> {label}
                  {to === '/zadania' && due > 0 && <span className="badge">{due}</span>}
                </NavLink>
              ))}
            </div>
          ))}
          <div className="nav-group">&nbsp;</div>
          <NavLink to="/ustawienia"><Settings size={18} /> Ustawienia</NavLink>
        </nav>
        <div className="side-foot">
          <ThemeToggle />
          {passwordRequired && <button className="btn ghost sm" onClick={signOut}><LogOut size={15} /> Wyloguj</button>}
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <span className="brand-mark only-sm" style={{ width: 32, height: 32 }}>O5</span>
          <button className="search-btn" onClick={() => setPalette(true)}>
            <Search size={16} /> <span className="trunc">Szukaj firmy, telefonu, maila…</span> <kbd className="hide-sm">/</kbd>
          </button>
          <span className="grow hide-sm" />
          <span className="hide-sm"><ThemeToggle /></span>
        </header>

        <main className="content">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/zadania" element={<TasksPage />} />
            <Route path="/lejek" element={<PipelinePage />} />
            <Route path="/firmy" element={<CompaniesPage />} />
            <Route path="/firmy/:id" element={<CompanyPage />} />
            <Route path="/kalendarz" element={<CalendarPage />} />
            <Route path="/wydarzenia" element={<EventsPage />} />
            <Route path="/wydarzenia/:id" element={<EventsPage />} />
            <Route path="/zespol" element={<PeoplePage />} />
            <Route path="/b2c" element={<B2cPage />} />
            <Route path="/procesy" element={<ProcessesPage />} />
            <Route path="/raporty" element={<ReportsPage />} />
            <Route path="/ustawienia" element={<SettingsPage />} />
            <Route path="*" element={<div className="empty">Nie ma takiej strony.</div>} />
          </Routes>
        </main>
      </div>

      <nav className="tabbar">
        <NavLink to="/" end><LayoutDashboard size={21} />Pulpit</NavLink>
        <NavLink to="/zadania"><ListTodo size={21} />Zadania{due > 0 && <span className="dot">{due}</span>}</NavLink>
        <NavLink to="/lejek"><KanbanSquare size={21} />Lejek</NavLink>
        <NavLink to="/firmy"><Building2 size={21} />Firmy</NavLink>
        <button onClick={() => setMore(true)}><MoreHorizontal size={21} />Więcej</button>
      </nav>

      <Modal open={more} onClose={() => setMore(false)} title="Więcej">
        <div className="list card flat">
          {[
            { to: '/b2c', label: 'B2C', icon: Target },
            { to: '/kalendarz', label: 'Kalendarz', icon: CalendarDays },
            { to: '/wydarzenia', label: 'Wydarzenia', icon: PartyPopper },
            { to: '/zespol', label: 'Zespół', icon: Users },
            { to: '/procesy', label: 'Procesy', icon: Workflow },
            { to: '/raporty', label: 'Raporty', icon: BarChart3 },
            { to: '/ustawienia', label: 'Ustawienia i dane', icon: Settings },
          ].map(({ to, label, icon: I }) => (
            <NavLink key={to} to={to} className="li"><I size={18} /> {label}</NavLink>
          ))}
        </div>
        <div className="row between">
          <span className="row soft">Motyw <ThemeToggle /></span>
          {passwordRequired && <button className="btn" onClick={signOut}><LogOut size={15} /> Wyloguj</button>}
        </div>
      </Modal>

      <Palette open={palette} onClose={() => setPalette(false)} />
      <AssistantButton />
    </div>
  );
}

/** Command palette: jump to any company by name, city, phone or email — or to a page. */
function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const leads = useQuery({ queryKey: ['leads'], queryFn: api.leads, enabled: open });
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const nav = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => input.current?.focus(), 40); } }, [open]);

  type Item = { key: string; label: string; sub?: string; stage?: string; go: () => void; avatar?: string; icon?: LucideIcon };
  const items: Item[] = useMemo(() => {
    const k = searchKey(q);
    const pages: Item[] = [
      ...NAV.flatMap((g) => g.items).map((n) => ({ key: n.to, label: n.label, icon: n.icon, go: () => nav(n.to) })),
      { key: '/ustawienia', label: 'Ustawienia', icon: Settings, go: () => nav('/ustawienia') },
    ];
    if (!k) return pages;
    const digits = q.replace(/\D/g, '');
    const hits = (leads.data || []).filter((l) =>
      searchKey(l.company).includes(k) || searchKey(l.city) === k || l.email.includes(k) || searchKey(l.person).includes(k) ||
      (digits.length >= 3 && l.phone.replace(/\D/g, '').includes(digits)) || l.id.toLowerCase() === k,
    ).sort((a, b) => Number(searchKey(b.company).startsWith(k)) - Number(searchKey(a.company).startsWith(k)) || b.priority - a.priority)
      .slice(0, 10)
      .map((l) => ({ key: l.id, label: l.company, sub: [l.city, l.segment, l.phone].filter(Boolean).join(' · '), stage: l.stage,
        avatar: l.company, go: () => nav(`/firmy/${l.id}`) }));
    return [...hits, ...pages.filter((p) => searchKey(p.label).includes(k))];
  }, [q, leads.data, nav]);

  const run = (i: Item) => { onClose(); i.go(); };
  return (
    <Modal open={open} onClose={onClose} title="Szukaj">
      <input ref={input} type="search" placeholder="Nazwa firmy, miasto, telefon, e-mail…" value={q}
        onChange={(e) => { setQ(e.target.value); setSel(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
          if (e.key === 'Enter' && items[sel]) run(items[sel]);
        }} />
      <div className="palette-list">
        {!q && <div className="group-label" style={{ paddingLeft: 10 }}>Przejdź do</div>}
        {items.map((it, i) => {
          const I = it.icon;
          return (
            <div key={it.key} className={`palette-item ${i === sel ? 'sel' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => run(it)}>
              {it.avatar ? <Avatar name={it.avatar} size="sm" /> : I ? <span className="type-ic"><I size={15} /></span> : null}
              <div className="grow">
                <div className="trunc" style={{ fontWeight: 600 }}>{it.label}</div>
                {it.sub && <div className="trunc small soft">{it.sub}</div>}
              </div>
              {it.stage && <StagePill stage={it.stage} />}
              {i === sel && <CornerDownLeft size={14} className="faint hide-sm" />}
            </div>
          );
        })}
        {q && leads.data && !items.length && <div className="empty">Nic nie znaleziono.</div>}
      </div>
    </Modal>
  );
}
