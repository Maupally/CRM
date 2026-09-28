import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.ts';
import { DueTag, ErrorBox, Loading, Modal, Prio, StagePill, relDay, useAction, useConfig, useToday } from '../components/ui.tsx';
import { STAGES, searchKey, type Lead } from '../../shared/domain.ts';

const IN_PLAY = ['contacting', 'scheduled visit', 'negotiation'];
type SortKey = 'priority' | 'company' | 'city' | 'stage' | 'next' | 'last';

export function LeadsPage() {
  const q = useQuery({ queryKey: ['leads'], queryFn: api.leads });
  const cfg = useConfig();
  const today = useToday();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [limit, setLimit] = useState(150);
  const [adding, setAdding] = useState(false);

  const f = {
    q: sp.get('q') || '', stage: sp.get('stage') || '', segment: sp.get('segment') || '', city: sp.get('city') || '',
    has: sp.get('has') || '', follow: sp.get('follow') || '', sort: (sp.get('sort') || 'priority') as SortKey,
    dir: sp.get('dir') === 'asc' ? 1 : -1,
  };
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    if (v) n.set(k, v); else n.delete(k);
    setSp(n, { replace: true });
    setLimit(150);
  };
  const sortBy = (k: SortKey) => {
    const n = new URLSearchParams(sp);
    const dir = f.sort === k ? (f.dir === 1 ? 'desc' : 'asc') : (k === 'priority' || k === 'last' ? 'desc' : 'asc');
    n.set('sort', k); n.set('dir', dir);
    setSp(n, { replace: true });
  };

  const cities = useMemo(() => {
    const c = new Map<string, number>();
    for (const l of q.data || []) if (l.city) c.set(l.city, (c.get(l.city) || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }, [q.data]);

  const rows = useMemo(() => {
    const all = q.data || [];
    const k = searchKey(f.q);
    const digits = f.q.replace(/\D/g, '');
    const out = all.filter((l) => {
      if (f.stage === 'in play' ? !IN_PLAY.includes(l.stage) : f.stage === 'open'
        ? ['active', 'disqualified'].includes(l.stage) : f.stage && l.stage !== f.stage) return false;
      if (f.segment && l.segment !== f.segment) return false;
      if (f.city && l.city !== f.city) return false;
      if (f.has === 'phone' && !l.phone) return false;
      if (f.has === 'email' && !l.email) return false;
      if (f.has === 'none' && (l.phone || l.email)) return false;
      if (f.follow === 'overdue' && !(l.nextContact && l.nextContact < today)) return false;
      if (f.follow === 'planned' && !l.nextContact) return false;
      if (f.follow === 'none' && (l.nextContact || ['active', 'disqualified'].includes(l.stage))) return false;
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
        case 'next': return l.nextContact || (f.dir === 1 ? '9999' : '');
        case 'last': return l.lastContact || '';
        default: return l.priority;
      }
    };
    out.sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : a.id.localeCompare(b.id)) * f.dir;
    });
    return out;
  }, [q.data, sp, today]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;

  const th = (k: SortKey, label: string, cls = '') => (
    <th className={`sort ${cls}`} onClick={() => sortBy(k)}>{label}{f.sort === k ? (f.dir === 1 ? ' ↑' : ' ↓') : ''}</th>
  );
  const filtered = !!(f.q || f.stage || f.segment || f.city || f.has || f.follow);

  return (
    <>
      <div className="page-head">
        <h1>Leads</h1>
        <span className="muted">{rows.length} of {q.data!.length}</span>
        <span className="spacer" />
        <button className="btn primary" onClick={() => setAdding(true)}>+ Add company</button>
      </div>

      <div className="card">
        <div className="filters">
          <input type="search" placeholder="Search name, city, person, notes, phone…" value={f.q}
            onChange={(e) => set('q', e.target.value)} autoFocus />
          <select value={f.stage} onChange={(e) => set('stage', e.target.value)}>
            <option value="">All stages</option>
            <option value="in play">In play (contacting → negotiation)</option>
            <option value="open">Not closed</option>
            {STAGES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={f.segment} onChange={(e) => set('segment', e.target.value)}>
            <option value="">All segments</option>
            {cfg.data?.segments.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.leads})</option>)}
          </select>
          <select value={f.city} onChange={(e) => set('city', e.target.value)}>
            <option value="">All cities</option>
            {cities.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select value={f.has} onChange={(e) => set('has', e.target.value)}>
            <option value="">Any contact</option>
            <option value="phone">Has phone</option>
            <option value="email">Has email</option>
            <option value="none">No contact data</option>
          </select>
          <select value={f.follow} onChange={(e) => set('follow', e.target.value)}>
            <option value="">Any follow-up</option>
            <option value="overdue">Overdue</option>
            <option value="planned">Something planned</option>
            <option value="none">Open, nothing planned</option>
          </select>
          {filtered && <button className="btn ghost sm" onClick={() => setSp(new URLSearchParams(), { replace: true })}>Clear</button>}
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                {th('priority', 'P', 'num')}
                {th('company', 'Company')}
                <th>Segment</th>
                {th('city', 'City')}
                {th('stage', 'Stage')}
                <th>Phone</th>
                {th('last', 'Last contact')}
                {th('next', 'Next')}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((l) => (
                <tr key={l.id} onClick={(e) => (e.metaKey || e.ctrlKey) ? window.open(`/leads/${l.id}`) : nav(`/leads/${l.id}`)}>
                  <td className="num"><Prio n={l.priority} /></td>
                  <td style={{ maxWidth: 340 }}>
                    <div className="company ellipsis">{l.company}</div>
                    {l.person && <div className="muted ellipsis" style={{ fontSize: 12.5 }}>{l.person}</div>}
                  </td>
                  <td className="muted nowrap" style={{ fontSize: 12.5 }}>{l.segment}</td>
                  <td className="nowrap">{l.city}</td>
                  <td><StagePill stage={l.stage} /></td>
                  <td className="nowrap mono">{l.phone || (l.email ? <span className="faint">email only</span> : <span className="faint">—</span>)}</td>
                  <td className="nowrap muted">{l.lastContact ? relDay(l.lastContact, today) : ''}</td>
                  <td className="nowrap">{l.nextContact && <DueTag date={l.nextContact} today={today} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <div className="empty">No leads match.</div>}
          {rows.length > limit && (
            <div style={{ padding: 12, textAlign: 'center' }}>
              <button className="btn" onClick={() => setLimit((n) => n + 300)}>Show more ({rows.length - limit} left)</button>
            </div>
          )}
        </div>
      </div>
      <AddCompany open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

function AddCompany({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cfg = useConfig();
  const nav = useNavigate();
  const empty = { company: '', segment: '', industry: '', city: '', phone: '', email: '', web: '', person: '', notes: '', source: 'Manual' };
  const [d, setD] = useState(empty);
  const act = useAction(() => api.createLead(d), {
    ok: (l) => `Added ${l.company}`,
    onDone: (l) => { setD(empty); onClose(); nav(`/leads/${l.id}`); },
  });
  const f = (k: keyof typeof empty, label: string, type = 'text') => (
    <label className="field"><span>{label}</span>
      <input type={type} value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} />
    </label>
  );
  const submit = (e: FormEvent) => { e.preventDefault(); act.mutate(undefined); };
  return (
    <Modal open={open} onClose={onClose} title="Add company" wide
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!d.company.trim() || act.isPending} onClick={() => act.mutate(undefined)}>Add</button></>}>
      <form onSubmit={submit} className="fields">
        <label className="field wide"><span>Company *</span>
          <input type="text" autoFocus value={d.company} onChange={(e) => setD({ ...d, company: e.target.value })} />
        </label>
        <label className="field"><span>Segment</span>
          <select value={d.segment} onChange={(e) => setD({ ...d, segment: e.target.value })}>
            <option value="">NIEZNANA</option>
            {cfg.data?.segments.filter((s) => s.name !== 'NIEZNANA').map((s) => <option key={s.name}>{s.name}</option>)}
          </select>
        </label>
        {f('industry', 'Industry')}
        {f('city', 'City')}
        {f('phone', 'Phone', 'tel')}
        {f('email', 'Email', 'email')}
        {f('web', 'Website')}
        {f('person', 'Person / role')}
        {f('source', 'Source')}
        <label className="field wide"><span>Notes</span>
          <textarea rows={2} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} />
        </label>
        <button hidden />
      </form>
      <div className="hint">Duplicates are blocked — “ABC Sp. z o.o.” and “abc” count as the same company.</div>
    </Modal>
  );
}
