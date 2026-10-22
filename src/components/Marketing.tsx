/**
 * Content calendar, its monthly report and the partnership backlog. The same views run inside Opal5 and in the
 * team space opened by a personal link — only the client (which API it talks to) differs.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ExternalLink, Plus, Trash2 } from 'lucide-react';
import type { MarketingClient, TeamContext } from '../api';
import { Empty, Modal, useAction, useToday } from './ui';
import { addDays, shortDate, weekday } from '../../shared/domain';
import {
  CHANNELS, CONTENT_KINDS, CONTENT_STATUS, CONTENT_STATUS_LABEL, PARTNER_STATUS, PARTNER_STATUS_LABEL,
  type ContentItem, type ContentStatus, type PartnerIdea, type PartnerStatus,
} from '../../shared/marketing';

const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const WD = ['pon', 'wt', 'śr', 'czw', 'pt', 'sob', 'nd'];
const shiftMonth = (m: string, n: number) => { const d = new Date(`${m}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
const monthEnd = (m: string) => addDays(`${shiftMonth(m, 1)}-01`, -1);
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;

export function useTeamContext(client: MarketingClient) {
  return useQuery({ queryKey: [client.key, 'context'], queryFn: client.context, staleTime: 5 * 60_000 });
}

function Pill({ status }: { status: ContentStatus | PartnerStatus }) {
  return <span className={`mk-pill mk-${status}`}>{(CONTENT_STATUS_LABEL as Record<string, string>)[status] || (PARTNER_STATUS_LABEL as Record<string, string>)[status]}</span>;
}

/* ------------------------------------------------------------ content calendar */

export function ContentCalendar({ client }: { client: MarketingClient }) {
  const today = useToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [status, setStatus] = useState<'' | ContentStatus>('');
  const [owner, setOwner] = useState('');
  const [edit, setEdit] = useState<Partial<ContentItem> | null>(null);
  const from = `${month}-01`;
  const to = monthEnd(month);
  const q = useQuery({ queryKey: [client.key, 'content', month], queryFn: () => client.content(from, to) });
  const ctx = useTeamContext(client);
  const all = q.data || [];
  const owners = [...new Set(all.map((c) => c.owner).filter(Boolean))].sort();
  const shown = all.filter((c) => (!status || c.status === status) && (!owner || c.owner === owner));
  const undated = shown.filter((c) => !c.day);
  const byDay = useMemo(() => {
    const m = new Map<string, ContentItem[]>();
    for (const c of shown.filter((x) => x.day)) m.set(c.day, [...(m.get(c.day) || []), c]);
    return [...m].sort((a, b) => a[0].localeCompare(b[0]));
  }, [shown]);
  const events = (ctx.data?.events || []).filter((e) => e.date >= from && e.date <= to);

  return (
    <>
      <div className="toolbar wrap">
        <div className="row" style={{ gap: 4 }}>
          <button className="btn sm icon" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Poprzedni miesiąc"><ChevronLeft size={16} /></button>
          <b style={{ minWidth: 150, textAlign: 'center', textTransform: 'capitalize' }}>{monthLabel(month)}</b>
          <button className="btn sm icon" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Następny miesiąc"><ChevronRight size={16} /></button>
        </div>
        <div className="chips">
          <button className={`chip ${!status ? 'on' : ''}`} onClick={() => setStatus('')}>Wszystko</button>
          {CONTENT_STATUS.filter((s) => s !== 'dropped').map((s) => (
            <button key={s} className={`chip ${status === s ? 'on' : ''}`} onClick={() => setStatus(status === s ? '' : s)}>{CONTENT_STATUS_LABEL[s]}</button>
          ))}
        </div>
        {owners.length > 1 && (
          <select value={owner} onChange={(e) => setOwner(e.target.value)} style={{ width: 'auto' }}>
            <option value="">Wszyscy</option>{owners.map((o) => <option key={o}>{o}</option>)}
          </select>
        )}
        <span className="grow" />
        <button className="btn sm primary" onClick={() => setEdit({ day: month === today.slice(0, 7) ? today : from, status: 'idea', owner: ctx.data?.name || '' })}><Plus size={14} /> Dodaj treść</button>
      </div>
      {events.length > 0 && (
        <div className="mk-events">{events.map((e) => <span key={e.id} className="tag soon">{shortDate(e.date)} · {e.title}</span>)}</div>
      )}
      {!q.isLoading && !shown.length && <Empty>Nic tu jeszcze nie ma. Dodaj pierwszą treść — post, rolkę, maila albo udostępnienie na grupach.</Empty>}
      {byDay.map(([day, items]) => (
        <div key={day} className={`mk-day ${day < today ? 'past' : ''} ${day === today ? 'today' : ''}`}>
          <div className="mk-date"><b>{shortDate(day)}</b><span>{WD[weekday(day)]}</span></div>
          <div className="mk-items">
            {items.map((c) => <ContentCard key={c.id} c={c} today={today} onOpen={() => setEdit(c)} />)}
            {(ctx.data?.events || []).filter((e) => e.date === day).map((e) => <div key={e.id} className="small soft">📅 {e.title}</div>)}
          </div>
        </div>
      ))}
      {undated.length > 0 && (
        <>
          <div className="group-label">Bez daty · {undated.length}</div>
          <div className="mk-items" style={{ padding: '0 20px 16px' }}>{undated.map((c) => <ContentCard key={c.id} c={c} today={today} onOpen={() => setEdit(c)} />)}</div>
        </>
      )}
      <ContentForm client={client} ctx={ctx.data} value={edit} onClose={() => setEdit(null)} />
    </>
  );
}

function ContentCard({ c, today, onOpen }: { c: ContentItem; today: string; onOpen: () => void }) {
  const late = c.status !== 'published' && c.status !== 'dropped' && !!c.day && c.day < today;
  return (
    <button className={`mk-card ${c.status} ${late ? 'late' : ''}`} onClick={onOpen}>
      <div className="row between" style={{ gap: 8 }}>
        <span className="small soft trunc">{[c.channel, c.kind].filter(Boolean).join(' · ') || 'Treść'}</span>
        <Pill status={c.status} />
      </div>
      <div className="title">{c.title}</div>
      <div className="small soft row wrap" style={{ gap: 6 }}>
        {c.owner && <span>👤 {c.owner}</span>}
        {c.eventTitle && <span className="tag soon">{c.eventTitle}</span>}
        {late && <span className="tag overdue">spóźnione</span>}
        {c.link && <a href={c.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="row" style={{ gap: 3 }}><ExternalLink size={12} /> link</a>}
      </div>
    </button>
  );
}

function ContentForm({ client, ctx, value, onClose }: { client: MarketingClient; ctx?: TeamContext; value: Partial<ContentItem> | null; onClose: () => void }) {
  const [d, setD] = useState<Partial<ContentItem>>({});
  useEffect(() => { if (value) setD(value); }, [value]);
  const set = (k: keyof ContentItem) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value });
  const save = useAction(() => client.saveContent(d), { ok: 'Zapisano', onDone: onClose });
  const drop = useAction(() => client.deleteContent(d.id!), { ok: 'Usunięto', onDone: onClose });
  if (!value) return null;
  return (
    <Modal open={!!value} onClose={onClose} wide title={d.id ? 'Treść' : 'Nowa treść'}
      footer={<>
        {d.id && <button className="btn ghost danger" style={{ marginRight: 'auto' }} onClick={() => confirm('Usunąć tę treść?') && drop.mutate(undefined)}><Trash2 size={15} /></button>}
        <button className="btn primary" disabled={!d.title?.trim() || save.isPending} onClick={() => save.mutate(undefined)}>Zapisz</button>
      </>}>
      <div className="fields">
        <label className="field wide">Co to jest<input type="text" autoFocus value={d.title || ''} onChange={set('title')} placeholder="np. Rolka: zaproszenie na lekcję pokazową" /></label>
        <label className="field">Kiedy<input type="date" value={d.day || ''} onChange={set('day')} /></label>
        <label className="field">Status
          <select value={d.status || 'idea'} onChange={set('status')}>{CONTENT_STATUS.map((s) => <option key={s} value={s}>{CONTENT_STATUS_LABEL[s]}</option>)}</select>
        </label>
        <label className="field">Kanał
          <select value={d.channel || ''} onChange={set('channel')}><option value="">—</option>{CHANNELS.map((c) => <option key={c}>{c}</option>)}</select>
        </label>
        <label className="field">Rodzaj
          <select value={d.kind || ''} onChange={set('kind')}><option value="">—</option>{CONTENT_KINDS.map((c) => <option key={c}>{c}</option>)}</select>
        </label>
        <label className="field">Kto robi
          <input type="text" list="mk-team" value={d.owner || ''} onChange={set('owner')} />
          <datalist id="mk-team">{(ctx?.team || []).map((t) => <option key={t} value={t} />)}</datalist>
        </label>
        <label className="field">Wydarzenie
          <select value={d.eventId || ''} onChange={set('eventId')}>
            <option value="">—</option>
            {(ctx?.events || []).map((e) => <option key={e.id} value={e.id}>{shortDate(e.date)} · {e.title}</option>)}
            {d.eventId && !(ctx?.events || []).some((e) => e.id === d.eventId) && <option value={d.eventId}>{d.eventTitle || d.eventId}</option>}
          </select>
        </label>
        <label className="field wide">Tekst / scenariusz / brief<textarea rows={6} value={d.body || ''} onChange={set('body')} /></label>
        <label className="field wide">Link do publikacji<input type="url" value={d.link || ''} onChange={set('link')} placeholder="https://…" /></label>
        <label className="field wide">Jak poszło (zasięg, zapisy, komentarze)<textarea rows={2} value={d.result || ''} onChange={set('result')} /></label>
      </div>
      {d.createdBy && <div className="small faint">Dodał(a): {d.createdBy}</div>}
    </Modal>
  );
}

/* ------------------------------------------------------------ monthly report */

export function ContentReport({ client }: { client: MarketingClient }) {
  const today = useToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const q = useQuery({ queryKey: [client.key, 'content-report', month], queryFn: () => client.report(month) });
  const rows = q.data?.rows || [];
  const sum = rows.reduce((a, r) => ({ planned: a.planned + r.planned, ready: a.ready + r.ready, published: a.published + r.published, late: a.late + r.late }), { planned: 0, ready: 0, published: 0, late: 0 });
  return (
    <>
      <div className="toolbar">
        <button className="btn sm icon" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Poprzedni miesiąc"><ChevronLeft size={16} /></button>
        <b style={{ minWidth: 150, textAlign: 'center', textTransform: 'capitalize' }}>{monthLabel(month)}</b>
        <button className="btn sm icon" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Następny miesiąc"><ChevronRight size={16} /></button>
      </div>
      {!rows.length ? <Empty>W tym miesiącu nic nie zaplanowano.</Empty> : (
        <div style={{ overflowX: 'auto', padding: '0 20px 12px' }}>
          <table className="mk-table">
            <thead><tr><th>Kto</th><th>Zaplanowane</th><th>Gotowe</th><th>Opublikowane</th><th>Spóźnione</th></tr></thead>
            <tbody>
              {rows.map((r) => <tr key={r.owner}><td><b>{r.owner}</b></td><td>{r.planned}</td><td>{r.ready}</td><td>{r.published}</td><td className={r.late ? 'bad' : ''}>{r.late}</td></tr>)}
              <tr className="sum"><td>Razem</td><td>{sum.planned}</td><td>{sum.ready}</td><td>{sum.published}</td><td className={sum.late ? 'bad' : ''}>{sum.late}</td></tr>
            </tbody>
          </table>
        </div>
      )}
      {!!q.data?.published.length && (
        <>
          <div className="group-label">Opublikowane · {q.data.published.length}</div>
          <ul className="list">
            {q.data.published.map((c) => (
              <li key={c.id} className="li">
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="title trunc">{c.title}</div>
                  <div className="meta trunc">{shortDate(c.publishedOn || c.day)} · {[c.channel, c.kind, c.owner].filter(Boolean).join(' · ')}{c.result ? ` · ${c.result}` : ''}</div>
                </div>
                {c.link && <a className="btn sm icon" href={c.link} target="_blank" rel="noreferrer" aria-label="Otwórz"><ExternalLink size={14} /></a>}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------ partnership backlog */

export function PartnerBacklog({ client }: { client: MarketingClient }) {
  const q = useQuery({ queryKey: [client.key, 'partners'], queryFn: client.partners });
  const ctx = useTeamContext(client);
  const [edit, setEdit] = useState<Partial<PartnerIdea> | null>(null);
  const [event, setEvent] = useState('');
  const all = (q.data || []).filter((p) => !event || p.eventId === event);
  const move = useAction((d: Partial<PartnerIdea>) => client.savePartner(d));
  return (
    <>
      <div className="toolbar wrap">
        <select value={event} onChange={(e) => setEvent(e.target.value)} style={{ width: 'auto' }}>
          <option value="">Wszystkie wydarzenia</option>
          {(ctx.data?.events || []).map((e) => <option key={e.id} value={e.id}>{shortDate(e.date)} · {e.title}</option>)}
        </select>
        <span className="grow" />
        <button className="btn sm primary" onClick={() => setEdit({ status: 'idea', eventId: event, owner: ctx.data?.name || '' })}><Plus size={14} /> Dodaj osobę / pomysł</button>
      </div>
      <div className="small soft" style={{ padding: '0 20px 10px' }}>Kogo znamy, kto mógłby powiedzieć o nas swoim ludziom? Np. nauczycielka tańca — jej klientom o sobotnich warsztatach.</div>
      <div className="mk-board">
        {PARTNER_STATUS.map((s) => {
          const items = all.filter((p) => p.status === s);
          return (
            <div key={s} className="mk-col">
              <div className="mk-col-head"><Pill status={s} /> <span className="faint small">{items.length}</span></div>
              {items.map((p) => (
                <div key={p.id} className="mk-card" role="button" tabIndex={0} onClick={() => setEdit(p)} onKeyDown={(e) => e.key === 'Enter' && setEdit(p)}>
                  <div className="title">{p.who}</div>
                  {p.relation && <div className="small soft">{p.relation}</div>}
                  {p.idea && <div className="small">{p.idea}</div>}
                  <div className="small soft row wrap" style={{ gap: 6 }}>
                    {p.reach && <span>→ {p.reach}</span>}
                    {p.eventTitle && <span className="tag soon">{p.eventTitle}</span>}
                    {p.owner && <span>👤 {p.owner}</span>}
                  </div>
                  {s !== 'done' && s !== 'no' && (
                    <button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); move.mutate({ id: p.id, status: PARTNER_STATUS[PARTNER_STATUS.indexOf(s) + 1] }); }}>
                      → {PARTNER_STATUS_LABEL[PARTNER_STATUS[PARTNER_STATUS.indexOf(s) + 1]]}
                    </button>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <PartnerForm client={client} ctx={ctx.data} value={edit} onClose={() => setEdit(null)} />
    </>
  );
}

function PartnerForm({ client, ctx, value, onClose }: { client: MarketingClient; ctx?: TeamContext; value: Partial<PartnerIdea> | null; onClose: () => void }) {
  const [d, setD] = useState<Partial<PartnerIdea>>({});
  useEffect(() => { if (value) setD(value); }, [value]);
  const set = (k: keyof PartnerIdea) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value });
  const save = useAction(() => client.savePartner(d), { ok: 'Zapisano', onDone: onClose });
  const drop = useAction(() => client.deletePartner(d.id!), { ok: 'Usunięto', onDone: onClose });
  if (!value) return null;
  return (
    <Modal open={!!value} onClose={onClose} title={d.id ? d.who || 'Partner' : 'Nowa osoba / pomysł'}
      footer={<>
        {d.id && <button className="btn ghost danger" style={{ marginRight: 'auto' }} onClick={() => confirm('Usunąć z backlogu?') && drop.mutate(undefined)}><Trash2 size={15} /></button>}
        <button className="btn primary" disabled={!d.who?.trim() || save.isPending} onClick={() => save.mutate(undefined)}>Zapisz</button>
      </>}>
      <div className="fields">
        <label className="field wide">Kto<input type="text" autoFocus value={d.who || ''} onChange={set('who')} placeholder="np. Ania — nauczycielka tańca" /></label>
        <label className="field wide">Skąd ją/go znamy, kim jest<input type="text" value={d.relation || ''} onChange={set('relation')} /></label>
        <label className="field wide">Do kogo dociera<input type="text" value={d.reach || ''} onChange={set('reach')} placeholder="np. klienci jej szkoły tańca, ok. 150 rodzin" /></label>
        <label className="field wide">Co może zrobić<textarea rows={2} value={d.idea || ''} onChange={set('idea')} placeholder="np. powie klientom o sobotnich warsztatach, wrzuci plakat na swoją grupę" /></label>
        <label className="field">Wydarzenie
          <select value={d.eventId || ''} onChange={set('eventId')}>
            <option value="">—</option>
            {(ctx?.events || []).map((e) => <option key={e.id} value={e.id}>{shortDate(e.date)} · {e.title}</option>)}
            {d.eventId && !(ctx?.events || []).some((e) => e.id === d.eventId) && <option value={d.eventId}>{d.eventTitle || d.eventId}</option>}
          </select>
        </label>
        <label className="field">Kto z nas się tym zajmie
          <input type="text" list="mk-team2" value={d.owner || ''} onChange={set('owner')} />
          <datalist id="mk-team2">{(ctx?.team || []).map((t) => <option key={t} value={t} />)}</datalist>
        </label>
        <label className="field">Status
          <select value={d.status || 'idea'} onChange={set('status')}>{PARTNER_STATUS.map((s) => <option key={s} value={s}>{PARTNER_STATUS_LABEL[s]}</option>)}</select>
        </label>
        <label className="field">Kontakt<input type="text" value={d.contact || ''} onChange={set('contact')} /></label>
        <label className="field wide">Notatki<textarea rows={2} value={d.notes || ''} onChange={set('notes')} /></label>
      </div>
      {d.createdBy && <div className="small faint">Dodał(a): {d.createdBy}</div>}
    </Modal>
  );
}
