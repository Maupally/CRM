import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.ts';
import { CompleteDialog, LogPanel } from '../components/ActivityForms.tsx';
import {
  DueTag, ErrorBox, Loading, Modal, Prio, ResultTag, StagePill, copyText, relDay, stageClass, typeIcon, useAction,
  useConfig, useToast, useToday,
} from '../components/ui.tsx';
import { DISQUALIFY_REASONS, STAGES, STAGE_INFO, TYPES, type Activity, type Lead, type Segment } from '../../shared/domain.ts';

export function LeadPage() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['lead', id], queryFn: () => api.lead(id) });
  const cfg = useConfig();
  const today = useToday();
  const [completing, setCompleting] = useState<Activity | null>(null);
  const [dq, setDq] = useState(false);

  const stage = useAction((s: string) => api.setStage(id, s), { ok: (c) => `Stage: ${c.lead.stage}` });
  const segment = useAction((s: string) => api.updateLead(id, { segment: s }), { ok: 'Segment changed — pitch updated' });

  useEffect(() => { if (q.data) document.title = `${q.data.lead.company} · CRM`; return () => { document.title = 'B2B CRM'; }; }, [q.data]);

  if (q.isLoading) return <Loading />;
  if (q.error) return <><Link to="/leads" className="btn ghost sm">← Leads</Link><ErrorBox error={q.error} /></>;
  const { lead, activities, playbook, events } = q.data!;
  const planned = activities.filter((a) => a.result === 'planned');
  const past = activities.filter((a) => a.result !== 'planned');

  return (
    <>
      <div className="lead-head">
        <div className="grow">
          <div className="row" style={{ marginBottom: 6 }}>
            <Link to="/leads" className="btn ghost sm" onClick={(e) => { if (history.length > 1) { e.preventDefault(); history.back(); } }}>← Back</Link>
            <span className="faint mono">{lead.id}</span>
          </div>
          <div className="row wrap">
            <h1>{lead.company}</h1>
            <StagePill stage={lead.stage} />
            <Prio n={lead.priority} />
          </div>
          <div className="muted" style={{ marginTop: 4 }}>
            {[lead.industry, lead.city, lead.person, lead.source && `source: ${lead.source}`].filter(Boolean).join(' · ')}
          </div>
          <div className="contact-links">
            {lead.phone && <a href={`tel:${lead.phone.replace(/\s/g, '')}`}>☎ {lead.phone}</a>}
            {lead.email && <a href={`mailto:${lead.email}`}>✉ {lead.email}</a>}
            {lead.web && <a href={lead.web} target="_blank" rel="noreferrer">↗ {lead.web.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a>}
            {!lead.phone && !lead.email && (
              <a href={`https://www.google.com/search?q=${encodeURIComponent(lead.company + ' ' + lead.city + ' kontakt')}`} target="_blank" rel="noreferrer">
                No contact data — search Google ↗
              </a>
            )}
            {lead.extra && <span className="muted">+ {lead.extra}</span>}
          </div>
        </div>
        <div className="stack tight" style={{ alignItems: 'flex-end' }}>
          <div className="stages">
            {STAGES.map((s) => (
              <button key={s} className={s === lead.stage ? `on ${stageClass(s)}` : ''} title={STAGE_INFO[s]}
                disabled={stage.isPending}
                onClick={() => s === lead.stage ? null : s === 'disqualified' ? setDq(true) : stage.mutate(s)}>{s}</button>
            ))}
          </div>
          <div className="row">
            <span className="muted" style={{ fontSize: 12.5 }}>Segment</span>
            <select value={lead.segment} onChange={(e) => segment.mutate(e.target.value)} style={{ width: 'auto', height: 28 }}>
              {!cfg.data?.segments.some((s) => s.name === lead.segment) && <option>{lead.segment}</option>}
              {cfg.data?.segments.map((s) => <option key={s.name}>{s.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="grid two">
        <div className="stack">
          <section className="card"><LogPanel key={lead.id} lead={lead} /></section>

          <section className="card">
            <div className="card-head">
              <h2>Activity</h2>
              <span className="muted">
                {lead.lastContact ? `last contact ${relDay(lead.lastContact, today)}` : 'never contacted'}
              </span>
            </div>
            <ul className="timeline">
              {planned.map((a) => (
                <TimelineRow key={a.id} a={a} today={today} onComplete={() => setCompleting(a)} />
              ))}
              {past.map((a) => <TimelineRow key={a.id} a={a} today={today} />)}
              {!activities.length && <li className="empty" style={{ display: 'block' }}>No activity yet.</li>}
            </ul>
          </section>
        </div>

        <div className="stack">
          <Pitch lead={lead} playbook={playbook} />
          <Notes lead={lead} />
          <Templates lead={lead} />
          <Details lead={lead} />
          {events.length > 0 && (
            <section className="card">
              <div className="card-head"><h2>Events</h2></div>
              <ul className="list">
                {events.map((e) => (
                  <li key={e.id} className="item"><span className="muted">{relDay(e.date, today)}</span>
                    <Link className="title" to={`/events/${e.id}`}>{e.title}</Link></li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <CompleteDialog activity={completing} stage={lead.stage} company={lead.company} onClose={() => setCompleting(null)} />
      <Disqualify open={dq} lead={lead} onClose={() => setDq(false)} />
    </>
  );
}

function Disqualify({ open, lead, onClose }: { open: boolean; lead: Lead; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const full = [reason, detail.trim()].filter(Boolean).join(' — ');
  const act = useAction(() => api.setStage(lead.id, 'disqualified', full), {
    ok: 'Disqualified', onDone: () => { setReason(''); setDetail(''); onClose(); },
  });
  return (
    <Modal open={open} onClose={onClose} title={`Disqualify ${lead.company}`}
      footer={<><button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!full || act.isPending} onClick={() => act.mutate(undefined)}>Disqualify</button></>}>
      <div className="chips">
        {DISQUALIFY_REASONS.map((r) => <button key={r} className={`chip ${reason === r ? 'on' : ''}`} onClick={() => setReason(r)}>{r}</button>)}
      </div>
      <textarea rows={2} placeholder="Details (what exactly did they say?)" value={detail} onChange={(e) => setDetail(e.target.value)} />
      {lead.openCount > 0 && <div className="hint">{lead.openCount} planned follow-up(s) will be cancelled.</div>}
    </Modal>
  );
}

function TimelineRow({ a, today, onComplete }: { a: Activity; today: string; onComplete?: () => void }) {
  const [edit, setEdit] = useState(false);
  const [note, setNote] = useState(a.note);
  const [date, setDate] = useState(a.date);
  const [type, setType] = useState<string>(a.type);
  const save = useAction(() => api.updateActivity(a.id, { note, date, type }), { ok: 'Saved', onDone: () => setEdit(false) });
  const drop = useAction(() => api.deleteActivity(a.id), { ok: 'Deleted' });
  const isPlanned = a.result === 'planned';
  const cls = [isPlanned ? 'planned' : '', isPlanned && a.date < today ? 'overdue' : '', a.result === 'cancelled' ? 'muted-row' : ''].join(' ');

  return (
    <li className={cls}>
      <div className="when">{isPlanned ? <DueTag date={a.date} today={today} /> : relDay(a.date, today)}</div>
      <div className="what">
        {edit ? (
          <div className="stack tight">
            <div className="row wrap">
              <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: 110 }}>
                {TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 150 }}
                max={isPlanned ? undefined : today} />
            </div>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
            <div className="row">
              <button className="btn sm primary" onClick={() => save.mutate(undefined)} disabled={save.isPending}>Save</button>
              <button className="btn sm" onClick={() => { setEdit(false); setNote(a.note); setDate(a.date); setType(a.type); }}>Cancel</button>
              <span className="grow" />
              <button className="btn sm danger" onClick={() => confirm('Delete this entry?') && drop.mutate(undefined)}>Delete</button>
            </div>
          </div>
        ) : (
          <>
            <div className="meta">
              <span>{typeIcon(a.type)} <b>{a.type}</b></span>
              {a.type !== 'Note' || a.result !== 'done' ? <ResultTag result={a.result} /> : null}
              {a.stageTo && <span className="row" style={{ gap: 4 }}><StagePill stage={a.stageFrom} /> → <StagePill stage={a.stageTo} /></span>}
            </div>
            {a.note && <div className="note">{a.note}</div>}
          </>
        )}
      </div>
      <div className="actions">
        {!edit && onComplete && <button className="btn sm primary" onClick={onComplete}>Done…</button>}
        {!edit && <button className="btn sm ghost icon" title="Edit" onClick={() => setEdit(true)}>✎</button>}
      </div>
    </li>
  );
}

function Pitch({ lead, playbook }: { lead: Lead; playbook: Segment | null }) {
  if (!playbook || !(playbook.opening || playbook.hook || playbook.why)) {
    return (
      <section className="card card-pad">
        <div className="muted">
          No pitch for segment <b>{lead.segment}</b>.{' '}
          {lead.segment === 'NIEZNANA' ? '30 seconds on Google, then pick a segment above — the pitch appears by itself.' :
            <Link to="/playbook">Write one in the Playbook →</Link>}
        </div>
      </section>
    );
  }
  const items: [string, string][] = [
    ['Opening', playbook.opening], ['Hook', playbook.hook], ['Offer', playbook.offer], ['Call to action', playbook.cta],
    ['Objections', playbook.objections], ['Who to ask for', playbook.who], ['Goal', playbook.goal],
  ];
  return (
    <section className="card">
      <div className="card-head"><h2>Pitch · {playbook.name}</h2><Link className="btn sm ghost" to="/playbook">Edit</Link></div>
      <div className="card-pad stack">
        {playbook.why && <div className="why"><b>Why I'm calling:</b> {playbook.why}</div>}
        <dl className="pitch" style={{ margin: 0 }}>
          {items.filter(([, v]) => v).map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{k === 'Objections' ? v.split(/\s*\|\s*/).join('\n') : v}</dd></div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Notes({ lead }: { lead: Lead }) {
  const [v, setV] = useState(lead.notes);
  useEffect(() => setV(lead.notes), [lead.notes]);
  const save = useAction(() => api.updateLead(lead.id, { notes: v }), { ok: 'Notes saved' });
  const dirty = v !== lead.notes;
  return (
    <section className="card">
      <div className="card-head"><h2>Notes</h2>
        {dirty && <button className="btn sm primary" onClick={() => save.mutate(undefined)} disabled={save.isPending}>Save</button>}
      </div>
      <div className="card-pad">
        <textarea rows={4} value={v} onChange={(e) => setV(e.target.value)} placeholder="Standing facts about this company — who decides, what they care about. Call notes go in the activity log."
          onBlur={() => dirty && save.mutate(undefined)} />
      </div>
    </section>
  );
}

function Templates({ lead }: { lead: Lead }) {
  const cfg = useConfig();
  const toast = useToast();
  const [code, setCode] = useState('');
  const t = useQuery({ queryKey: ['tpl', lead.id, code], queryFn: () => api.renderTemplate(lead.id, code), enabled: !!code });
  const logged = useAction(() => api.log(lead.id, { type: 'Email', result: 'done', note: `Sent ${code}: ${t.data?.subject || ''}` }),
    { ok: 'Logged as sent' });
  const templates = cfg.data?.templates || [];
  const fits = (segments: string) => /wszystkie|telefon/i.test(segments) || segments.split(/\s*,\s*/).includes(lead.segment);
  const sorted = [...templates].sort((a, b) => Number(fits(b.segments)) - Number(fits(a.segments)));

  return (
    <section className="card">
      <div className="card-head"><h2>Templates</h2></div>
      <div className="card-pad stack">
        <select value={code} onChange={(e) => setCode(e.target.value)}>
          <option value="">Pick a template…</option>
          {sorted.map((x) => <option key={x.code} value={x.code}>{fits(x.segments) ? '★ ' : ''}{x.code} · {x.kind}</option>)}
        </select>
        {t.data && (
          <>
            {t.data.subject && <div><b>{t.data.subject}</b></div>}
            <div className="pre muted" style={{ maxHeight: 220, overflow: 'auto', fontSize: 13 }}>{t.data.body}</div>
            <div className="row wrap">
              {lead.email && t.data.subject && (
                <a className="btn sm primary" href={`mailto:${lead.email}?subject=${encodeURIComponent(t.data.subject)}&body=${encodeURIComponent(t.data.body)}`}>
                  Open in mail
                </a>
              )}
              <button className="btn sm" onClick={() => { copyText((t.data!.subject ? t.data!.subject + '\n\n' : '') + t.data!.body); toast('Copied'); }}>Copy</button>
              {t.data.subject && <button className="btn sm" onClick={() => logged.mutate(undefined)} disabled={logged.isPending}>Log as sent</button>}
            </div>
            {/\[[^\]]+\]/.test(t.data.body) && <div className="hint">Fill the remaining [placeholders] before sending.</div>}
          </>
        )}
      </div>
    </section>
  );
}

function Details({ lead }: { lead: Lead }) {
  const nav = useNavigate();
  const [edit, setEdit] = useState(false);
  const pick = (l: Lead) => ({ company: l.company, industry: l.industry, city: l.city, phone: l.phone, email: l.email,
    web: l.web, person: l.person, extra: l.extra, source: l.source });
  const [d, setD] = useState(pick(lead));
  useEffect(() => setD(pick(lead)), [lead]);
  const save = useAction(() => api.updateLead(lead.id, d), { ok: 'Saved', onDone: () => setEdit(false) });
  const del = useAction(() => api.deleteLead(lead.id), { ok: 'Deleted', onDone: () => nav('/leads') });
  const labels: Record<keyof ReturnType<typeof pick>, string> = {
    company: 'Company', industry: 'Industry', city: 'City', phone: 'Phone', email: 'Email', web: 'Website',
    person: 'Person / role', extra: 'Other contacts', source: 'Source',
  };
  return (
    <section className="card">
      <div className="card-head"><h2>Details</h2>
        {!edit && <button className="btn sm ghost" onClick={() => setEdit(true)}>Edit</button>}
      </div>
      <div className="card-pad">
        {edit ? (
          <div className="stack">
            <div className="fields">
              {(Object.keys(labels) as (keyof typeof labels)[]).map((k) => (
                <label key={k} className={`field ${k === 'company' || k === 'extra' ? 'wide' : ''}`}><span>{labels[k]}</span>
                  <input type="text" value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} />
                </label>
              ))}
            </div>
            <div className="row">
              <button className="btn primary" onClick={() => save.mutate(undefined)} disabled={save.isPending}>Save</button>
              <button className="btn" onClick={() => { setEdit(false); setD(pick(lead)); }}>Cancel</button>
              <span className="grow" />
              <button className="btn danger sm" onClick={() => confirm(`Delete ${lead.company} and its whole history? This cannot be undone.`) && del.mutate(undefined)}>
                Delete company
              </button>
            </div>
          </div>
        ) : (
          <dl className="pitch" style={{ margin: 0 }}>
            {(Object.keys(labels) as (keyof typeof labels)[]).filter((k) => lead[k]).map((k) => (
              <div key={k}><dt>{labels[k]}</dt><dd>{lead[k]}</dd></div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
