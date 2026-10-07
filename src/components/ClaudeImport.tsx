import { useMemo, useState } from 'react';
import { unzipSync, strFromU8 } from 'fflate';
import { Upload, Check, Loader2, Download } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Modal, useToast } from './ui';
import { searchKey } from '../../shared/domain';

/* claude.ai data export (Settings → Privacy → Export data). Older exports are one zip with projects.json and
   conversations.json; newer ones come as several zips (projects-000.zip, conversations-000.zip, design_chats-000.zip,
   frames-000.zip, memories-000.zip…), possibly with the project files themselves. Everything is read here in the
   browser — the export can be large — and only the chosen parts go to the CRM. */

interface Doc { filename: string; content: string }
interface Blob_ { name: string; mime: string; data: Uint8Array }
interface Project { uuid: string; name: string; prompt: string; docs: Doc[]; files: Blob_[] }
interface Artifact { id: string; title: string; type: string; content: string }
interface Msg { role: 'user' | 'assistant'; text: string; at: string }
interface Chat { uuid: string; name: string; date: string; transcript: string; messages: Msg[]; artifacts: Artifact[]; size: number; project: string; design?: boolean }
interface Parsed { projects: Project[]; chats: Chat[]; tools: Artifact[]; memory: string; links: { name: string; url: string; category: string }[] }

const MAX_NOTE = 190_000;
const MAX_FILE = 4 * 1024 * 1024;
const TEXT_EXT = /\.(md|markdown|txt|csv|tsv|json|xml|yaml|yml|js|ts|css|py)$/i;
const MIME: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', html: 'text/html', htm: 'text/html',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
const base = (path: string) => path.split('/').pop() || path;
const isHtml = (a: Artifact) => /html/.test(a.type) || /^\s*<!doctype html|^\s*<html/i.test(a.content);
/** What kind of Studio project an imported design is, from its name. */
const kindOf = (title: string) => /prezent|slajd|slide|deck|pitch/i.test(title) ? 'deck' : /mail|newsletter|szablon|template/i.test(title) ? 'email'
  : /ulotk|plakat|dokument|oferta|pdf|regulamin|flyer|poster/i.test(title) ? 'doc' : 'www';

/** Pulls the records out of whatever shape a JSON file has: a list, {conversations: […]}, or one object. */
function records(v: unknown): any[] {
  if (Array.isArray(v)) return v.filter((x) => x && typeof x === 'object');
  if (v && typeof v === 'object') {
    const lists = Object.values(v).filter((x) => Array.isArray(x) && x.some((y) => y && typeof y === 'object' && !Array.isArray(y))) as any[][];
    const looksLikeOne = 'uuid' in (v as object) || 'chat_messages' in (v as object) || 'prompt_template' in (v as object) || 'messages' in (v as object);
    if (looksLikeOne || !lists.length) return [v];
    return lists.flat();
  }
  return [];
}

const messagesOf = (c: any): any[] => (Array.isArray(c.chat_messages) ? c.chat_messages : Array.isArray(c.messages) ? c.messages : []);
const isChat = (r: any) => messagesOf(r).length > 0 && messagesOf(r).some((m: any) => m && (m.sender || m.role));
const isProject = (r: any) => !isChat(r) && (('prompt_template' in r) || Array.isArray(r.docs) || (r.name && 'is_private' in r));

function toProject(p: any): Project {
  return {
    uuid: String(p.uuid || p.id || p.name), name: String(p.name || 'Projekt'), prompt: String(p.prompt_template || p.instructions || p.description || ''),
    docs: (Array.isArray(p.docs) ? p.docs : []).filter((d: any) => d && (d.content || d.text))
      .map((d: any) => ({ filename: String(d.filename || d.file_name || d.name || 'dokument'), content: String(d.content || d.text) })),
    files: [],
  };
}

/** Artifacts are created and then edited with str-replace updates; replay them to get the final version. */
function collectArtifacts(messages: any[]): Artifact[] {
  const map = new Map<string, Artifact>();
  for (const m of messages) {
    for (const c of Array.isArray(m.content) ? m.content : []) {
      if (c?.type !== 'tool_use' || !c.input || !/artifact/i.test(String(c.name))) continue;
      const i = c.input;
      const id = String(i.id || i.identifier || `a${map.size + 1}`);
      const cur = map.get(id);
      if (i.command === 'update' && cur && typeof i.old_str === 'string') {
        cur.content = cur.content.replace(i.old_str, String(i.new_str ?? ''));
      } else if (typeof i.content === 'string') {
        map.set(id, { id, title: String(i.title || cur?.title || id), type: String(i.type || cur?.type || 'text/markdown'), content: i.content });
      }
    }
    const text = String(m.text || '');
    for (const a of text.matchAll(/<antArtifact\b([^>]*)>([\s\S]*?)<\/antArtifact>/g)) {
      const attr = (k: string) => a[1].match(new RegExp(`${k}="([^"]*)"`))?.[1] || '';
      const id = attr('identifier') || `a${map.size + 1}`;
      map.set(id, { id, title: attr('title') || id, type: attr('type') || 'text/markdown', content: a[2].trim() });
    }
  }
  return [...map.values()];
}

function textOf(m: any): string {
  if (typeof m.text === 'string' && m.text.trim()) return m.text;
  if (typeof m.content === 'string') return m.content;
  return Array.isArray(m.content) ? m.content.filter((x: any) => x?.type === 'text').map((x: any) => x.text).join('\n') : '';
}

function toChat(c: any, design: boolean): Chat {
  const msgs = messagesOf(c);
  const messages: Msg[] = msgs.map((m: any) => ({
    role: m.sender === 'human' || m.role === 'user' || m.role === 'human' ? 'user' as const : 'assistant' as const,
    text: textOf(m).replace(/<antArtifact\b[^>]*>[\s\S]*?<\/antArtifact>/g, '[artefakt]').trim(),
    at: String(m.created_at || ''),
  })).filter((m: Msg) => m.text);
  const lines = messages.map((m) => `${m.role === 'user' ? 'Ja' : 'Claude'}: ${m.text}`);
  let transcript = lines.join('\n\n');
  if (transcript.length > MAX_NOTE) transcript = '…\n' + transcript.slice(-MAX_NOTE);          // keep the most recent part
  return {
    uuid: String(c.uuid || c.id || Math.random()), name: String(c.name || c.title || 'Bez tytułu'),
    date: String(c.updated_at || c.created_at || '').slice(0, 10), transcript, messages, artifacts: collectArtifacts(msgs), size: lines.length,
    // newer exports say which project a chat belongs to; older ones do not
    project: String(c.project_uuid || c.project?.uuid || c.project_id || ''), design,
  };
}

/** Reads one or more export files (zips or loose JSON) into projects, chats, design frames and memory. */
async function readExport(list: File[]): Promise<Parsed> {
  const out: Parsed = { projects: [], chats: [], tools: [], memory: '', links: [] };
  const loose: { zip: string; path: string; data: Uint8Array }[] = [];
  for (const f of list) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const entries: Record<string, Uint8Array> = /\.zip$/i.test(f.name) || (bytes[0] === 0x50 && bytes[1] === 0x4b) ? unzipSync(bytes) : { [f.name]: bytes };
    const zip = f.name.toLowerCase();
    for (const [path, data] of Object.entries(entries)) {
      if (path.endsWith('/') || !data.length || /(^|\/)(__MACOSX|\.)/.test(path)) continue;
      const where = `${zip}/${path}`.toLowerCase();
      if (/\.json$/i.test(path)) {
        let v: unknown;
        try { v = JSON.parse(strFromU8(data)); } catch { continue; }
        // the newer export mail gives a manifest: a list of download links, not the data itself
        const files = (v as any)?.data_files;
        if (Array.isArray(files) && files.some((x: any) => x?.export_url)) {
          for (const x of files) if (x?.export_url) out.links.push({ name: String(x.filename || x.category), url: String(x.export_url), category: String(x.category || '') });
          continue;
        }
        if (/memor/.test(where)) { out.memory += `${strFromU8(data)}\n`; continue; }
        for (const r of records(v)) {
          if (isChat(r)) out.chats.push(toChat(r, /design/.test(where)));
          else if (isProject(r)) out.projects.push(toProject(r));
          else if (/frame/.test(where) && typeof (r.html || r.content) === 'string' && /<\w/.test(r.html || r.content)) {
            out.tools.push({ id: String(r.id || r.uuid || out.tools.length), title: String(r.title || r.name || 'Projekt z Design'), type: 'text/html', content: String(r.html || r.content) });
          }
        }
      } else {
        loose.push({ zip, path, data });
      }
    }
  }
  // project files that came as real files: attach to the project named in the path, or to the only project
  for (const l of loose) {
    const name = base(l.path);
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (/\.html?$/i.test(name) && /frame|design/.test(l.zip + l.path)) {
      out.tools.push({ id: l.path, title: name.replace(/\.html?$/i, ''), type: 'text/html', content: strFromU8(l.data) });
      continue;
    }
    const lower = l.path.toLowerCase();
    const owner = out.projects.find((p) => lower.includes(p.uuid.toLowerCase()) || lower.includes(p.name.toLowerCase()))
      || (out.projects.length === 1 ? out.projects[0] : undefined);
    if (!owner) continue;
    if (TEXT_EXT.test(name)) owner.docs.push({ filename: name, content: strFromU8(l.data) });
    else if (MIME[ext] && l.data.length <= MAX_FILE) owner.files.push({ name, mime: MIME[ext], data: l.data });
  }
  out.chats = out.chats.filter((c) => c.size > 0).sort((a, b) => b.date.localeCompare(a.date));
  return out;
}

export function ClaudeImport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [tools, setTools] = useState<Artifact[]>([]);
  const [memory, setMemory] = useState('');
  const [links, setLinks] = useState<Parsed['links']>([]);
  const [clicked, setClicked] = useState<Set<string>>(new Set());
  const [takeTools, setTakeTools] = useState(true);
  const [takeMemory, setTakeMemory] = useState(true);
  const [pickP, setPickP] = useState<Set<string>>(new Set());
  const [pickC, setPickC] = useState<Set<string>>(new Set());
  const [find, setFind] = useState('');
  const [onlyProject, setOnlyProject] = useState(true);
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState<string | null>(null);

  const read = async (list: FileList | null) => {
    const fs = [...(list || [])];
    if (!fs.length) return;
    setBusy('Czytam pliki…');
    try {
      const r = await readExport(fs);
      if (r.links.length && !r.projects.length && !r.chats.length && !r.tools.length) { setLinks(r.links); return; }
      const chosen = new Set(r.projects.filter((p) => /maple/i.test(p.name)).map((p) => p.uuid));
      setProjects(r.projects);
      setChats(r.chats);
      setTools(r.tools);
      setMemory(r.memory.trim());
      setPickP(chosen);
      // every chat of the chosen project is selected up front — that is the whole point of moving over
      // …and every Claude Design chat: those are the projects in progress
      setPickC(new Set(r.chats.filter((c) => c.design || (c.project && chosen.has(c.project))).map((c) => c.uuid)));
      if (!r.projects.length && !r.chats.length && !r.tools.length) toast('Nic nie znalazłem — czy to pliki z eksportu claude.ai?', 'error');
    } catch (e) {
      toast(`Nie udało się odczytać (${(e as Error).message})`, 'error');
    } finally {
      setBusy('');
    }
  };

  const linked = useMemo(() => chats.some((c) => c.project), [chats]);
  const shown = useMemo(() => {
    const k = searchKey(find);
    return chats.filter((c) => (c.design || !linked || !onlyProject || pickP.has(c.project)) && (!k || searchKey(c.name).includes(k))).slice(0, 300);
  }, [chats, find, onlyProject, pickP, linked]);


  const uploadHtml = async (title: string, content: string, description: string) => {
    const file = new File([content], `${title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'artefakt'}.html`, { type: 'text/html' });
    if (file.size > MAX_FILE) return false;
    await api.uploadKnowledge(file, { title, tags: 'narzędzie', description });
    return true;
  };

  const run = async () => {
    let docs = 0, notes = 0, toolsN = 0, prompts = 0, files = 0, designs = 0;
    try {
      const style = await api.style();
      let project = style.project;
      for (const p of (projects || []).filter((x) => pickP.has(x.uuid))) {
        setBusy(`Projekt ${p.name}…`);
        if (p.prompt.trim() && !project.includes(p.prompt.trim())) { project = [project, p.prompt.trim()].filter(Boolean).join('\n\n'); prompts++; }
        for (const d of p.docs) {
          await api.addNote({ title: d.filename.replace(/\.[a-z0-9]+$/i, ''), text: d.content.slice(0, MAX_NOTE), tags: `projekt ${p.name}`, description: `Z projektu „${p.name}”` });
          docs++;
        }
        for (const f of p.files) {
          setBusy(`Projekt ${p.name}: ${f.name}…`);
          await api.uploadKnowledge(new File([f.data as Uint8Array<ArrayBuffer>], f.name, { type: f.mime }), { tags: `projekt ${p.name}`, description: `Z projektu „${p.name}”` });
          files++;
        }
      }
      if (takeMemory && memory) {
        await api.addNote({ title: 'Pamięć Claude (o mnie i mojej pracy)', text: memory.slice(0, MAX_NOTE), tags: 'pamięć claude' });
        docs++;
      }
      // Claude Design: every design chat becomes a Studio project (its HTML versions + conversation);
      // frames that no chat explains become projects of their own
      const designChats = chats.filter((x) => x.design && pickC.has(x.uuid));
      const usedFrames = new Set<string>();
      for (const c of designChats) {
        setBusy(`Studio: ${c.name}…`);
        let versions = c.artifacts.filter(isHtml).map((a) => ({ html: a.content, note: a.title }));
        if (!versions.length) {
          const f = tools.find((t) => searchKey(t.title) === searchKey(c.name) || searchKey(t.title).includes(searchKey(c.name)));
          if (f) { versions = [{ html: f.content, note: 'Z Claude Design' }]; usedFrames.add(f.id); }
        }
        await api.createDesign({ title: c.name, kind: kindOf(c.name), versions, chat: c.messages.slice(-60) });
        designs++;
      }
      if (takeTools) {
        for (const t of tools.filter((x) => !usedFrames.has(x.id))) {
          setBusy(`Studio: ${t.title}…`);
          await api.createDesign({ title: t.title, kind: kindOf(t.title), versions: [{ html: t.content, note: 'Z Claude Design' }] });
          designs++;
        }
      }
      if (prompts) await api.saveStyle({ project });
      for (const c of chats.filter((x) => pickC.has(x.uuid) && !x.design)) {
        setBusy(`Czat ${c.name}…`);
        // keep it under the request size limit: the newest part of a very long chat
        let msgs = c.messages; let size = msgs.reduce((n, m) => n + m.text.length, 0);
        while (size > 1_500_000 && msgs.length > 2) { size -= msgs[0].text.length; msgs = msgs.slice(1); }
        await api.createThread({ title: c.name, source: 'claude', messages: msgs, updatedAt: c.date ? `${c.date}T12:00:00.000Z` : undefined });
        notes++;
        for (const a of c.artifacts) {
          if (isHtml(a)) {
            if (await uploadHtml(a.title, a.content, `Artefakt z czatu „${c.name}”`)) toolsN++;
          } else {
            await api.addNote({ title: a.title, text: a.content.slice(0, MAX_NOTE), tags: 'artefakt', description: `Artefakt z czatu „${c.name}”` });
            docs++;
          }
        }
      }
      qc.invalidateQueries();
      setDone(`Przeniesiono: ${notes} czatów, ${designs} projektów do Studio, ${docs} dokumentów, ${files} plików, ${toolsN} narzędzi${prompts ? ', instrukcje projektu' : ''}.`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const toggle = (set: Set<string>, id: string, fn: (s: Set<string>) => void) => {
    const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); fn(n);
  };
  const close = () => { setLinks([]); setClicked(new Set()); setProjects(null); setChats([]); setTools([]); setMemory(''); setDone(null); setFind(''); onClose(); };

  return (
    <Modal open={open} onClose={close} wide title="Przenieś z Claude"
      footer={projects && !done ? <>
        <button className="btn" onClick={close}>Anuluj</button>
        <button className="btn primary" disabled={!!busy || (!pickP.size && !pickC.size && !(takeTools && tools.length) && !(takeMemory && memory))} onClick={run}>
          {busy ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Przenieś {pickP.size + pickC.size ? `(${pickP.size + pickC.size})` : ''}
        </button></> : <button className="btn primary" onClick={close}>{done ? 'Gotowe' : 'Zamknij'}</button>}>
      {done ? (
        <div className="col">
          <div><b>{done}</b></div>
          <div className="soft">Czaty są w <b>Czatach</b> (menu), projekty z Claude Design w <b>Studio</b>, pliki i narzędzia w Bazie wiedzy.
            Sprawdź w Czatach, czy rodzaj czatu się zgadza (B2B / swobodny) — asystent pod mikrofonem zapisuje tam to, co napisze.
            Potem w <b>Ustawienia → Styl pisania</b> kliknij „Ucz się z czatów” przy B2B i przy rozmowach swobodnych.</div>
        </div>
      ) : links.length && !projects ? (
        <div className="col">
          <div>To jest <b>lista linków</b> z eksportu, nie same dane. Pobierz każdy plik — kliknij po kolei
            (otworzą się w przeglądarce, w której jesteś zalogowany do claude.ai; każdy link działa raz i przez 24 h):</div>
          <div className="col tight">
            {links.map((l) => (
              <a key={l.url} className={`btn sm ${clicked.has(l.url) ? '' : 'primary'}`} style={{ justifyContent: 'flex-start' }} href={l.url} target="_blank" rel="noreferrer"
                onClick={() => setClicked(new Set([...clicked, l.url]))}>
                {clicked.has(l.url) ? <Check size={14} /> : <Download size={14} />} {l.name}
              </a>
            ))}
          </div>
          <div className="soft small">Gdy wszystkie się pobiorą (folder Pobrane), wybierz je tutaj — wszystkie naraz:</div>
          <label className="btn primary" style={{ alignSelf: 'flex-start' }}>
            {busy ? <Loader2 size={16} className="spin" /> : <Upload size={16} />} {busy || 'Wybierz pobrane pliki .zip'}
            <input type="file" multiple accept=".zip,application/zip,.json,application/json" hidden onChange={(e) => { read(e.target.files); e.target.value = ''; }} />
          </label>
          <div className="hint">Jeśli link pokaże błąd (wygasł albo był już użyty), zrób nowy eksport w claude.ai → Ustawienia → Prywatność → Eksportuj dane.</div>
        </div>
      ) : !projects ? (
        <div className="col">
          <ol className="steps">
            <li>Na komputerze: <b>claude.ai → Ustawienia → Prywatność → Eksportuj dane</b> (Settings → Privacy → Export data).</li>
            <li>Po kilku minutach przyjdzie mail z linkami — pobierz <b>wszystkie pliki .zip</b> (projects, conversations, design_chats, frames, memories…). Linki działają 24 h.</li>
            <li>Wybierz je tutaj — wszystkie naraz. Czytam je w przeglądarce; do Opal5 trafia tylko to, co zaznaczysz.
              Masz tylko plik z linkami (.json)? Wybierz go — pokażę przyciski do pobrania każdego pliku.</li>
          </ol>
          <label className="btn primary" style={{ alignSelf: 'flex-start' }}>
            {busy ? <Loader2 size={16} className="spin" /> : <Upload size={16} />} {busy || 'Wybierz pliki eksportu (.zip)'}
            <input type="file" multiple accept=".zip,application/zip,.json,application/json" hidden onChange={(e) => { read(e.target.files); e.target.value = ''; }} />
          </label>
        </div>
      ) : (
        <div className="col" style={{ gap: 14 }}>
          {projects.length > 0 && (
            <div className="col tight">
              <b>Projekty — dokumenty i instrukcje</b>
              {projects.map((p) => (
                <label key={p.uuid} className="row" style={{ gap: 8 }}>
                  <input type="checkbox" checked={pickP.has(p.uuid)} onChange={() => toggle(pickP, p.uuid, setPickP)} />
                  <span className="grow">{p.name}</span><span className="soft small">{p.docs.length} dok.{p.files.length ? ` · ${p.files.length} plików` : ''}{p.prompt ? ' · instrukcje' : ''}</span>
                </label>
              ))}
            </div>
          )}
          {(tools.length > 0 || memory) && (
            <div className="col tight">
              <b>Z Claude Design i pamięci</b>
              {tools.length > 0 && (
                <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={takeTools} onChange={() => setTakeTools(!takeTools)} />
                  <span className="grow">Projekty z Claude Design (bez czatu) → Studio</span><span className="soft small">{tools.length}</span></label>
              )}
              {memory && (
                <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={takeMemory} onChange={() => setTakeMemory(!takeMemory)} />
                  <span className="grow">Pamięć Claude (co wie o Tobie i Twojej pracy)</span></label>
              )}
            </div>
          )}
          <div className="col tight">
            <b>Czaty — np. B2B, conversation, templates</b>
            <span className="soft small">Zaznacz rozmowy, z których asystent ma się uczyć stylu. Artefakty HTML (kalkulator, szablony) staną się narzędziami w CRM.</span>
            <input type="search" placeholder="Szukaj czatu…" value={find} onChange={(e) => setFind(e.target.value)} />
            <div className="row wrap" style={{ gap: 8 }}>
              {linked && (
                <label className="row small" style={{ gap: 6 }}>
                  <input type="checkbox" checked={onlyProject} onChange={() => setOnlyProject(!onlyProject)} /> tylko czaty z zaznaczonego projektu
                </label>
              )}
              <span className="grow" />
              <button className="btn sm ghost" onClick={() => setPickC(new Set([...pickC, ...shown.map((c) => c.uuid)]))}>Zaznacz wszystkie ({shown.length})</button>
              <button className="btn sm ghost" onClick={() => setPickC(new Set())}>Odznacz</button>
            </div>
            {!linked && <span className="small" style={{ color: 'var(--warn)' }}>Ten eksport nie mówi, które czaty są z projektu — zaznacz je ręcznie (wyszukiwarka pomaga).</span>}
            <div className="col tight" style={{ maxHeight: 320, overflow: 'auto' }}>
              {shown.map((c) => (
                <label key={c.uuid} className="row" style={{ gap: 8 }}>
                  <input type="checkbox" checked={pickC.has(c.uuid)} onChange={() => toggle(pickC, c.uuid, setPickC)} />
                  <span className="grow trunc">{c.design ? '🎨 ' : ''}{c.name}</span>
                  <span className="soft small nowrap">{c.date} · {c.size} wiad.{c.artifacts.length ? ` · ${c.artifacts.length} artef.` : ''}</span>
                </label>
              ))}
              {!shown.length && <span className="soft small">Brak czatów.</span>}
            </div>
          </div>
          {busy && <div className="soft small row"><Loader2 size={14} className="spin" /> {busy}</div>}
        </div>
      )}
    </Modal>
  );
}
