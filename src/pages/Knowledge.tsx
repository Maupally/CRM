import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Upload, StickyNote, Trash2, Download, ExternalLink, Sparkles, BookOpen } from 'lucide-react';
import { api } from '../api';
import { FileCard, fileUrl } from '../components/Files';
import { openAssistant } from '../components/Assistant';
import { ClaudeImport } from '../components/ClaudeImport';
import { Empty, ErrorBox, Loading, Modal, useAction, useToast } from '../components/ui';
import { searchKey, type KnowledgeItem } from '../../shared/domain';

export function KnowledgePage() {
  const q = useQuery({ queryKey: ['knowledge'], queryFn: api.knowledge });
  const toast = useToast();
  const [find, setFind] = useState('');
  const [open, setOpen] = useState<KnowledgeItem | null>(null);
  const [note, setNote] = useState(false);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const qc = useAction(async (files: File[]) => {
    for (const f of files) await api.uploadKnowledge(f);
    return files.length;
  }, { ok: (n) => `Dodano ${n} ${n === 1 ? 'plik' : 'pliki'}` });

  const rows = useMemo(() => {
    const k = searchKey(find);
    return (q.data || []).filter((i) => !k || searchKey(`${i.title} ${i.filename} ${i.description} ${i.tags}`).includes(k));
  }, [q.data, find]);
  const isTool = (r: KnowledgeItem) => r.hasFile && r.mime.includes('html') && !r.tags.includes('wygenerowane');
  const tools = rows.filter(isTool);
  const generated = rows.filter((r) => r.tags.includes('wygenerowane'));
  const own = rows.filter((r) => !r.tags.includes('wygenerowane') && !isTool(r));

  const upload = async (list: FileList | null) => {
    const files = [...(list || [])];
    if (!files.length) return;
    const tooBig = files.filter((f) => f.size > 4 * 1024 * 1024);
    if (tooBig.length) { toast(`Za duże (maks. 4 MB): ${tooBig.map((f) => f.name).join(', ')}`, 'error'); return; }
    setBusy(true);
    try { await qc.mutateAsync(files); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Baza wiedzy</h1><div className="sub">Plakaty, prezentacje, gotowe teksty, oferta — asystent z tego korzysta, gdy pisze i przygotowuje zadania.</div></div>
        <span className="spacer" />
        <button className="btn" onClick={() => setImporting(true)}><Download size={16} /> Przenieś z Claude</button>
        <button className="btn" onClick={() => setNote(true)}><StickyNote size={16} /> Notatka</button>
        <button className="btn primary" onClick={() => input.current?.click()} disabled={busy}><Upload size={16} /> {busy ? 'Wgrywam…' : 'Wgraj pliki'}</button>
        <input ref={input} type="file" multiple hidden accept=".pdf,.docx,.txt,.md,.csv,.html,image/*" onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
      </div>

      <section className="card">
        <div className="toolbar">
          <input type="search" placeholder="Szukaj w bazie wiedzy…" value={find} onChange={(e) => setFind(e.target.value)} />
          <span className="grow" />
          <button className="btn sm ghost" onClick={() => openAssistant('Co mam w Bazie wiedzy i czego tam brakuje, żeby dobrze przygotowywać materiały?')}>
            <Sparkles size={14} /> Zapytaj asystenta
          </button>
        </div>
        {q.isLoading ? <Loading /> : q.error ? <div className="pad"><ErrorBox error={q.error} /></div> : (
          <div className="pad col" style={{ paddingTop: 0 }}>
            {tools.length > 0 && (
              <>
                <div className="group-label" style={{ padding: '10px 0 0' }}>Narzędzia (strony HTML — kalkulator, szablony)</div>
                <div className="files">{tools.map((f) => <FileCard key={f.id} f={f} onOpen={() => setOpen(f)} />)}</div>
                <div className="group-label" style={{ padding: '10px 0 0' }}>Pliki i notatki</div>
              </>
            )}
            {own.length > 0 && <div className="files">{own.map((f) => <FileCard key={f.id} f={f} onOpen={() => setOpen(f)} />)}</div>}
            {generated.length > 0 && (
              <>
                <div className="group-label" style={{ padding: '10px 0 0' }}>Przygotowane przez asystenta</div>
                <div className="files">{generated.map((f) => <FileCard key={f.id} f={f} onOpen={() => setOpen(f)} />)}</div>
              </>
            )}
            {!rows.length && (
              <Empty icon={BookOpen}>
                {find ? 'Nic nie pasuje.' : <>Pusto. Wgraj plakat biegu, prezentację B2B, ofertę, gotowe maile — PDF, Word, zdjęcia albo tekst.<br />
                  Artefakt z czatu Claude (np. kalkulator) pobierz jako .html i wgraj — uruchomi się tutaj jako narzędzie.</>}
              </Empty>
            )}
          </div>
        )}
      </section>

      <ItemSheet item={open} onClose={() => setOpen(null)} />
      <NoteSheet open={note} onClose={() => setNote(false)} />
      <ClaudeImport open={importing} onClose={() => setImporting(false)} />
    </>
  );
}

function ItemSheet({ item, onClose }: { item: KnowledgeItem | null; onClose: () => void }) {
  const full = useQuery({ queryKey: ['knowledge', item?.id], queryFn: () => api.knowledgeItem(item!.id), enabled: !!item });
  const [d, setD] = useState({ title: '', description: '', tags: '' });
  const [showText, setShowText] = useState(false);
  const lastId = useRef<number | null>(null);
  if (item && lastId.current !== item.id) { lastId.current = item.id; setD({ title: item.title, description: item.description, tags: item.tags }); setShowText(false); }
  const save = useAction(() => api.updateKnowledge(item!.id, d), { ok: 'Zapisano', onDone: onClose });
  const drop = useAction(() => api.deleteKnowledge(item!.id), { ok: 'Usunięto', onDone: onClose });
  if (!item) return null;
  const isImg = item.mime.startsWith('image/');
  const isFrame = /pdf|html|text\//.test(item.mime);
  const isHtml = item.mime.includes('html');
  const runUrl = `${fileUrl(item.id, true)}&run=1`;

  return (
    <Modal open={!!item} onClose={onClose} wide title={item.title}
      footer={<>
        <button className="btn ghost danger" style={{ marginRight: 'auto' }} onClick={() => confirm('Usunąć z bazy wiedzy?') && drop.mutate(undefined)}><Trash2 size={15} /> Usuń</button>
        <button className="btn primary" onClick={() => save.mutate(undefined)} disabled={save.isPending}>Zapisz</button>
      </>}>
      {item.hasFile && isImg && <img className="preview-img" src={fileUrl(item.id, true)} alt={item.title} />}
      {item.hasFile && isHtml && <iframe className="preview-frame tall" src={runUrl} title={item.title}
        sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads" />}
      {item.hasFile && isFrame && !isHtml && <iframe className="preview-frame" src={fileUrl(item.id, true)} title={item.title} sandbox="allow-downloads" />}
      {item.hasFile && (
        <div className="row wrap">
          <a className="btn sm" href={isHtml ? runUrl : fileUrl(item.id, true)} target="_blank" rel="noreferrer"><ExternalLink size={14} /> {isHtml ? 'Pełny ekran' : 'Otwórz'}</a>
          <a className="btn sm" href={fileUrl(item.id)}><Download size={14} /> Pobierz</a>
          <button className="btn sm ghost" onClick={() => { onClose(); openAssistant(`Weź z Bazy wiedzy materiał id ${item.id} („${item.title}”) i `); }}><Sparkles size={14} /> Zrób coś z tym…</button>
        </div>
      )}
      <div className="fields">
        <label className="field wide">Tytuł<input type="text" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></label>
        <label className="field wide">Opis (pomaga asystentowi znaleźć materiał)
          <textarea rows={2} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="np. Plakat biegu Terry'ego Foxa, 10.10, Park Kościuszki" /></label>
        <label className="field wide">Tagi<input type="text" value={d.tags} onChange={(e) => setD({ ...d, tags: e.target.value })} placeholder="bieg, plakat, szkoły" /></label>
      </div>
      {!!item.textLength && (
        <div>
          <button className="btn sm ghost" onClick={() => setShowText(!showText)}>{showText ? 'Ukryj tekst' : `Pokaż odczytany tekst (${item.textLength} znaków)`}</button>
          {showText && <div className="mtext pre small" style={{ marginTop: 8, maxHeight: 300, overflow: 'auto', background: 'var(--paper)', padding: 12, borderRadius: 12 }}>{full.data?.text}</div>}
        </div>
      )}
    </Modal>
  );
}

function NoteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [d, setD] = useState({ title: '', text: '', tags: '' });
  const add = useAction(() => api.addNote(d), { ok: 'Dodano', onDone: () => { setD({ title: '', text: '', tags: '' }); onClose(); } });
  return (
    <Modal open={open} onClose={onClose} wide title="Nowa notatka w bazie wiedzy"
      footer={<><button className="btn" onClick={onClose}>Anuluj</button>
        <button className="btn primary" disabled={!d.text.trim() || add.isPending} onClick={() => add.mutate(undefined)}>Dodaj</button></>}>
      <label className="field">Tytuł<input type="text" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="np. Bieg Terry'ego Foxa — informacje" /></label>
      <label className="field">Treść<textarea rows={12} value={d.text} onChange={(e) => setD({ ...d, text: e.target.value })}
        placeholder="Wklej tu wiedzę z czatów: fakty, gotowe teksty, zasady, linki do zapisów…" /></label>
      <label className="field">Tagi<input type="text" value={d.tags} onChange={(e) => setD({ ...d, tags: e.target.value })} /></label>
    </Modal>
  );
}
