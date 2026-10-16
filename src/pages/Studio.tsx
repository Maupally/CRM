import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Download, ExternalLink, FileDown, Loader2, Monitor, Paperclip, Plus, Presentation, Printer, RotateCcw, Save,
  Send, Smartphone, Sparkles, Trash2, X, Mail, Globe, FileText, MessageSquare, Eye,
} from 'lucide-react';
import { api } from '../api';
import { FileCard, useFileDrop } from '../components/Files';
import { Empty, ErrorBox, Loading, Modal, relDay, useAction, useConfig, useToast, useToday } from '../components/ui';
import { DESIGN_KINDS, DESIGN_KIND_LABEL, type DesignKind, type KnowledgeItem } from '../../shared/domain';

const KIND_ICON = { www: Globe, deck: Presentation, email: Mail, doc: FileText, form: FileText, brief: FileText } as const;

const STARTERS: Record<DesignKind, string[]> = {
  www: ['Landing na Bieg Terry’ego Foxa z zapisami', 'Strona oferty dla firm partnerskich', 'Strona dnia otwartego'],
  deck: ['Prezentacja współpracy B2B dla firm (8 slajdów)', 'Weź prezentację B2B z Bazy wiedzy i odśwież ją', 'Prezentacja dla rodziców o szkole'],
  email: ['Szablon zaproszenia na dzień otwarty dla firm', 'Newsletter dla rodziców o biegu', 'Mail z ofertą partnerstwa'],
  doc: ['Oferta współpracy na 1 stronę A4', 'Ulotka dnia otwartego', 'Regulamin biegu'],
  form: ['Formularz zapisów na wydarzenie', 'Zgłoszenie na konkurs z kartą dziecka'],
  brief: ['Zlecenie banera dla grafika', 'Brief na plakat'],
};

/* ------------------------------------------------------------ list */

export function StudioPage() {
  const { id } = useParams();
  return id ? <StudioEditor id={Number(id)} /> : <StudioList />;
}

function StudioList() {
  const q = useQuery({ queryKey: ['studio'], queryFn: api.designs });
  const kb = useQuery({ queryKey: ['knowledge'], queryFn: api.knowledge });
  const nav = useNavigate();
  const today = useToday();
  const [creating, setCreating] = useState(false);
  const open = useAction((k: KnowledgeItem) => api.createDesign({ fromKnowledge: k.id, kind: /prezent|slajd|deck/i.test(k.title) ? 'deck' : 'www' }),
    { onDone: (d) => nav(`/studio/${d.id}`) });
  const html = (kb.data || []).filter((k) => k.hasFile && k.mime.includes('html'));
  return (
    <>
      <div className="page-head">
        <div><h1>Studio</h1><div className="sub">Strony WWW, prezentacje, szablony maili i dokumenty — opisz, co chcesz, poprawiaj w rozmowie, pobierz gotowe.</div></div>
        <span className="spacer" />
        <button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> Nowy projekt</button>
      </div>
      <section className="card">
        {q.isLoading ? <Loading /> : q.error ? <div className="pad"><ErrorBox error={q.error} /></div> : (
          <ul className="list">
            {(q.data || []).map((d) => {
              const I = KIND_ICON[d.kind] || Globe;
              return (
                <Link key={d.id} to={`/studio/${d.id}`} className="li">
                  <span className="type-ic"><I size={18} /></span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="title trunc">{d.title}</div>
                    <div className="meta">{DESIGN_KIND_LABEL[d.kind]} · {d.versions ? `${d.versions} wersji` : 'pusty'} · {relDay(d.updatedAt.slice(0, 10), today)}</div>
                  </div>
                </Link>
              );
            })}
            {!q.data?.length && <Empty icon={Sparkles}>Nic tu jeszcze nie ma. „Nowy projekt” → wybierz, co robimy, i opisz to jak w czacie z Claude.</Empty>}
          </ul>
        )}
      </section>
      {html.length > 0 && (
        <section className="card" style={{ marginTop: 16 }}>
          <div className="card-head"><h2>Pliki HTML w Bazie wiedzy</h2><span className="soft small">otwórz, żeby dalej nad nimi pracować</span></div>
          <ul className="list">
            {html.map((k) => (
              <li key={k.id} className="li">
                <span className="type-ic"><Globe size={18} /></span>
                <div className="grow trunc">{k.title}</div>
                <button className="btn sm" onClick={() => open.mutate(k)} disabled={open.isPending}>Otwórz w Studio</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <NewDesign open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function NewDesign({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const kb = useQuery({ queryKey: ['knowledge'], queryFn: api.knowledge, enabled: open });
  const [kind, setKind] = useState<DesignKind>('deck');
  const [from, setFrom] = useState('');
  const create = useAction(() => api.createDesign({ kind, fromKnowledge: from ? Number(from) : undefined, title: from ? undefined : 'Nowy projekt' }),
    { onDone: (d) => { onClose(); nav(`/studio/${d.id}`); } });
  const html = (kb.data || []).filter((k: KnowledgeItem) => k.hasFile && k.mime.includes('html'));
  return (
    <Modal open={open} onClose={onClose} title="Nowy projekt"
      footer={<><button className="btn" onClick={onClose}>Anuluj</button>
        <button className="btn primary" onClick={() => create.mutate(undefined)} disabled={create.isPending}>Zaczynamy</button></>}>
      <div className="kind-grid">
        {DESIGN_KINDS.map((k) => {
          const I = KIND_ICON[k];
          return <button key={k} className={`kind ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}><I size={20} /> {DESIGN_KIND_LABEL[k]}</button>;
        })}
      </div>
      <label className="field">Zacznij od gotowego (opcjonalnie)
        <select value={from} onChange={(e) => setFrom(e.target.value)}>
          <option value="">— od zera —</option>
          {html.map((k) => <option key={k.id} value={k.id}>{k.title}</option>)}
        </select>
      </label>
      {!html.length && <div className="hint">Prezentacje i szablony przeniesione z Claude (Baza wiedzy → „Przenieś z Claude”) pojawią się tutaj do wyboru.</div>}
    </Modal>
  );
}

/* ------------------------------------------------------------ editor */

function StudioEditor({ id }: { id: number }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const ai = !!useConfig().data?.assistant;
  const q = useQuery({ queryKey: ['studio', id], queryFn: () => api.design(id) });
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<KnowledgeItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState('');
  const [pane, setPane] = useState<'chat' | 'preview'>('chat');
  const [version, setVersion] = useState<number | null>(null);
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop');
  const [title, setTitle] = useState('');
  const clip = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const d = q.data;
  useEffect(() => { if (d) setTitle(d.title); }, [d?.title]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [d?.chat.length, busy]);

  const rename = useAction((t: string) => api.renameDesign(id, { title: t }));
  const drop = useAction(() => api.deleteDesign(id), { ok: 'Usunięto', onDone: () => nav('/studio') });
  const restore = useAction((v: number) => api.restoreDesign(id, v), { ok: 'Przywrócono', onDone: () => setVersion(null) });
  const save = useAction(() => api.saveDesign(id), { ok: 'Zapisano w Bazie wiedzy (Narzędzia)' });

  const attach = async (list: FileList | File[] | null) => {
    for (const f of [...(list || [])]) {
      if (f.size > 4 * 1024 * 1024) { toast(`Za duże (maks. 4 MB): ${f.name}`, 'error'); continue; }
      try { const k = await api.uploadKnowledge(f, { tags: 'studio' }); setFiles((x) => [...x, k]); } catch (e) { toast((e as Error).message, 'error'); }
    }
  };
  const dnd = useFileDrop((f) => attach(f), busy);

  if (q.isLoading) return <Loading />;
  if (q.error || !d) return <ErrorBox error={q.error} />;

  const last = d.versions.length - 1;
  const shown = version ?? last;
  const stamp = encodeURIComponent(d.updatedAt);
  const src = `/api/studio/${id}/html?v=${Math.max(0, shown)}&t=${stamp}`;
  const I = KIND_ICON[d.kind] || Globe;

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true); setSent(t); setDraft('');
    const att = files; setFiles([]);
    try {
      const r = await api.designMessage(id, t, att.map((f) => f.id));
      qc.setQueryData(['studio', id], r);
      qc.invalidateQueries({ queryKey: ['studio'], exact: true });
      if (r.versions.length > d.versions.length) { setVersion(null); setPane('preview'); }
      if (r.chat.at(-1)?.files?.length) qc.invalidateQueries({ queryKey: ['knowledge'] });
    } catch (e) {
      toast((e as Error).message, 'error');
      setDraft(t); setFiles(att);
    } finally { setBusy(false); setSent(''); }
  };


  return (
    <div className="studio">
      <div className="studio-head">
        <Link to="/studio" className="btn ghost icon" aria-label="Wróć"><ArrowLeft size={18} /></Link>
        <I size={18} className="faint" />
        <input className="studio-title" value={title} onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== d.title && rename.mutate(title)} />
        <div className="seg only-sm">
          <button className={pane === 'chat' ? 'on' : ''} onClick={() => setPane('chat')}><MessageSquare size={15} /> Czat</button>
          <button className={pane === 'preview' ? 'on' : ''} onClick={() => setPane('preview')}><Eye size={15} /> Podgląd</button>
        </div>
        <button className="btn ghost icon danger hide-sm" onClick={() => confirm('Usunąć projekt?') && drop.mutate(undefined)} aria-label="Usuń"><Trash2 size={16} /></button>
      </div>

      <div className={`studio-body show-${pane}`}>
        <section className={`card studio-chat drop-zone ${dnd.over ? 'drop-over' : ''}`} data-drop="Upuść pliki — logo, zdjęcia, PDF" {...dnd.props}>
          <div className="studio-msgs">
            {!d.chat.length && !busy && (
              <div className="col tight">
                <div className="soft small">Opisz, co mam przygotować — jak w czacie z Claude. Potem poprawiaj: „zmień kolory na granat”, „dodaj slajd z cennikiem”, „krócej”.</div>
                <div className="chips">{STARTERS[d.kind].map((s) => <button key={s} className="chip" onClick={() => send(s)}>{s}</button>)}</div>
              </div>
            )}
            {d.chat.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                <div className="pre">{m.text}</div>
                {!!m.files?.length && <div className="files" style={{ marginTop: 8 }}>{m.files.map((f) => <FileCard key={f.id} f={f} />)}</div>}
              </div>
            ))}
            {busy && (
              <>
                <div className="bubble user"><div className="pre">{sent}</div></div>
                <div className="bubble assistant soft row"><Loader2 size={15} className="spin" /> Projektuję… duże rzeczy (prezentacja, strona) trwają 1–2 minuty.</div>
              </>
            )}
            <div ref={bottom} />
          </div>
          {files.length > 0 && (
            <div className="row wrap" style={{ gap: 6, padding: '0 12px' }}>
              {files.map((f) => (
                <span key={f.id} className="chip on"><Paperclip size={13} /> <span className="trunc" style={{ maxWidth: 160 }}>{f.title}</span>
                  <button className="btn sm ghost icon" onClick={() => setFiles((x) => x.filter((y) => y.id !== f.id))} aria-label="Usuń"><X size={13} /></button></span>
              ))}
            </div>
          )}
          {!ai ? (
            <div className="hint" style={{ padding: 14 }}>Poprawki rób w claude.ai — poproś „zapisz w Opal5 Studio pod tytułem „{d.title}””, a pojawi się tu nowa wersja. Stąd pobierzesz PDF, PowerPoint i Word.</div>
          ) : (
          <div className="ask" style={{ padding: 12 }}>
            <button className="btn icon ghost" onClick={() => clip.current?.click()} disabled={busy} aria-label="Dołącz plik" title="Dołącz plik (logo, zdjęcie, PDF)"><Paperclip size={18} /></button>
            <input ref={clip} type="file" multiple hidden accept="image/*,.pdf,.docx,.txt,.md,.html" onChange={(e) => { attach(e.target.files); e.target.value = ''; }} />
            <textarea rows={2} placeholder={d.versions.length ? 'Co zmienić?' : 'Co mam przygotować?'} value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft); } }} />
            <button className="btn primary icon" onClick={() => send(draft)} disabled={!draft.trim() || busy} aria-label="Wyślij"><Send size={17} /></button>
          </div>
          )}
        </section>

        <section className="card studio-preview">
          <div className="studio-tools">
            {d.versions.length > 0 ? (
              <select value={shown} onChange={(e) => setVersion(Number(e.target.value) === last ? null : Number(e.target.value))} style={{ maxWidth: 260 }}>
                {d.versions.map((v, i) => <option key={i} value={i}>Wersja {i + 1}{v.note ? ` · ${v.note}` : ''}</option>).reverse()}
              </select>
            ) : <span className="soft small">Brak wersji</span>}
            {version !== null && version !== last && (
              <button className="btn sm" onClick={() => restore.mutate(version)}><RotateCcw size={14} /> Przywróć tę</button>
            )}
            <span className="grow" />
            <div className="seg hide-sm">
              <button className={device === 'desktop' ? 'on' : ''} onClick={() => setDevice('desktop')} aria-label="Komputer"><Monitor size={15} /></button>
              <button className={device === 'phone' ? 'on' : ''} onClick={() => setDevice('phone')} aria-label="Telefon"><Smartphone size={15} /></button>
            </div>
          </div>
          <div className={`studio-frame ${device} kind-${d.kind}`}>
            <iframe key={src} src={src} title={d.title} sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads" />
          </div>
          {d.versions.length > 0 && (
            <div className="row wrap studio-actions">
              <a className="btn sm" href={src} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Pełny ekran</a>
              <a className="btn sm" href={`${src}&download=1`}><Download size={14} /> Pobierz HTML</a>
              <a className="btn sm" href={src} target="_blank" rel="noreferrer" title="Otworzy się na pełnym ekranie — wybierz Drukuj → Zapisz jako PDF"><Printer size={14} /> PDF</a>
              {d.kind === 'deck' && <button className="btn sm" disabled={busy} onClick={() => send('Zrób z tej prezentacji plik PowerPoint (.pptx) do pobrania — ta sama treść i układ.')}><FileDown size={14} /> PowerPoint</button>}
              {d.kind === 'doc' && <button className="btn sm" disabled={busy} onClick={() => send('Zrób z tego dokumentu plik Word (.docx) do pobrania.')}><FileDown size={14} /> Word</button>}
              <button className="btn sm ghost" onClick={() => save.mutate(undefined)} disabled={save.isPending}><Save size={14} /> Do Bazy wiedzy</button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
