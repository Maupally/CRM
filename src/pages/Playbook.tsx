import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.ts';
import { ErrorBox, Loading, Modal, Seg, useAction } from '../components/ui.tsx';
import type { Segment, Template } from '../../shared/domain.ts';

export function PlaybookPage() {
  const [tab, setTab] = useState<'segments' | 'templates'>('segments');
  return (
    <>
      <div className="page-head">
        <h1>Playbook</h1>
        <Seg value={tab} options={['segments', 'templates'] as const} onChange={setTab} labels={{ segments: 'Segments & pitch', templates: 'Templates' }} />
      </div>
      {tab === 'segments' ? <Segments /> : <Templates />}
    </>
  );
}

type SegRow = Segment & { leads: number };
const FIELDS: [keyof Segment, string, number][] = [
  ['why', 'Why I’m calling (one sentence — shown on every lead)', 2],
  ['goal', 'Goal of the partnership', 2], ['who', 'Who to ask for', 2], ['opening', 'Opening line (phone)', 3],
  ['hook', 'Hook', 3], ['offer', 'Offer', 3], ['cta', 'Call to action', 2],
  ['objections', 'Objections and answers (separate with |)', 4],
];

function Segments() {
  const q = useQuery({ queryKey: ['segments'], queryFn: api.segments });
  const [sel, setSel] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const list = q.data!;
  const current = creating ? null : list.find((s) => s.name === sel) || list[0];

  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(220px, 280px) 1fr' }}>
      <section className="card">
        <ul className="list">
          {list.map((s) => (
            <li key={s.name} className="item" style={{ cursor: 'pointer', background: !creating && current?.name === s.name ? 'var(--panel-2)' : undefined }}
              onClick={() => { setCreating(false); setSel(s.name); }}>
              <div className="grow">
                <div className="title">{s.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>weight {s.weight} · {s.leads} leads</div>
              </div>
              {!s.opening && <span className="tag" title="No pitch yet">empty</span>}
            </li>
          ))}
        </ul>
        <div className="card-pad"><button className="btn" style={{ width: '100%' }} onClick={() => setCreating(true)}>+ New segment</button></div>
      </section>
      <SegmentForm key={creating ? '__new' : current?.name} seg={creating ? null : current || null}
        onSaved={(n) => { setCreating(false); setSel(n); }} />
    </div>
  );
}

function SegmentForm({ seg, onSaved }: { seg: SegRow | null; onSaved: (name: string) => void }) {
  const blank: Partial<Segment> = { name: '', weight: 2 };
  const [d, setD] = useState<Partial<Segment>>(seg || blank);
  useEffect(() => setD(seg || blank), [seg]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useAction(() => api.saveSegment({ ...d, originalName: seg?.name }), { ok: 'Saved', onDone: (s) => onSaved(s.name) });
  const del = useAction(() => api.deleteSegment(seg!.name), { ok: 'Deleted', onDone: () => onSaved('') });

  return (
    <section className="card">
      <div className="card-head"><h2>{seg ? seg.name : 'New segment'}</h2>
        {seg && <Link className="btn sm ghost" to={`/leads?segment=${encodeURIComponent(seg.name)}`}>{seg.leads} leads →</Link>}
      </div>
      <div className="card-pad stack">
        <div className="fields">
          <label className="field"><span>Name</span>
            <input type="text" value={d.name || ''} onChange={(e) => setD({ ...d, name: e.target.value })} /></label>
          <label className="field"><span>Priority weight (0–10)</span>
            <input type="number" min={0} max={10} step={1} value={d.weight ?? 1} onChange={(e) => setD({ ...d, weight: Number(e.target.value) })} /></label>
        </div>
        <div className="hint">Priority = weight + 2 if phone + 1 if email + 3 while a visit or negotiation is on.</div>
        {FIELDS.map(([k, label, rows]) => (
          <label key={k} className="field"><span>{label}</span>
            <textarea rows={rows} value={String(d[k] ?? '')} onChange={(e) => setD({ ...d, [k]: e.target.value })} /></label>
        ))}
        <div className="row">
          <button className="btn primary" onClick={() => save.mutate(undefined)} disabled={!d.name?.trim() || save.isPending}>Save</button>
          <span className="grow" />
          {seg && <button className="btn danger" disabled={seg.leads > 0} title={seg.leads ? 'Move its leads to another segment first' : ''}
            onClick={() => confirm(`Delete segment ${seg.name}?`) && del.mutate(undefined)}>Delete</button>}
        </div>
      </div>
    </section>
  );
}

function Templates() {
  const q = useQuery({ queryKey: ['templates'], queryFn: api.templates });
  const [edit, setEdit] = useState<(Partial<Template> & { originalCode?: string }) | null>(null);
  const save = useAction(() => api.saveTemplate(edit!), { ok: 'Saved', onDone: () => setEdit(null) });
  const del = useAction(() => api.deleteTemplate(edit!.originalCode!), { ok: 'Deleted', onDone: () => setEdit(null) });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;

  return (
    <>
      <section className="card">
        <div className="card-head"><h2>Templates</h2><span className="hint">[Firma] [Miasto] [Osoba] fill in automatically</span>
          <button className="btn sm primary" onClick={() => setEdit({ code: '', kind: '', segments: '', subject: '', body: '' })}>+ New</button></div>
        <ul className="list">
          {q.data!.map((t) => (
            <li key={t.code} className="item" style={{ cursor: 'pointer' }} onClick={() => setEdit({ ...t, originalCode: t.code })}>
              <span className="tag">{t.code}</span>
              <div className="grow">
                <div className="title">{t.kind}</div>
                <div className="muted ellipsis" style={{ fontSize: 12.5 }}>{t.subject || t.body.slice(0, 120)}</div>
              </div>
              <span className="muted" style={{ fontSize: 12 }}>{t.segments}</span>
            </li>
          ))}
        </ul>
      </section>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.originalCode ? `Template ${edit.originalCode}` : 'New template'} wide
        footer={<>
          {edit?.originalCode && <button className="btn danger" style={{ marginRight: 'auto' }} onClick={() => confirm('Delete template?') && del.mutate(undefined)}>Delete</button>}
          <button className="btn" onClick={() => setEdit(null)}>Cancel</button>
          <button className="btn primary" disabled={!edit?.code?.trim() || save.isPending} onClick={() => save.mutate(undefined)}>Save</button>
        </>}>
        {edit && (
          <div className="fields">
            <label className="field"><span>Code</span><input type="text" value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></label>
            <label className="field"><span>Kind</span><input type="text" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })} /></label>
            <label className="field wide"><span>For segments (comma-separated, or “wszystkie”)</span>
              <input type="text" value={edit.segments} onChange={(e) => setEdit({ ...edit, segments: e.target.value })} /></label>
            <label className="field wide"><span>Subject</span><input type="text" value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} /></label>
            <label className="field wide"><span>Body</span><textarea rows={14} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></label>
          </div>
        )}
      </Modal>
    </>
  );
}
