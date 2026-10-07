import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Mic, MicOff, Plus, Send, Trash2, MessagesSquare, Sparkles } from 'lucide-react';
import { api } from '../api';
import { FileCard } from '../components/Files';
import { Proposals, useDictation, type PItem, type Status } from '../components/Assistant';
import { Empty, ErrorBox, Loading, relDay, useAction, useToast, useToday } from '../components/ui';
import { THREAD_MODES, THREAD_MODE_LABEL, searchKey, type KnowledgeItem, type ThreadMode } from '../../shared/domain';

/**
 * All chats — moved over from Claude and new ones — with their history. The mic assistant files what it
 * writes into the matching chat, and here you can carry on any of them.
 */
export function ChatsPage() {
  const { id } = useParams();
  const sel = id ? Number(id) : null;
  return (
    <div className={`chats ${sel ? 'has-sel' : ''}`}>
      <ChatList selected={sel} />
      {sel ? <ChatView key={sel} id={sel} /> : (
        <section className="card chat-empty hide-sm">
          <Empty icon={MessagesSquare}>Wybierz czat z listy. Czaty z Claude przeniesiesz w Bazie wiedzy → „Przenieś z Claude”.</Empty>
        </section>
      )}
    </div>
  );
}

function ChatList({ selected }: { selected: number | null }) {
  const q = useQuery({ queryKey: ['threads'], queryFn: api.threads });
  const today = useToday();
  const nav = useNavigate();
  const [find, setFind] = useState('');
  const [mode, setMode] = useState<ThreadMode | ''>('');
  const create = useAction(() => api.createThread({ title: 'Nowy czat', mode: mode || 'other' }), { onDone: (t) => nav(`/czaty/${t.id}`) });
  const rows = useMemo(() => {
    const k = searchKey(find);
    return (q.data || []).filter((t) => (!mode || t.mode === mode) && (!k || searchKey(`${t.title} ${t.last}`).includes(k)));
  }, [q.data, find, mode]);
  return (
    <section className="card chat-list">
      <div className="row" style={{ gap: 8, padding: 12 }}>
        <h2 className="grow" style={{ margin: 0 }}>Czaty</h2>
        <button className="btn sm primary" onClick={() => create.mutate(undefined)} disabled={create.isPending}><Plus size={14} /> Nowy</button>
      </div>
      <div style={{ padding: '0 12px 8px' }} className="col tight">
        <input type="search" placeholder="Szukaj w czatach…" value={find} onChange={(e) => setFind(e.target.value)} />
        <div className="chips">
          <button className={`chip ${!mode ? 'on' : ''}`} onClick={() => setMode('')}>Wszystkie</button>
          {THREAD_MODES.map((m) => <button key={m} className={`chip ${mode === m ? 'on' : ''}`} onClick={() => setMode(m)}>{THREAD_MODE_LABEL[m].split(' — ')[0]}</button>)}
        </div>
      </div>
      <div className="chat-items">
        {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : rows.map((t) => (
          <Link key={t.id} to={`/czaty/${t.id}`} className={`chat-item ${selected === t.id ? 'on' : ''}`}>
            <div className="row" style={{ gap: 6 }}>
              <b className="grow trunc">{t.title}</b>
              <span className="faint small nowrap">{relDay(t.updatedAt.slice(0, 10), today)}</span>
            </div>
            <div className="meta trunc">{t.mode !== 'other' ? `${THREAD_MODE_LABEL[t.mode].split(' — ')[0]} · ` : ''}{t.last || 'pusty'}</div>
          </Link>
        ))}
        {!q.isLoading && !rows.length && <div className="soft small" style={{ padding: 14 }}>Brak czatów.</div>}
      </div>
    </section>
  );
}

type Pending = { items: PItem[]; status: Status; results?: { ok: boolean; message: string; leadId?: string }[]; files?: KnowledgeItem[] };

function ChatView({ id }: { id: number }) {
  const q = useQuery({ queryKey: ['thread', id], queryFn: () => api.thread(id) });
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const [title, setTitle] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const t = q.data;
  useEffect(() => { if (t) setTitle(t.title); }, [t?.title]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [t?.messages.length, busy, pending]);
  const update = useAction((d: { title?: string; mode?: string }) => api.updateThread(id, d));
  const drop = useAction(() => api.deleteThread(id), { ok: 'Usunięto', onDone: () => nav('/czaty') });

  const send = async (text: string) => {
    const said = text.trim();
    if (!said || busy) return;
    setBusy(true); setSent(said); setDraft(''); setPending(null);
    try {
      const r = await api.assistant(said, [], { threadId: id });
      await qc.invalidateQueries({ queryKey: ['thread', id] });
      qc.invalidateQueries({ queryKey: ['threads'] });
      if (r.proposals.length || r.files?.length) setPending({ items: r.proposals.map((p) => ({ ...p, on: true })), status: 'pending', files: r.files });
    } catch (e) {
      toast((e as Error).message, 'error'); setDraft(said);
    } finally { setBusy(false); setSent(''); }
  };
  const mic = useDictation((text) => send(text));

  const approve = async () => {
    if (!pending) return;
    const items = pending.items.filter((p) => p.on);
    setPending({ ...pending, status: 'approved' });
    try {
      const r = await api.assistantExecute(items.map((p) => ({ tool: p.tool, input: p.input })));
      setPending((x) => x && { ...x, results: r.results });
      qc.invalidateQueries();
    } catch (e) {
      setPending((x) => x && { ...x, status: 'pending' });
      toast((e as Error).message, 'error');
    }
  };

  if (q.isLoading) return <section className="card chat-view"><Loading /></section>;
  if (q.error || !t) return <section className="card chat-view"><ErrorBox error={q.error} /></section>;

  return (
    <section className="card chat-view">
      <div className="chat-head">
        <Link to="/czaty" className="btn ghost icon only-sm" aria-label="Wróć"><ArrowLeft size={18} /></Link>
        <input className="studio-title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== t.title && update.mutate({ title })} />
        <select value={t.mode} onChange={(e) => update.mutate({ mode: e.target.value })} style={{ width: 'auto' }} title="Do czego jest ten czat — asystent dobiera styl i miejsce zapisu">
          {THREAD_MODES.map((m) => <option key={m} value={m}>{THREAD_MODE_LABEL[m]}</option>)}
        </select>
        <button className="btn ghost icon danger" onClick={() => confirm('Usunąć cały czat?') && drop.mutate(undefined)} aria-label="Usuń czat"><Trash2 size={16} /></button>
      </div>
      <div className="chat-msgs">
        {t.source === 'claude' && <div className="hint" style={{ textAlign: 'center' }}>Czat przeniesiony z Claude</div>}
        {!t.messages.length && !busy && <div className="soft small">Pusto. Napisz albo powiedz, o co chodzi — asystent ma dostęp do CRM, Bazy wiedzy i Twoich innych czatów.</div>}
        {t.messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.via === 'mikrofon' && <div className="via"><Mic size={11} /> z asystenta pod mikrofonem</div>}
            <div className="pre">{m.text}</div>
          </div>
        ))}
        {busy && (
          <>
            <div className="bubble user"><div className="pre">{sent}</div></div>
            <div className="bubble assistant soft row"><Loader2 size={15} className="spin" /> Piszę…</div>
          </>
        )}
        {pending && (
          <div className="bubble assistant">
            {!!pending.files?.length && <div className="files">{pending.files.map((f) => <FileCard key={f.id} f={f} />)}</div>}
            {pending.items.length > 0 && (
              <Proposals items={pending.items} status={pending.status}
                onToggle={(k) => setPending({ ...pending, items: pending.items.map((p) => p.key === k ? { ...p, on: !p.on } : p) })}
                onEdit={(k, patch) => setPending({ ...pending, items: pending.items.map((p) => p.key === k ? { ...p, input: { ...p.input, ...patch } } : p) })}
                onApprove={approve} onReject={() => setPending({ ...pending, status: 'rejected' })} />
            )}
            {pending.results && <ul className="exec-results">{pending.results.map((r, k) => <li key={k} className={r.ok ? 'ok' : 'bad'}>{r.message}</li>)}</ul>}
          </div>
        )}
        {mic.state !== 'off' && <div className="bubble user live">{mic.interim || 'Słucham…'}</div>}
        <div ref={bottom} />
      </div>
      <div className="ask" style={{ padding: 12 }}>
        {mic.supported && (
          <button className={`btn icon mic ${mic.state !== 'off' ? 'on' : ''}`} onClick={() => mic.state !== 'off' ? mic.stop() : mic.start('short')} disabled={busy} aria-label="Mów">
            {mic.state !== 'off' ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
        )}
        <textarea rows={2} placeholder="Napisz w tym czacie…" value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft); } }} />
        <button className="btn primary icon" onClick={() => send(draft)} disabled={!draft.trim() || busy} aria-label="Wyślij"><Send size={17} /></button>
      </div>
      {t.mode !== 'other' && <div className="hint" style={{ padding: '0 14px 10px' }}><Sparkles size={12} /> Maile i teksty {t.mode === 'b2b' ? 'do firm' : 'do rodziców i zespołu'} zamawiane z mikrofonu też trafią tutaj.</div>}
    </section>
  );
}
