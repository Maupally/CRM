import { useMemo, useState } from 'react';
import { unzipSync, strFromU8 } from 'fflate';
import { Upload, Check, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Modal, useToast } from './ui';
import { searchKey } from '../../shared/domain';

/* claude.ai data export (Settings → Privacy → Export data): a zip with projects.json and conversations.json.
   Everything is read here in the browser — the export can be large — and only the chosen parts go to the CRM. */

interface Doc { filename: string; content: string }
interface Project { uuid: string; name: string; prompt: string; docs: Doc[] }
interface Artifact { id: string; title: string; type: string; content: string }
interface Chat { uuid: string; name: string; date: string; transcript: string; artifacts: Artifact[]; size: number; project: string }

const MAX_NOTE = 190_000;

function parseProjects(raw: unknown): Project[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((p: any) => ({
    uuid: String(p.uuid || p.name), name: String(p.name || 'Projekt'), prompt: String(p.prompt_template || p.description || ''),
    docs: (Array.isArray(p.docs) ? p.docs : []).filter((d: any) => d && d.content)
      .map((d: any) => ({ filename: String(d.filename || 'dokument'), content: String(d.content) })),
  }));
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

function parseChats(raw: unknown): Chat[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c: any) => {
    const msgs = Array.isArray(c.chat_messages) ? c.chat_messages : [];
    const lines = msgs.map((m: any) => {
      const text = String(m.text || (Array.isArray(m.content) ? m.content.filter((x: any) => x?.type === 'text').map((x: any) => x.text).join('\n') : ''))
        .replace(/<antArtifact\b[^>]*>[\s\S]*?<\/antArtifact>/g, '[artefakt]').trim();
      return text ? `${m.sender === 'human' ? 'Ja' : 'Claude'}: ${text}` : '';
    }).filter(Boolean);
    let transcript = lines.join('\n\n');
    if (transcript.length > MAX_NOTE) transcript = '…\n' + transcript.slice(-MAX_NOTE);          // keep the most recent part
    return {
      uuid: String(c.uuid), name: String(c.name || 'Bez tytułu'), date: String(c.updated_at || c.created_at || '').slice(0, 10),
      transcript, artifacts: collectArtifacts(msgs), size: lines.length,
      // newer exports say which project a chat belongs to; older ones do not
      project: String(c.project_uuid || c.project?.uuid || ''),
    };
  }).filter((c) => c.size > 0).sort((a, b) => b.date.localeCompare(a.date));
}

export function ClaudeImport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [pickP, setPickP] = useState<Set<string>>(new Set());
  const [pickC, setPickC] = useState<Set<string>>(new Set());
  const [find, setFind] = useState('');
  const [onlyProject, setOnlyProject] = useState(true);
  const [busy, setBusy] = useState('');
  const [done, setDone] = useState<string | null>(null);

  const read = async (f: File | undefined) => {
    if (!f) return;
    setBusy('Czytam plik…');
    try {
      const files = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: (x) => /(projects|conversations)\.json$/.test(x.name) });
      const get = (n: string) => { const k = Object.keys(files).find((x) => x.endsWith(n)); return k ? JSON.parse(strFromU8(files[k])) : []; };
      const ps = parseProjects(get('projects.json'));
      const chosen = new Set(ps.filter((p) => /maple/i.test(p.name)).map((p) => p.uuid));
      const cs = parseChats(get('conversations.json'));
      setProjects(ps);
      setChats(cs);
      setPickP(chosen);
      // every chat of the chosen project is selected up front — that is the whole point of moving over
      setPickC(new Set(cs.filter((c) => c.project && chosen.has(c.project)).map((c) => c.uuid)));
      if (!ps.length) toast('W pliku nie ma projektów — wybierz same czaty', 'error');
    } catch (e) {
      toast(`To nie wygląda na eksport z claude.ai (${(e as Error).message})`, 'error');
    } finally {
      setBusy('');
    }
  };

  const linked = useMemo(() => chats.some((c) => c.project), [chats]);
  const shown = useMemo(() => {
    const k = searchKey(find);
    return chats.filter((c) => (!linked || !onlyProject || pickP.has(c.project)) && (!k || searchKey(c.name).includes(k))).slice(0, 300);
  }, [chats, find, onlyProject, pickP, linked]);


  const run = async () => {
    let docs = 0, notes = 0, tools = 0, prompts = 0;
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
      }
      if (prompts) await api.saveStyle({ project });
      for (const c of chats.filter((x) => pickC.has(x.uuid))) {
        setBusy(`Czat ${c.name}…`);
        await api.addNote({ title: `Czat: ${c.name}`, text: c.transcript, tags: 'czat', description: `Rozmowa z Claude z ${c.date}` });
        notes++;
        for (const a of c.artifacts) {
          const html = /html/.test(a.type) || /^\s*<!doctype html|^\s*<html/i.test(a.content);
          if (html) {
            const file = new File([a.content], `${a.title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'artefakt'}.html`, { type: 'text/html' });
            if (file.size > 4 * 1024 * 1024) continue;
            await api.uploadKnowledge(file, { title: a.title, tags: 'narzędzie', description: `Artefakt z czatu „${c.name}”` });
            tools++;
          } else {
            await api.addNote({ title: a.title, text: a.content.slice(0, MAX_NOTE), tags: 'artefakt', description: `Artefakt z czatu „${c.name}”` });
            docs++;
          }
        }
      }
      qc.invalidateQueries();
      setDone(`Przeniesiono: ${docs} dokumentów, ${notes} czatów, ${tools} narzędzi${prompts ? ', instrukcje projektu' : ''}.`);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy('');
    }
  };

  const toggle = (set: Set<string>, id: string, fn: (s: Set<string>) => void) => {
    const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); fn(n);
  };
  const close = () => { setProjects(null); setChats([]); setDone(null); setFind(''); onClose(); };

  return (
    <Modal open={open} onClose={close} wide title="Przenieś z Claude"
      footer={projects && !done ? <>
        <button className="btn" onClick={close}>Anuluj</button>
        <button className="btn primary" disabled={!!busy || (!pickP.size && !pickC.size)} onClick={run}>
          {busy ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Przenieś {pickP.size + pickC.size ? `(${pickP.size + pickC.size})` : ''}
        </button></> : <button className="btn primary" onClick={close}>{done ? 'Gotowe' : 'Zamknij'}</button>}>
      {done ? (
        <div className="col">
          <div><b>{done}</b></div>
          <div className="soft">Teraz w <b>Ustawienia → Styl pisania</b> kliknij „Ucz się z czatów” przy Maile B2B (wybierz czat B2B)
            i przy Rozmowach swobodnych (czat „conversation”) — asystent będzie pisał tak jak tam. Narzędzia (kalkulator, szablony) są w Bazie wiedzy.</div>
        </div>
      ) : !projects ? (
        <div className="col">
          <ol className="steps">
            <li>Na komputerze: <b>claude.ai → Ustawienia → Prywatność → Eksportuj dane</b> (Settings → Privacy → Export data).</li>
            <li>Po kilku minutach przyjdzie mail z linkiem — pobierz plik <b>.zip</b>.</li>
            <li>Wybierz go tutaj. Plik czytam w przeglądarce; do CRM trafia tylko to, co zaznaczysz.</li>
          </ol>
          <label className="btn primary" style={{ alignSelf: 'flex-start' }}>
            {busy ? <Loader2 size={16} className="spin" /> : <Upload size={16} />} {busy || 'Wybierz plik eksportu (.zip)'}
            <input type="file" accept=".zip,application/zip" hidden onChange={(e) => { read(e.target.files?.[0]); e.target.value = ''; }} />
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
                  <span className="grow">{p.name}</span><span className="soft small">{p.docs.length} dok.{p.prompt ? ' · instrukcje' : ''}</span>
                </label>
              ))}
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
                  <span className="grow trunc">{c.name}</span>
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
