import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Mic, MicOff, Send, Sparkles, Check, X, AlertTriangle, Loader2 } from 'lucide-react';
import { api, type AssistantTurn, type Proposal } from '../api';
import { Modal, useConfig, useToast } from './ui';

/* ------------------------------------------------------------ speech recognition (Chrome / Android / Safari) */

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: ((e: any) => void) | null;
};
const SpeechCtor: (new () => Recognition) | undefined =
  typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : undefined;

function useDictation(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const rec = useRef<Recognition | null>(null);
  const text = useRef('');
  const final = useRef(onFinal);
  final.current = onFinal;

  const stop = useCallback(() => rec.current?.stop(), []);
  const start = useCallback(() => {
    if (!SpeechCtor || rec.current) return;
    const r = new SpeechCtor();
    r.lang = 'pl-PL';
    r.continuous = true;
    r.interimResults = true;
    text.current = '';
    r.onresult = (e) => {
      let done = '', live = '';
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) done += t; else live += t;
      }
      text.current = done;
      setInterim((done + ' ' + live).trim());
    };
    r.onerror = () => { /* "no-speech", "aborted" … — onend follows */ };
    r.onend = () => {
      rec.current = null;
      setListening(false);
      const said = (text.current || '').trim();
      setInterim('');
      if (said) final.current(said);
    };
    rec.current = r;
    setListening(true);
    r.start();
  }, []);
  useEffect(() => () => rec.current?.abort(), []);
  return { supported: !!SpeechCtor, listening, interim, start, stop };
}

/* ------------------------------------------------------------ the panel */

interface Msg {
  role: 'user' | 'assistant';
  text: string;
  proposals?: Proposal[];
  results?: { ok: boolean; message: string; leadId?: string }[];
}

const EXAMPLES = [
  'Dzwoniłem do Cichoń Dressage, nie odebrali, spróbuj w piątek',
  'Muszę się z nimi umówić w przyszłym tygodniu',
  'Arabka umówiona na wtorek 10:00, osoba decyzyjna pani Celina',
  'Dodaj firmę Kowalski Logistyka z Gliwic, telefon 600 100 200',
  'Co mam dziś do zrobienia?',
];

export function AssistantButton() {
  const cfg = useConfig();
  const [open, setOpen] = useState(false);
  const [autoMic, setAutoMic] = useState(false);
  if (!cfg.data) return null;
  return (
    <>
      <button className="fab" aria-label="Asystent" title="Asystent głosowy"
        onClick={() => { setAutoMic(true); setOpen(true); }}>
        <Mic size={22} />
      </button>
      <AssistantPanel open={open} autoMic={autoMic} enabled={!!cfg.data.assistant} onClose={() => { setOpen(false); setAutoMic(false); }} />
    </>
  );
}

function AssistantPanel({ open, onClose, enabled, autoMic }: { open: boolean; onClose: () => void; enabled: boolean; autoMic: boolean }) {
  const loc = useLocation();
  const leadId = loc.pathname.match(/^\/firmy\/([^/]+)/)?.[1];
  const qc = useQueryClient();
  const toast = useToast();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const send = useCallback(async (text: string) => {
    const said = text.trim();
    if (!said || busy) return;
    const history: AssistantTurn[] = msgs.map((m) => ({
      role: m.role,
      text: m.role === 'assistant'
        ? [m.text, ...(m.proposals || []).map((p) => `[propozycja: ${p.title}]`), ...(m.results || []).map((r) => `[${r.ok ? 'zapisano' : 'błąd'}: ${r.message}]`)].join('\n')
        : m.text,
    }));
    setMsgs((x) => [...x, { role: 'user', text: said }]);
    setDraft('');
    setBusy(true);
    try {
      const r = await api.assistant(said, history, leadId);
      setMsgs((x) => [...x, { role: 'assistant', text: r.reply, proposals: r.proposals }]);
    } catch (e) {
      setMsgs((x) => [...x, { role: 'assistant', text: (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  }, [busy, msgs, leadId]);

  const mic = useDictation(send);

  useEffect(() => {
    if (open && autoMic && enabled && mic.supported && !busy) mic.start();
    if (!open) mic.stop();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, busy, mic.interim]);

  const approve = async (index: number, items: Proposal[]) => {
    try {
      const r = await api.assistantExecute(items.map((p) => ({ tool: p.tool, input: p.input })));
      setMsgs((x) => x.map((m, i) => i === index ? { ...m, proposals: [], results: r.results } : m));
      qc.invalidateQueries();
      const bad = r.results.filter((x) => !x.ok).length;
      toast(bad ? `Zapisano ${r.results.length - bad}, błędy: ${bad}` : 'Zapisano', bad ? 'error' : 'ok');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const dismiss = (index: number) => setMsgs((x) => x.map((m, i) => i === index ? { ...m, proposals: [], results: [{ ok: false, message: 'Odrzucono' }] } : m));

  return (
    <Modal open={open} onClose={onClose} wide title={<span className="row"><Sparkles size={18} style={{ color: 'var(--accent)' }} /> Asystent</span>}>
      {!enabled ? (
        <div className="col">
          <div className="error-box">Asystent nie jest jeszcze włączony.</div>
          <div className="soft">W Vercel: <b>Settings → Environment Variables</b> → dodaj <code>ANTHROPIC_API_KEY</code> (klucz z console.anthropic.com), potem <b>Redeploy</b>.</div>
        </div>
      ) : (
        <div className="asst">
          <div className="chat">
            {!msgs.length && (
              <div className="col tight">
                <div className="soft">Powiedz, co się wydarzyło albo co zrobić. Każdą zmianę zobaczysz najpierw jako propozycję do zatwierdzenia.</div>
                <div className="chips">
                  {leadId && <button className="chip on" onClick={() => send('Przygotuj mnie do rozmowy z tą firmą — jak zagadać?')}>Jak zagadać do tej firmy?</button>}
                  {EXAMPLES.map((e) => <button key={e} className="chip" onClick={() => send(e)}>{e}</button>)}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                {m.text && <div className="pre">{m.text}</div>}
                {!!m.proposals?.length && <Proposals items={m.proposals} onApprove={(items) => approve(i, items)} onDismiss={() => dismiss(i)} />}
                {m.results && (
                  <ul className="exec-results">
                    {m.results.map((r, k) => (
                      <li key={k} className={r.ok ? 'ok' : 'bad'}>
                        {r.ok ? <Check size={14} /> : <X size={14} />}
                        {r.leadId ? <Link to={`/firmy/${r.leadId}`} onClick={onClose}>{r.message}</Link> : r.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {busy && <div className="bubble assistant soft row"><Loader2 size={15} className="spin" /> Myślę…</div>}
            {mic.listening && <div className="bubble user live">{mic.interim || 'Słucham…'}</div>}
            <div ref={bottom} />
          </div>

          <div className="ask">
            {mic.supported && (
              <button className={`btn icon mic ${mic.listening ? 'on' : ''}`} onClick={() => mic.listening ? mic.stop() : mic.start()}
                aria-label={mic.listening ? 'Zatrzymaj' : 'Mów'} disabled={busy}>
                {mic.listening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
            )}
            <textarea rows={1} placeholder={mic.supported ? 'Mów albo pisz…' : 'Pisz albo użyj mikrofonu na klawiaturze…'} value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft); } }} />
            <button className="btn primary icon" onClick={() => send(draft)} disabled={!draft.trim() || busy} aria-label="Wyślij"><Send size={17} /></button>
          </div>
          {leadId && <div className="hint">Kontekst: otwarta karta firmy — „ta firma” to ona.</div>}
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------ proposal cards */

const EDITABLE: Record<string, string> = { summary: 'Skrót', text: 'Notatka', note: 'Notatka' };

function Proposals({ items, onApprove, onDismiss }: { items: Proposal[]; onApprove: (items: Proposal[]) => Promise<void>; onDismiss: () => void }) {
  const [list, setList] = useState(items);
  const [on, setOn] = useState<Set<string>>(() => new Set(items.map((p) => p.key)));
  const [saving, setSaving] = useState(false);
  const chosen = list.filter((p) => on.has(p.key));
  const set = (key: string, patch: Record<string, any>) =>
    setList((l) => l.map((p) => p.key === key ? { ...p, input: { ...p.input, ...patch } } : p));
  // a firm that is not approved cannot receive the actions that depend on it
  const blocked = (p: Proposal) => typeof p.input.id === 'string' && /^NEW\d+$/.test(p.input.id) && !on.has(p.input.id);

  return (
    <div className="proposals">
      {list.map((p) => (
        <div key={p.key} className={`proposal ${on.has(p.key) ? '' : 'off'}`}>
          <label className="row top" style={{ gap: 10 }}>
            <input type="checkbox" checked={on.has(p.key)} onChange={() => setOn((s) => { const n = new Set(s); if (n.has(p.key)) n.delete(p.key); else n.add(p.key); return n; })} />
            <div className="grow">
              <div className="title">{p.title}</div>
              {p.lines.filter((l) => !Object.keys(EDITABLE).some((k) => p.input[k] && l === p.input[k])).map((l, i) => <div key={i} className="small soft">{l}</div>)}
            </div>
          </label>
          {on.has(p.key) && Object.entries(EDITABLE).map(([k, label]) => typeof p.input[k] === 'string' && p.input[k] ? (
            <label key={k} className="field" style={{ marginTop: 8 }}>{label}
              <textarea rows={2} value={p.input[k]} onChange={(e) => set(p.key, { [k]: e.target.value })} />
            </label>
          ) : null)}
          {on.has(p.key) && p.input.follow_up?.date && (
            <label className="field" style={{ marginTop: 8 }}>Data następnego kroku
              <input type="date" value={p.input.follow_up.date} onChange={(e) => set(p.key, { follow_up: { ...p.input.follow_up, date: e.target.value } })} />
            </label>
          )}
          {on.has(p.key) && p.tool === 'plan_activity' && (
            <label className="field" style={{ marginTop: 8 }}>Data
              <input type="date" value={p.input.date} onChange={(e) => set(p.key, { date: e.target.value })} />
            </label>
          )}
          {p.warnings.map((w, i) => <div key={i} className="small row" style={{ color: 'var(--warn)', marginTop: 6 }}><AlertTriangle size={13} /> {w}</div>)}
          {blocked(p) && on.has(p.key) && <div className="small" style={{ color: 'var(--bad)', marginTop: 6 }}>Wymaga zatwierdzenia nowej firmy.</div>}
        </div>
      ))}
      <div className="row wrap">
        <button className="btn primary" disabled={!chosen.length || saving || chosen.some(blocked)}
          onClick={async () => { setSaving(true); await onApprove(chosen); setSaving(false); }}>
          <Check size={16} /> Zatwierdź {chosen.length > 1 ? `(${chosen.length})` : ''}
        </button>
        <button className="btn ghost" onClick={onDismiss} disabled={saving}>Odrzuć</button>
      </div>
    </div>
  );
}
