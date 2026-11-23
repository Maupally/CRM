import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { X, Building2, SlidersHorizontal } from 'lucide-react';
import { api } from '../api';
import { DateChips, ReasonPicker } from '../components/ActivityForms';
import {
  Avatar, DueTag, Empty, ErrorBox, Loading, Modal, Prio, StagePill, relDay, stageLabel, useAction, useConfig, useToday,
} from '../components/ui';
import { STAGES, CLOSED_STAGES, searchKey, type Lead } from '../../shared/domain';

type ViewId = 'wszystkie' | 'kolejka' | 'wgrze' | 'zalegle' | 'bezkroku' | 'partnerzy' | 'bezkontaktu';
const IN_PLAY = ['contacting', 'scheduled visit', 'negotiation'];
const open = (l: Lead) => !CLOSED_STAGES.includes(l.stage);

const VIEWS: { id: ViewId; label: string; test: (l: Lead, today: string) => boolean; sort?: string }[] = [
  { id: 'wszystkie', label: 'Wszystkie', test: () => true },
  { id: 'kolejka', label: 'Kolejka telefonów', test: (l) => l.stage === 'new' && !l.openCount && !!(l.phone || l.email), sort: 'priority' },
  { id: 'wgrze', label: 'W grze', test: (l) => IN_PLAY.includes(l.stage), sort: 'next' },
  { id: 'zalegle', label: 'Zaległe follow-upy', test: (l, t) => !!l.nextContact && l.nextContact < t, sort: 'next' },
  { id: 'bezkroku', label: 'Bez następnego kroku', test: (l) => IN_PLAY.includes(l.stage) && !l.openCount, sort: 'last' },
  { id: 'partnerzy', label: 'Partnerzy', test: (l) => l.stage === 'active', sort: 'company' },
  { id: 'bezkontaktu', label: 'Bez kontaktu', test: (l) => open(l) && !l.phone && !l.email, sort: 'company' },
];

type SortKey = 'priority' | 'company' | 'city' | 'stage' | 'next' | 'last';

export function CompaniesPage() {
  const q = useQuery({ queryKey: ['leads'], queryFn: api.leads });
  const cfg = useConfig();
  const today = useToday();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [limit, setLimit] = useState(100);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<'' | 'stage' | 'segment' | 'plan'>('');
  const [showFilters, setShowFilters] = useState(false);

  const viewId = (sp.get('widok') || 'wszystkie') as ViewId;
  const view = VIEWS.find((v) => v.id === viewId) || VIEWS[0];
  const f = {
    q: sp.get('q') || '', stage: sp.get('etap') || '', segment: sp.get('segment') || '', city: sp.get('miasto') || '',
    sort: (sp.get('sort') || view.sort || 'priority') as SortKey, dir: sp.get('dir') === 'asc' ? 1 : sp.get('dir') === 'desc' ? -1 : 0,
  };
  const dir = f.dir || (['priority', 'last'].includes(f.sort) ? -1 : 1);
  const set = (patch: Record<string, string>) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) { if (v) n.set(k, v); else n.delete(k); }
    setSp(n, { replace: true });
    setLimit(100);
  };

  const cities = useMemo(() => {
    const c = new Map<string, number>();
    for (const l of q.data || []) if (l.city) c.set(l.city, (c.get(l.city) || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }, [q.data]);

  const counts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.id, (q.data || []).filter((l) => v.test(l, today)).length])), [q.data, today]);

  const rows = useMemo(() => {
    const k = searchKey(f.q);
    const digits = f.q.replace(/\D/g, '');
    const out = (q.data || []).filter((l) => {
      if (!view.test(l, today)) return false;
      if (f.stage && l.stage !== f.stage) return false;
      if (f.segment && l.segment !== f.segment) return false;
      if (f.city && l.city !== f.city) return false;
      if (k) {
        const hay = searchKey([l.company, l.city, l.industry, l.person, l.email, l.notes, l.id].join(' '));
        if (!hay.includes(k) && !(digits.length >= 3 && l.phone.replace(/\D/g, '').includes(digits))) return false;
      }
      return true;
    });
    const val = (l: Lead): string | number => {
      switch (f.sort) {
        case 'company': return searchKey(l.company);
        case 'city': return searchKey(l.city) || '~';
        case 'stage': return STAGES.indexOf(l.stage);
        case 'next': return l.nextContact || (dir === 1 ? '9999' : '');
        case 'last': return l.lastContact || '';
        default: return l.priority;
      }
    };
    return out.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : a.id.localeCompare(b.id)) * dir; });
  }, [q.data, sp, today]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;

  const shown = rows.slice(0, limit);
  const allSel = shown.length > 0 && shown.every((l) => sel.has(l.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const th = (k: SortKey, label: string, cls = '') => (
    <th className={`sort ${f.sort === k ? 'sorted' : ''} ${cls}`} onClick={() => set({ sort: k, dir: f.sort === k ? (dir === 1 ? 'desc' : 'asc') : '' })}>
      {label}{f.sort === k ? (dir === 1 ? ' ↑' : ' ↓') : ''}
    </th>
  );
  const filtered = !!(f.q || f.stage || f.segment || f.city);

  return (
    <>
      <div className="page-head">
        <div><h1>Firmy</h1><div className="sub">{q.data!.length} w bazie</div></div>
        <span className="spacer" />
      </div>

      <section className="card">
        <div className="views">
          {VIEWS.map((v) => (
            <button key={v.id} className={v.id === view.id ? 'on' : ''}
              onClick={() => { setSel(new Set()); setSp(v.id === 'wszystkie' ? {} : { widok: v.id }, { replace: true }); }}>
              {v.label}<span className="n">{counts[v.id]}</span>
            </button>
          ))}
        </div>
        <div className="toolbar">
          <input type="search" placeholder="Szukaj firmy, osoby, telefonu…" value={f.q} onChange={(e) => set({ q: e.target.value })} />
          <button className={`btn sm ${showFilters || f.stage || f.segment || f.city ? 'primary' : ''}`} onClick={() => setShowFilters((v) => !v)}>
            <SlidersHorizontal size={14} /> Filtry{[f.stage, f.segment, f.city].filter(Boolean).length ? ` (${[f.stage, f.segment, f.city].filter(Boolean).length})` : ''}
          </button>
          {filtered && <button className="btn ghost sm" onClick={() => set({ q: '', etap: '', segment: '', miasto: '' })}><X size={14} /> Wyczyść</button>}
          <span className="grow" />
          <span className="soft small">{rows.length}</span>
        </div>
        {(showFilters || f.stage || f.segment || f.city) && (
          <div className="toolbar" style={{ paddingTop: 0 }}>
            <select value={f.stage} onChange={(e) => set({ etap: e.target.value })}>
              <option value="">Każdy etap</option>
              {STAGES.map((s) => <option key={s} value={s}>{stageLabel(s)}</option>)}
            </select>
            <select value={f.segment} onChange={(e) => set({ segment: e.target.value })}>
              <option value="">Każdy segment</option>
              {cfg.data?.segments.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.leads})</option>)}
            </select>
            <select value={f.city} onChange={(e) => set({ miasto: e.target.value })}>
              <option value="">Każde miasto</option>
              {cities.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        )}

        {/* desktop: table */}
        <div className="table-wrap hide-sm">
          <table className="tbl">
            <thead>
              <tr>
                <th className="chk"><input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(shown.map((l) => l.id)))} aria-label="Zaznacz wszystkie" /></th>
                {th('company', 'Firma')}
                {th('stage', 'Etap')}
                {th('next', 'Następny krok')}
                {th('last', 'Ostatni kontakt')}
                {th('priority', 'Prio', 'num')}
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => (
                <tr key={l.id} className={sel.has(l.id) ? 'sel' : ''}
                  onClick={(e) => (e.metaKey || e.ctrlKey) ? window.open(`/firmy/${l.id}`) : nav(`/firmy/${l.id}`)}>
                  <td className="chk" onClick={(e) => { e.stopPropagation(); toggle(l.id); }}>
                    <input type="checkbox" checked={sel.has(l.id)} readOnly aria-label="Zaznacz" />
                  </td>
                  <td style={{ maxWidth: 440 }}>
                    <div className="row"><Avatar name={l.company} size="sm" />
                      <div className="grow"><div className="trunc" style={{ fontWeight: 600 }}>{l.company}</div>
                        <div className="trunc small soft">{[l.city, l.segment, l.person].filter(Boolean).join(' · ') || '—'}</div></div></div>
                  </td>
                  <td><StagePill stage={l.stage} /></td>
                  <td className="nowrap">{l.nextContact ? <DueTag date={l.nextContact} today={today} /> : <span className="faint">—</span>}</td>
                  <td className="nowrap soft">{l.lastContact ? relDay(l.lastContact, today) : <span className="faint">—</span>}</td>
                  <td className="num"><Prio n={l.priority} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* phone: cards */}
        <ul className="list only-sm">
          {shown.map((l) => (
            <li key={l.id} className="li">
              <input type="checkbox" checked={sel.has(l.id)} onChange={() => toggle(l.id)} aria-label="Zaznacz" />
              <Link to={`/firmy/${l.id}`} className="row grow" style={{ gap: 12 }}>
                <Avatar name={l.company} size="sm" />
                <div className="grow">
                  <div className="title trunc">{l.company}</div>
                  <div className="meta trunc">{[l.city, l.segment].filter(Boolean).join(' · ')}</div>
                  <div className="row" style={{ marginTop: 5, gap: 6 }}><StagePill stage={l.stage} />{l.nextContact && <DueTag date={l.nextContact} today={today} />}</div>
                </div>
                <Prio n={l.priority} />
              </Link>
            </li>
          ))}
        </ul>

        {!rows.length && <Empty icon={Building2}>Brak firm w tym widoku.</Empty>}
        {rows.length > limit && (
          <div className="pad" style={{ textAlign: 'center' }}>
            <button className="btn" onClick={() => setLimit((n) => n + 300)}>Pokaż więcej ({rows.length - limit})</button>
          </div>
        )}
      </section>

      {sel.size > 0 && (
        <div className="bulkbar">
          <b>{sel.size} zazn.</b>
          <button className="btn sm" onClick={() => setBulk('stage')}>Zmień etap</button>
          <button className="btn sm" onClick={() => setBulk('segment')}>Zmień segment</button>
          <button className="btn sm icon" onClick={() => setSel(new Set())} aria-label="Odznacz"><X size={14} /></button>
        </div>
      )}
      <BulkDialog mode={bulk} ids={[...sel]} onClose={(done) => { setBulk(''); if (done) setSel(new Set()); }} />
    </>
  );
}

function BulkDialog({ mode, ids, onClose }: { mode: '' | 'stage' | 'segment' | 'plan'; ids: string[]; onClose: (done: boolean) => void }) {
  const cfg = useConfig();
  const [stage, setStage] = useState('');
  const [reason, setReason] = useState('');
  const [segment, setSegment] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const reset = () => { setStage(''); setReason(''); setSegment(''); setDate(''); setNote(''); };
  const act = useAction(() => api.bulk({
    ids, stage: mode === 'stage' ? stage : undefined, reason: reason || undefined,
    segment: mode === 'segment' ? segment : undefined, plan: mode === 'plan' ? { date, type: 'Call', note } : undefined,
  }), { ok: (r) => `Zmieniono ${r.changed} firm`, onDone: () => { reset(); onClose(true); } });
  const ready = mode === 'stage' ? !!stage && (stage !== 'disqualified' || !!reason.trim()) : mode === 'segment' ? !!segment : !!date;
  const title = mode === 'stage' ? 'Zmień etap' : mode === 'segment' ? 'Zmień segment' : 'Zaplanuj telefon';
  return (
    <Modal open={!!mode} onClose={() => { reset(); onClose(false); }} title={`${title} · ${ids.length} firm`}
      footer={<><button className="btn" onClick={() => { reset(); onClose(false); }}>Anuluj</button>
        <button className="btn primary" disabled={!ready || act.isPending} onClick={() => act.mutate(undefined)}>Zastosuj</button></>}>
      {mode === 'stage' && (
        <>
          <div className="chips">
            {STAGES.map((s) => <button key={s} className={`chip ${stage === s ? 'on' : ''}`} onClick={() => setStage(s)}>{stageLabel(s)}</button>)}
          </div>
          {stage === 'disqualified' && <ReasonPicker value={reason} onChange={setReason} />}
        </>
      )}
      {mode === 'segment' && (
        <select value={segment} onChange={(e) => setSegment(e.target.value)}>
          <option value="">Wybierz segment…</option>
          {cfg.data?.segments.map((s) => <option key={s.name}>{s.name}</option>)}
        </select>
      )}
      {mode === 'plan' && (
        <>
          <DateChips value={date} onChange={setDate} />
          <input type="text" placeholder="Po co? (opcjonalnie)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="hint">Odrzuconym i partnerom nic nie zostanie zaplanowane.</div>
        </>
      )}
    </Modal>
  );
}
