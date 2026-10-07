import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Mic, MicOff, Send, Sparkles, Check, X, AlertTriangle, Loader2, Camera, Sunrise, MessageSquareText, Volume2, Car,
  Copy, Mail, Square, Paperclip, RotateCcw, Users, Palette,
} from 'lucide-react';
import { api, type AssistantTurn, type Proposal } from '../api';
import { Modal, useConfig, useToast, copyText } from './ui';
import { FileCard } from './Files';
import { MaterialView } from './TaskDetail';
import type { KnowledgeItem, Material } from '../../shared/domain';

/* ------------------------------------------------------------ speech in (browser recognition) */

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: ((e: any) => void) | null;
};
const SpeechCtor: (new () => Recognition) | undefined =
  typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : undefined;

/**
 * Dictation. In "long" mode (a debrief after a call) it keeps listening through pauses —
 * phones end a recognition session after a few seconds of silence — until stopped by hand.
 */
function useDictation(onFinal: (text: string, long: boolean) => void) {
  const [state, setState] = useState<'off' | 'short' | 'long'>('off');
  const [interim, setInterim] = useState('');
  const rec = useRef<Recognition | null>(null);
  const kept = useRef('');            // text from finished sessions (long mode)
  const current = useRef('');         // final text of the running session
  const mode = useRef<'off' | 'short' | 'long'>('off');
  const stopping = useRef(false);
  const final = useRef(onFinal);
  final.current = onFinal;

  const run = useCallback(() => {
    if (!SpeechCtor) return;
    const r = new SpeechCtor();
    r.lang = 'pl-PL';
    r.continuous = true;
    r.interimResults = true;
    current.current = '';
    r.onresult = (e) => {
      let done = '', live = '';
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) done += t; else live += t;
      }
      current.current = done;
      setInterim(`${kept.current} ${done} ${live}`.replace(/\s+/g, ' ').trim());
    };
    r.onerror = () => {};
    r.onend = () => {
      rec.current = null;
      const text = `${kept.current} ${current.current}`.replace(/\s+/g, ' ').trim();
      if (mode.current === 'long' && !stopping.current) {       // silence ended the session — keep going
        kept.current = text;
        try { run(); return; } catch { /* fall through and finish */ }
      }
      const was = mode.current;
      mode.current = 'off';
      stopping.current = false;
      kept.current = '';
      setState('off');
      setInterim('');
      if (text && was !== 'off') final.current(text, was === 'long');
    };
    rec.current = r;
    r.start();
  }, []);

  const start = useCallback((m: 'short' | 'long' = 'short') => {
    if (!SpeechCtor || mode.current !== 'off') return;
    stopSpeaking();
    mode.current = m;
    stopping.current = false;
    kept.current = '';
    setState(m);
    run();
  }, [run]);
  const stop = useCallback(() => { stopping.current = true; rec.current?.stop(); }, []);
  const cancel = useCallback(() => {
    stopping.current = true; mode.current = 'off'; kept.current = ''; current.current = '';
    rec.current?.abort(); setState('off'); setInterim('');
  }, []);
  useEffect(() => () => rec.current?.abort(), []);
  return { supported: !!SpeechCtor, state, interim, start, stop, cancel };
}

/* ------------------------------------------------------------ speech out */

function stopSpeaking() {
  try { window.speechSynthesis?.cancel(); } catch { /* not supported */ }
}

function speak(text: string, onEnd?: () => void) {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth || !text.trim()) { onEnd?.(); return; }
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[*_#`>]/g, '').replace(/\n+/g, '. '));
  u.lang = 'pl-PL';
  const pl = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith('pl'));
  if (pl) u.voice = pl;
  u.rate = 1.05;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  synth.speak(u);
}

/* ------------------------------------------------------------ photos: downscale before upload */

async function shrinkImage(file: File): Promise<{ mediaType: string; data: string; preview: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const preview = c.toDataURL('image/jpeg', 0.85);
    return { mediaType: 'image/jpeg', data: preview.split(',')[1], preview };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ------------------------------------------------------------ state */

type Status = 'pending' | 'approved' | 'rejected' | 'replaced';
interface PItem extends Proposal { on: boolean }
interface Msg {
  role: 'user' | 'assistant';
  text: string;
  image?: string;
  files?: KnowledgeItem[];
  proposals?: PItem[];
  status?: Status;
  results?: { ok: boolean; message: string; leadId?: string }[];
}

const APPROVE = /^(tak|zatwierd[zź]|zapisz|potwierd[zź]|ok(ej)?|dobrze|zgoda|wszystko)\b/i;
const REJECT = /^(nie|odrzu[cć]|anuluj|skasuj|stop)\b/i;

const EXAMPLES = [
  'Muszę się z nimi umówić w przyszłym tygodniu',
  'Które stadniny z Katowic mają telefon, a nikt do nich nie dzwonił?',
  'Zrób raport tygodniowy',
  'Bieg Terry’ego Foxa jest potwierdzony',
];

const lsGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
const lsDel = (k: string) => { try { localStorage.removeItem(k); } catch { /* private mode */ } };

/** The conversation survives closing the panel and reloading the page (photos are dropped — too big). */
const CHAT_KEY = 'crm-chat';
function loadChat(): { msgs: Msg[]; containerId?: string } {
  try {
    const v = JSON.parse(lsGet(CHAT_KEY) || 'null');
    if (v && Array.isArray(v.msgs)) return v;
  } catch { /* broken */ }
  return { msgs: [] };
}
function saveChat(msgs: Msg[], containerId?: string) {
  const slim = msgs.slice(-40).map(({ image, ...m }) => (image ? { ...m, text: m.text || '[zdjęcie]' } : m));
  lsSet(CHAT_KEY, JSON.stringify({ msgs: slim, containerId }));
}
const MAX_UPLOAD = 4 * 1024 * 1024;

export function AssistantButton() {
  const cfg = useConfig();
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<string | null>(null);
  useEffect(() => {
    const on = (e: Event) => { setPreset((e as CustomEvent<string | undefined>).detail || null); setOpen(true); };
    window.addEventListener('crm:assistant', on);
    return () => window.removeEventListener('crm:assistant', on);
  }, []);
  if (!cfg.data) return null;
  return (
    <>
      <button className="fab" aria-label="Asystent" title="Asystent głosowy" onClick={() => setOpen(true)}>
        <Mic size={22} />
      </button>
      <AssistantPanel open={open} enabled={!!cfg.data.assistant} preset={preset} onClose={() => { setOpen(false); setPreset(null); }} />
    </>
  );
}

/** Opens the assistant from anywhere, optionally sending a question straight away. */
export function openAssistant(text?: string) {
  window.dispatchEvent(new CustomEvent('crm:assistant', { detail: text }));
}

function AssistantPanel({ open, onClose, enabled, preset }: { open: boolean; onClose: () => void; enabled: boolean; preset: string | null }) {
  const loc = useLocation();
  const leadId = loc.pathname.match(/^\/firmy\/([^/]+)/)?.[1];
  const qc = useQueryClient();
  const toast = useToast();
  const [msgs, setMsgs] = useState<Msg[]>(() => loadChat().msgs);
  const [containerId, setContainerId] = useState<string | undefined>(() => loadChat().containerId);
  const [files, setFiles] = useState<KnowledgeItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const clip = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<{ mediaType: string; data: string; preview: string } | null>(null);
  const [handsFree, setHandsFree] = useState(() => lsGet('crm-handsfree') === '1');
  const bottom = useRef<HTMLDivElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const msgsRef = useRef(msgs);
  msgsRef.current = msgs;
  useEffect(() => { saveChat(msgs, containerId); }, [msgs, containerId]);

  const newChat = () => {
    setMsgs([]); setContainerId(undefined); setFiles([]); setPhoto(null); setDraft('');
    lsDel(CHAT_KEY); stopSpeaking(); mic.cancel();
  };

  const attach = async (list: FileList | null) => {
    const picked = [...(list || [])];
    if (!picked.length) return;
    const big = picked.filter((f) => f.size > MAX_UPLOAD);
    if (big.length) { toast(`Za duże (maks. 4 MB): ${big.map((f) => f.name).join(', ')}`, 'error'); return; }
    setUploading(true);
    try {
      for (const f of picked) {
        const k = await api.uploadKnowledge(f, { tags: 'czat' });
        setFiles((x) => [...x, k]);
      }
      qc.invalidateQueries({ queryKey: ['knowledge'] });
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const pendingIndex = () => {
    const i = msgsRef.current.length - 1;
    const m = msgsRef.current[i];
    return m?.role === 'assistant' && m.status === 'pending' && m.proposals?.some((p) => p.on) ? i : -1;
  };

  const history = (): AssistantTurn[] => msgsRef.current.map((m) => ({
    role: m.role,
    text: m.role === 'assistant'
      ? [m.text,
        ...(m.proposals || []).map((p) => `[propozycja ${p.tool} (${m.status === 'pending' ? 'czeka'
          : m.status === 'approved' ? (p.on ? 'zatwierdzona' : 'pominięta') : m.status === 'replaced' ? 'zastąpiona' : 'odrzucona'}): ${p.title} ${JSON.stringify(p.input)}]`),
        ...(m.results || []).map((r) => `[${r.ok ? 'zapisano' : 'błąd'}: ${r.message}]`)].join('\n')
      : (m.image ? '[zdjęcie] ' : '') + m.text
        + (m.files?.length ? `\n[załączone pliki z Bazy wiedzy: ${m.files.map((f) => `id ${f.id} „${f.title}” (${f.mime})`).join(', ')}]` : ''),
  }));

  const approve = async (index: number) => {
    const m = msgsRef.current[index];
    const items = (m?.proposals || []).filter((p) => p.on);
    if (!items.length) return;
    setMsgs((x) => x.map((mm, i) => i === index ? { ...mm, status: 'approved' } : mm));
    try {
      const r = await api.assistantExecute(items.map((p) => ({ tool: p.tool, input: p.input })));
      setMsgs((x) => x.map((mm, i) => i === index ? { ...mm, results: r.results } : mm));
      qc.invalidateQueries();
      const failed = r.results.filter((x) => !x.ok);
      const msg = failed.length ? `Zapisano ${r.results.length - failed.length}, błędy: ${failed.length}` : 'Zapisano';
      toast(msg, failed.length ? 'error' : 'ok');
      if (handsFree) speak(failed.length ? `${msg}. ${failed.map((x) => x.message).join('. ')}` : 'Zapisane.', () => listenAgain.current());
    } catch (e) {
      setMsgs((x) => x.map((mm, i) => i === index ? { ...mm, status: 'pending' } : mm));
      toast((e as Error).message, 'error');
    }
  };
  const reject = (index: number) => {
    setMsgs((x) => x.map((m, i) => i === index ? { ...m, status: 'rejected' } : m));
    if (handsFree) speak('Odrzucone.', () => listenAgain.current());
  };

  const listenAgain = useRef<() => void>(() => {});

  const send = useCallback(async (text: string, opts: { debrief?: boolean } = {}) => {
    const typed = text.trim();
    const img = photo;
    const att = files;
    if ((!typed && !img && !att.length) || busy) return;
    const said = opts.debrief ? `Relacja z rozmowy (podyktowana): ${typed}` : typed;
    const hist = history();
    // a new instruction replaces proposals nobody approved yet
    setMsgs((x) => [...x.map((m) => m.status === 'pending' ? { ...m, status: 'replaced' as Status } : m),
      { role: 'user', text: typed || (img ? 'Dodaj firmę z tego zdjęcia' : 'Co z tym zrobić?'), image: img?.preview, files: att.length ? att : undefined }]);
    setDraft('');
    setPhoto(null);
    setFiles([]);
    setBusy(true);
    try {
      const r = await api.assistant(said || 'Co z tym zrobić?', hist, {
        leadId, image: img ? { mediaType: img.mediaType, data: img.data } : undefined, spoken: handsFree,
        attachments: att.map((f) => f.id), containerId,
      });
      if (r.containerId) setContainerId(r.containerId);
      if (r.files?.length) qc.invalidateQueries({ queryKey: ['knowledge'] });
      const proposals = r.proposals.map((p) => ({ ...p, on: true }));
      setMsgs((x) => [...x, { role: 'assistant', text: r.reply, files: r.files?.length ? r.files : undefined, proposals, status: proposals.length ? 'pending' : undefined }]);
      if (handsFree) {
        const ask = proposals.length
          ? ` ${proposals.length === 1 ? 'Jedna zmiana' : `Zmiany, ${proposals.length}`}: ${proposals.map((p) => p.title).join('; ')}. Powiedz: zatwierdź, odrzuć albo co poprawić.`
          : '';
        speak(r.reply + ask, () => listenAgain.current());
      }
    } catch (e) {
      setMsgs((x) => [...x, { role: 'assistant', text: (e as Error).message }]);
      if (handsFree) speak((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [busy, leadId, photo, files, handsFree, containerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const onHeard = useCallback((text: string, long: boolean) => {
    const pi = pendingIndex();
    const short = text.split(/\s+/).length <= 4;
    if (!long && pi > -1 && short && APPROVE.test(text)) { approve(pi); return; }
    if (!long && pi > -1 && short && REJECT.test(text)) { reject(pi); return; }
    send(text, { debrief: long });
  }, [send]); // eslint-disable-line react-hooks/exhaustive-deps

  const mic = useDictation(onHeard);
  listenAgain.current = () => { if (handsFree && open && mic.supported) mic.start('short'); };

  useEffect(() => {
    if (open && enabled && preset) { send(preset); return; }
    if (open && enabled && mic.supported && handsFree && !busy) mic.start('short');
    if (!open) { mic.cancel(); stopSpeaking(); }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, busy, mic.interim]);

  const toggleHandsFree = () => {
    const v = !handsFree;
    setHandsFree(v);
    lsSet('crm-handsfree', v ? '1' : '0');
    if (v) speak('Tryb głośnomówiący włączony. Mów, co zrobić.', () => { if (mic.supported) mic.start('short'); });
    else { stopSpeaking(); mic.cancel(); }
  };

  const edit = (index: number, key: string, patch: Record<string, any>) =>
    setMsgs((x) => x.map((m, i) => i !== index ? m : {
      ...m, proposals: m.proposals!.map((p) => p.key === key ? { ...p, input: { ...p.input, ...patch } } : p),
    }));
  const toggle = (index: number, key: string) =>
    setMsgs((x) => x.map((m, i) => i !== index ? m : {
      ...m, proposals: m.proposals!.map((p) => p.key === key ? { ...p, on: !p.on } : p),
    }));

  const pickPhoto = async (f: File | undefined) => {
    if (!f) return;
    try { setPhoto(await shrinkImage(f)); } catch { toast('Nie udało się wczytać zdjęcia', 'error'); }
  };

  return (
    <Modal open={open} onClose={onClose} wide title={
      <span className="row wrap"><Sparkles size={18} style={{ color: 'var(--accent)' }} /> Asystent
        <button className={`chip ${handsFree ? 'on' : ''}`} onClick={toggleHandsFree} title="Czyta odpowiedzi na głos i słucha dalej">
          <Car size={14} /> {handsFree ? 'Głośnomówiący: wł.' : 'Głośnomówiący'}
        </button>
        {msgs.length > 0 && <button className="chip" onClick={newChat} title="Zacznij od nowa"><RotateCcw size={14} /> Nowa rozmowa</button>}
      </span>
    }>
      {!enabled ? (
        <div className="col">
          <div className="error-box">Asystent nie jest jeszcze włączony.</div>
          <div className="soft">W Vercel: <b>Settings → Environment Variables</b> → dodaj <code>ANTHROPIC_API_KEY</code> (klucz z console.anthropic.com), potem <b>Redeploy</b>.</div>
        </div>
      ) : (
        <div className="asst">
          <div className="quick-actions">
            <button className="qa" onClick={() => send('Poranny briefing: co mam dziś i od czego zacząć?')} disabled={busy}><Sunrise size={18} />Briefing</button>
            <button className="qa" onClick={() => mic.state === 'long' ? mic.stop() : mic.start('long')} disabled={busy || !mic.supported || mic.state === 'short'}>
              {mic.state === 'long' ? <Square size={18} /> : <MessageSquareText size={18} />}{mic.state === 'long' ? 'Zakończ relację' : 'Relacja z rozmowy'}
            </button>
            <button className="qa" onClick={() => camera.current?.click()} disabled={busy}><Camera size={18} />Wizytówka</button>
            {leadId && <button className="qa" onClick={() => send('Przygotuj mnie do rozmowy z tą firmą — jak zagadać?')} disabled={busy}><Sparkles size={18} />Jak zagadać</button>}
            <button className="qa" onClick={() => clip.current?.click()} disabled={busy || uploading}><Paperclip size={18} />Plik</button>
            <Link className="qa" to="/studio" onClick={onClose}><Palette size={18} />Studio</Link>
            <input ref={clip} type="file" multiple hidden accept=".pdf,.docx,.txt,.md,.csv,.html,image/*"
              onChange={(e) => { attach(e.target.files); e.target.value = ''; }} />
            <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
          </div>

          <div className="chat">
            {!msgs.length && (
              <div className="col tight">
                <div className="soft small">Mów swobodnie albo dołącz plik (📎) — np. PDF z prośbą „dodaj kod QR do zapisów i zrób do tego stronę”. Każda zmiana pojawi się najpierw jako propozycja — nic nie zapisze się bez Twojego „zatwierdź”.
                  {' '}„Relacja z rozmowy” słucha dłużej: opowiedz, jak poszło, a asystent sam wyciągnie ustalenia, osobę, następny krok i maila.</div>
                <div className="chips">
                  {EXAMPLES.map((e) => <button key={e} className="chip" onClick={() => send(e)}>{e}</button>)}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                {m.image && <img src={m.image} alt="" className="bubble-img" />}
                {m.text && <div className="pre">{m.text}</div>}
                {!!m.files?.length && <div className="files" style={{ marginTop: 8 }}>{m.files.map((f) => <FileCard key={f.id} f={f} />)}</div>}
                {m.role === 'assistant' && m.text && m.text.length > 160 && (
                  <div className="row wrap" style={{ marginTop: 8, gap: 4 }}>
                    <button className="btn sm ghost" onClick={() => speak(m.text)}><Volume2 size={14} /> Czytaj</button>
                    <button className="btn sm ghost" onClick={() => { copyText(m.text); toast('Skopiowano'); }}><Copy size={14} /> Kopiuj</button>
                    <a className="btn sm ghost" href={`mailto:?subject=${encodeURIComponent('B2B')}&body=${encodeURIComponent(m.text)}`}><Mail size={14} /> Mail</a>
                  </div>
                )}
                {!!m.proposals?.length && (
                  <Proposals items={m.proposals} status={m.status || 'pending'}
                    onToggle={(k) => toggle(i, k)} onEdit={(k, patch) => edit(i, k, patch)}
                    onApprove={() => approve(i)} onReject={() => reject(i)} />
                )}
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
            {mic.state !== 'off' && (
              <div className="bubble user live">{mic.interim || (mic.state === 'long' ? 'Słucham relacji… mów swobodnie, pauzy nie przerywają.' : 'Słucham…')}</div>
            )}
            <div ref={bottom} />
          </div>

          {photo && (
            <div className="row" style={{ gap: 10 }}>
              <img src={photo.preview} alt="" style={{ height: 56, borderRadius: 10 }} />
              <span className="soft small grow">Zdjęcie dołączone — dopisz coś albo wyślij.</span>
              <button className="btn sm ghost icon" onClick={() => setPhoto(null)} aria-label="Usuń zdjęcie"><X size={15} /></button>
            </div>
          )}

          {(files.length > 0 || uploading) && (
            <div className="row wrap" style={{ gap: 6 }}>
              {files.map((f) => (
                <span key={f.id} className="chip on">
                  <Paperclip size={13} /> <span className="trunc" style={{ maxWidth: 180 }}>{f.title}</span>
                  <button className="btn sm ghost icon" onClick={() => setFiles((x) => x.filter((y) => y.id !== f.id))} aria-label="Usuń"><X size={13} /></button>
                </span>
              ))}
              {uploading && <span className="soft small row"><Loader2 size={14} className="spin" /> Wgrywam…</span>}
            </div>
          )}

          <div className="ask">
            <button className="btn icon ghost" onClick={() => clip.current?.click()} disabled={busy || uploading} aria-label="Dołącz plik" title="Dołącz plik (PDF, Word, zdjęcie)">
              <Paperclip size={18} />
            </button>
            {mic.supported && (
              <button className={`btn icon mic ${mic.state !== 'off' ? 'on' : ''}`} onClick={() => mic.state !== 'off' ? mic.stop() : mic.start('short')}
                aria-label={mic.state !== 'off' ? 'Zatrzymaj' : 'Mów'} disabled={busy}>
                {mic.state !== 'off' ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
            )}
            <textarea rows={1} placeholder={mic.supported ? 'Mów albo pisz…' : 'Pisz albo użyj mikrofonu na klawiaturze…'} value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft); } }} />
            <button className="btn primary icon" onClick={() => send(draft)} disabled={(!draft.trim() && !photo && !files.length) || busy || uploading} aria-label="Wyślij"><Send size={17} /></button>
          </div>
          {leadId && <div className="hint">Kontekst: otwarta karta firmy — „ta firma” to ona.</div>}
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------ proposal cards */

const EDITABLE: Record<string, string> = { summary: 'Skrót', text: 'Notatka', note: 'Notatka' };
const STATUS_LABEL: Record<Status, string> = { pending: '', approved: '', rejected: 'Odrzucone', replaced: 'Zastąpione nowszym poleceniem' };

function Proposals({ items, status, onToggle, onEdit, onApprove, onReject }: {
  items: PItem[]; status: Status; onToggle: (key: string) => void; onEdit: (key: string, patch: Record<string, any>) => void;
  onApprove: () => void; onReject: () => void;
}) {
  const live = status === 'pending';
  const chosen = items.filter((p) => p.on);
  // actions on a firm that is not approved yet cannot run
  const blocked = (p: PItem) => typeof p.input.id === 'string' && /^NEW\d+$/.test(p.input.id) && !items.some((x) => x.key === p.input.id && x.on);

  return (
    <div className="proposals">
      {items.map((p) => (
        <div key={p.key} className={`proposal ${p.on && status !== 'rejected' && status !== 'replaced' ? '' : 'off'}`}>
          <label className="row top" style={{ gap: 10 }}>
            <input type="checkbox" checked={p.on} disabled={!live} onChange={() => onToggle(p.key)} />
            <div className="grow">
              <div className="title">{p.title}</div>
              {p.lines.filter((l) => !Object.keys(EDITABLE).some((k) => p.input[k] && l === p.input[k])).map((l, i) => <div key={i} className="small soft">{l}</div>)}
            </div>
          </label>

          {live && p.on && p.tool === 'draft_email' && <EmailEditor p={p} onEdit={(patch) => onEdit(p.key, patch)} />}

          {(p.tool === 'create_task' || p.tool === 'update_task') && p.on && (() => {
            const k = p.tool === 'create_task' ? 'materials' : 'add_materials';
            const mats: Material[] = Array.isArray(p.input[k]) ? p.input[k] : [];
            return mats.length ? (
              <div className="col tight" style={{ marginTop: 8 }}>
                {mats.map((m, j) => <MaterialView key={j} m={m} open={mats.length === 1}
                  onChange={live ? (nm) => onEdit(p.key, { [k]: mats.map((x, q) => q === j ? nm : x) }) : undefined}
                  onRemove={live ? () => onEdit(p.key, { [k]: mats.filter((_, q) => q !== j) }) : undefined} />)}
              </div>
            ) : null;
          })()}
          {live && p.on && p.tool === 'create_task' && (
            <label className="field" style={{ marginTop: 8 }}>Termin
              <input type="date" value={p.input.due || ''} onChange={(e) => onEdit(p.key, { due: e.target.value })} />
            </label>
          )}
          {p.tool === 'draft_campaign' && p.on && status !== 'rejected' && status !== 'replaced' && (
            <CampaignEditor p={p} live={live} onEdit={(patch) => onEdit(p.key, patch)} />
          )}

          {live && p.on && p.tool !== 'draft_email' && p.tool !== 'draft_campaign' && Object.entries(EDITABLE).map(([k, label]) => typeof p.input[k] === 'string' && p.input[k] ? (
            <label key={k} className="field" style={{ marginTop: 8 }}>{label}
              <textarea rows={2} value={p.input[k]} onChange={(e) => onEdit(p.key, { [k]: e.target.value })} />
            </label>
          ) : null)}
          {live && p.on && p.input.follow_up?.date && (
            <label className="field" style={{ marginTop: 8 }}>Data następnego kroku
              <input type="date" value={p.input.follow_up.date} onChange={(e) => onEdit(p.key, { follow_up: { ...p.input.follow_up, date: e.target.value } })} />
            </label>
          )}
          {live && p.on && (p.tool === 'plan_activity' || p.tool === 'reschedule_activity') && (
            <label className="field" style={{ marginTop: 8 }}>Data
              <input type="date" value={p.input.date} onChange={(e) => onEdit(p.key, { date: e.target.value })} />
            </label>
          )}
          {p.warnings.map((w, i) => <div key={i} className="small row" style={{ color: 'var(--warn)', marginTop: 6 }}><AlertTriangle size={13} /> {w}</div>)}
          {live && blocked(p) && p.on && <div className="small" style={{ color: 'var(--bad)', marginTop: 6 }}>Wymaga zatwierdzenia nowej firmy.</div>}
        </div>
      ))}
      {live ? (
        <div className="row wrap">
          <button className="btn primary" disabled={!chosen.length || chosen.some(blocked)} onClick={onApprove}>
            <Check size={16} /> Zatwierdź {chosen.length > 1 ? `(${chosen.length})` : ''}
          </button>
          <button className="btn ghost" onClick={onReject}>Odrzuć</button>
        </div>
      ) : STATUS_LABEL[status] ? <div className="small faint">{STATUS_LABEL[status]}</div> : null}
    </div>
  );
}

function EmailEditor({ p, onEdit }: { p: PItem; onEdit: (patch: Record<string, any>) => void }) {
  const toast = useToast();
  const { to = '', subject = '', body = '' } = p.input;
  return (
    <div className="col tight" style={{ marginTop: 8 }}>
      <label className="field">Do<input type="email" value={to} onChange={(e) => onEdit({ to: e.target.value })} /></label>
      <label className="field">Temat<input type="text" value={subject} onChange={(e) => onEdit({ subject: e.target.value })} /></label>
      <label className="field">Treść<textarea rows={8} value={body} onChange={(e) => onEdit({ body: e.target.value })} /></label>
      <div className="row wrap">
        <a className="btn sm" href={`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}><Mail size={14} /> Otwórz w poczcie</a>
        <button className="btn sm" onClick={() => { copyText(`${subject}\n\n${body}`); toast('Skopiowano'); }}><Copy size={14} /> Kopiuj</button>
        <span className="hint">Po wysłaniu kliknij „Zatwierdź” — mail trafi do historii.</span>
      </div>
    </div>
  );
}

function CampaignEditor({ p, live, onEdit }: { p: PItem; live: boolean; onEdit: (patch: Record<string, any>) => void }) {
  const toast = useToast();
  const { subject = '', body = '', emails = [], mail_enabled: auto } = p.input as { subject?: string; body?: string; emails?: string[]; mail_enabled?: boolean };
  const manual = !auto;
  const bcc = emails.join(', ');
  // placeholders only fill in when the CRM sends; for a manual BCC mail they would stay as [Firma]
  const personal = /\[(Firma|Miasto|Osoba)\]/.test(body + subject);
  return (
    <div className="col tight" style={{ marginTop: 8 }}>
      <div className="small row"><Users size={14} /> {emails.length} {emails.length === 1 ? 'adres' : 'adresów'}{auto ? ' — CRM wyśle każdy mail osobno' : ''}</div>
      {live ? (
        <>
          <label className="field">Temat<input type="text" value={subject} onChange={(e) => onEdit({ subject: e.target.value })} /></label>
          <label className="field">Treść<textarea rows={10} value={body} onChange={(e) => onEdit({ body: e.target.value })} /></label>
        </>
      ) : null}
      {manual && (
        <>
          <div className="row wrap">
            <button className="btn sm" onClick={() => { copyText(bcc); toast(`Skopiowano ${emails.length} adresów`); }}><Copy size={14} /> Kopiuj adresy (UDW)</button>
            <button className="btn sm" onClick={() => { copyText(`${subject}\n\n${body}`); toast('Skopiowano'); }}><Copy size={14} /> Kopiuj treść</button>
            {emails.length <= 50 && (
              <a className="btn sm ghost" href={`mailto:?bcc=${encodeURIComponent(bcc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}><Mail size={14} /> Otwórz w poczcie</a>
            )}
          </div>
          {personal && <div className="hint">W ręcznej wysyłce [Firma] / [Miasto] / [Osoba] się nie podstawią — zamień je na ogólny zwrot.</div>}
          <div className="hint">Adresy wklej w pole UDW (BCC), nie „Do” — odbiorcy nie zobaczą się nawzajem.</div>
        </>
      )}
    </div>
  );
}
