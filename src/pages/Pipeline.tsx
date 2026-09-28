import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Phone, Mail } from 'lucide-react';
import { api } from '../api';
import { DisqualifyDialog } from '../components/ActivityForms';
import { DueTag, ErrorBox, Loading, Prio, STAGE_COLOR, stageLabel, useAction, useConfig, useToday, Menu } from '../components/ui';
import { STAGES, STAGE_INFO, searchKey, type Lead, type Stage } from '../../shared/domain';

const PAGE = 30;

/**
 * Pipedrive-style board. Drag a card to another column to move the stage; on a
 * phone, use the ⋯ menu on the card. "New" is huge, so it shows the best-priority
 * leads first and grows on demand.
 */
export function PipelinePage() {
  const q = useQuery({ queryKey: ['leads'], queryFn: api.leads });
  const cfg = useConfig();
  const today = useToday();
  const [segment, setSegment] = useState('');
  const [find, setFind] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [limit, setLimit] = useState<Record<string, number>>({});
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [dq, setDq] = useState<Lead | null>(null);
  const move = useAction(({ id, stage }: { id: string; stage: string }) => api.setStage(id, stage),
    { ok: (c) => `${c.lead.company} → ${stageLabel(c.lead.stage)}` });

  const lanes = useMemo(() => {
    const k = searchKey(find);
    const by: Record<string, Lead[]> = Object.fromEntries(STAGES.map((s) => [s, []]));
    for (const l of q.data || []) {
      if (segment && l.segment !== segment) continue;
      if (k && !searchKey(l.company + ' ' + l.city).includes(k)) continue;
      by[l.stage]?.push(l);
    }
    for (const s of STAGES) {
      by[s].sort((a, b) => (a.nextContact || '9999').localeCompare(b.nextContact || '9999') || b.priority - a.priority);
    }
    by['new'].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
    return by;
  }, [q.data, segment, find]);

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;

  const stages = STAGES.filter((s) => showClosed || s !== 'disqualified');
  const drop = (stage: Stage) => {
    const l = q.data!.find((x) => x.id === drag);
    setDrag(null); setOver(null);
    if (!l || l.stage === stage) return;
    if (stage === 'disqualified') setDq(l);
    else move.mutate({ id: l.id, stage });
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Lejek</h1><div className="sub">Przeciągnij kartę do innej kolumny, żeby zmienić etap.</div></div>
        <span className="spacer" />
        <input type="search" placeholder="Filtruj…" value={find} onChange={(e) => setFind(e.target.value)} style={{ width: 200, height: 36 }} />
        <select value={segment} onChange={(e) => setSegment(e.target.value)} style={{ width: 'auto', height: 36 }}>
          <option value="">Wszystkie segmenty</option>
          {cfg.data?.segments.map((s) => <option key={s.name}>{s.name}</option>)}
        </select>
        <label className="row small soft"><input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} /> odrzucone</label>
      </div>

      <div className="board">
        {stages.map((s) => {
          const items = lanes[s];
          const n = limit[s] || PAGE;
          return (
            <section key={s} className={`lane ${over === s ? 'drop' : ''}`}
              onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(s); } }}
              onDragLeave={() => setOver((o) => (o === s ? null : o))}
              onDrop={(e) => { e.preventDefault(); drop(s); }}>
              <div className="lane-head" title={STAGE_INFO[s]}><b>{stageLabel(s)}</b><span className="count">{items.length}</span></div>
              <div className="lane-bar" style={{ background: STAGE_COLOR[s] }} />
              <div className="lane-cards">
                {items.slice(0, n).map((l) => (
                  <Link key={l.id} to={`/firmy/${l.id}`} className={`deal ${drag === l.id ? 'dragging' : ''}`} draggable
                    onDragStart={(e) => { setDrag(l.id); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnd={() => { setDrag(null); setOver(null); }}>
                    <div className="row top between">
                      <div className="t grow">{l.company}</div>
                      <span onClick={(e) => e.preventDefault()}>
                        <Menu trigger={(t) => <button className="btn ghost sm icon" onClick={t} aria-label="Przenieś">⋯</button>}>
                          {(close) => STAGES.filter((x) => x !== l.stage).map((x) => (
                            <button key={x} onClick={() => { close(); if (x === 'disqualified') setDq(l); else move.mutate({ id: l.id, stage: x }); }}>
                              <span className="d" style={{ width: 8, height: 8, borderRadius: 9, background: STAGE_COLOR[x] }} /> {stageLabel(x)}
                            </button>
                          ))}
                        </Menu>
                      </span>
                    </div>
                    <div className="m trunc">{[l.segment, l.city].filter(Boolean).join(' · ')}</div>
                    <div className="f">
                      <Prio n={l.priority} />
                      {l.nextContact ? <DueTag date={l.nextContact} today={today} />
                        : s !== 'active' && s !== 'disqualified' && s !== 'new' ? <span className="tag overdue"><CalendarClock size={11} /> brak kroku</span> : null}
                      <span className="grow" />
                      {l.phone && <Phone size={13} className="faint" />}
                      {l.email && <Mail size={13} className="faint" />}
                    </div>
                  </Link>
                ))}
                {items.length > n && (
                  <button className="btn sm ghost" onClick={() => setLimit({ ...limit, [s]: n + PAGE * 2 })}>Pokaż więcej ({items.length - n})</button>
                )}
                {!items.length && <div className="empty small" style={{ padding: 20 }}>Pusto</div>}
              </div>
            </section>
          );
        })}
      </div>
      <DisqualifyDialog lead={dq} onClose={() => setDq(null)} />
    </>
  );
}
