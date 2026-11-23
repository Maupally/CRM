/**
 * The story of a project: pasted e-mail threads (and notes) as a timeline under a company, an event or a topic.
 * Paste the whole conversation (Ctrl+A, Ctrl+C in the mail) — Opal5 splits it into messages, proposes where it
 * belongs, keeps a short line per message and the tasks it leaves. Pasting the thread again adds only the new replies.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, ClipboardPaste, StickyNote, Trash2 } from 'lucide-react';
import { api, type ParsedStory } from '../api';
import { Modal, useAction, useToday } from './ui';
import { shortDate, type StoryDirection, type StoryItem } from '../../shared/domain';
import type { StoryDraft } from '../../server/story';

export interface StoryTarget { leadId?: string; eventId?: string; topic?: string }
const DIR_ICON = { in: ArrowDownLeft, out: ArrowUpRight, note: StickyNote } as const;
const DIR_LABEL: Record<StoryDirection, string> = { in: 'do nas', out: 'od nas', note: 'notatka' };

/** Threads of one target, oldest message first inside each, the most recently active thread on top. */
function byThread(items: StoryItem[]) {
  const m = new Map<string, StoryItem[]>();
  for (const i of items) m.set(i.thread || '—', [...(m.get(i.thread || '—') || []), i]);
  return [...m].sort((a, b) => (b[1].at(-1)!.day).localeCompare(a[1].at(-1)!.day));
}

export function StoryPanel({ target, title = 'Historia', card = true }: { target: StoryTarget; title?: string; card?: boolean }) {
  const q = useQuery({ queryKey: ['story', target], queryFn: () => api.story({ lead: target.leadId || '', event: target.eventId || '', topic: target.topic || '' }) });
  const [paste, setPaste] = useState(false);
  const drop = useAction((id: number) => api.deleteStory(id), { ok: 'Usunięto z historii' });
  const threads = byThread(q.data || []);
  const body = (
    <>
      {!threads.length && <div className="small faint" style={{ padding: '0 20px 12px' }}>Otwórz wątek w poczcie, zaznacz wszystko (Ctrl+A), skopiuj i wklej — każda wiadomość stanie się krokiem historii.</div>}
      {threads.map(([thread, items]) => (
        <div key={thread} className="story-thread">
          <div className="story-subject">{thread} <span className="faint small">· {items.length}</span></div>
          <ol className="story">
            {items.map((i) => {
              const I = DIR_ICON[i.direction] || ArrowDownLeft;
              return (
                <li key={i.id} className={`story-item ${i.direction}`}>
                  <span className="story-dot" title={DIR_LABEL[i.direction]}><I size={13} /></span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="meta"><b>{i.who || DIR_LABEL[i.direction]}</b> · {shortDate(i.day)}.{i.day.slice(2, 4)}</div>
                    <div className="story-text">{i.text}</div>
                  </div>
                  <button className="btn ghost icon sm story-del" aria-label="Usuń" title="Usuń z historii" onClick={() => confirm('Usunąć tę pozycję z historii?') && drop.mutate(i.id)}><Trash2 size={13} /></button>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
      <PasteStory open={paste} onClose={() => setPaste(false)} preset={target} />
    </>
  );
  const button = <button className="btn sm" onClick={() => setPaste(true)}><ClipboardPaste size={14} /> Wklej wątek maila</button>;
  if (!card) return <><div className="group-label row between">{title} · {q.data?.length || 0}{button}</div>{body}</>;
  return (
    <section className="card">
      <div className="card-head"><h2>{title}</h2><span className="count">{q.data?.length || 0}</span>{button}</div>
      {body}
    </section>
  );
}

type Choice = { key: string; label: string; target: StoryTarget };

export function PasteStory({ open, onClose, preset }: { open: boolean; onClose: () => void; preset?: StoryTarget }) {
  const today = useToday();
  const [raw, setRaw] = useState('');
  const [parsed, setParsed] = useState<ParsedStory | null>(null);
  const [subject, setSubject] = useState('');
  const [items, setItems] = useState<(StoryDraft & { on: boolean })[]>([]);
  const [tasks, setTasks] = useState<{ task: string; due?: string; on: boolean }[]>([]);
  const [choice, setChoice] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const presetSet = !!(preset && (preset.leadId || preset.eventId || preset.topic));
  const events = useQuery({ queryKey: ['events'], queryFn: api.events, enabled: open && !presetSet });
  const allTasks = useQuery({ queryKey: ['tasks'], queryFn: api.tasks, enabled: open && !presetSet });

  const reset = () => { setRaw(''); setParsed(null); setItems([]); setTasks([]); setChoice(''); setNewTopic(''); onClose(); };
  const parse = useAction((text: string) => api.parseStory(text), {
    onDone: (p) => {
      setParsed(p); setSubject(p.subject);
      setItems(p.items.map((i) => ({ ...i, on: true })));
      setTasks((p.tasks || []).map((t) => ({ ...t, on: true })));
      setChoice(p.companies[0] ? `L:${p.companies[0].id}` : p.groups[0] ? `G:0` : '');
    },
  });

  const choices = useMemo<Choice[]>(() => {
    if (!parsed) return [];
    const out: Choice[] = parsed.companies.map((c) => ({ key: `L:${c.id}`, label: `Firma: ${c.company} (z adresu e-mail)`, target: { leadId: c.id } }));
    parsed.groups.forEach((g, i) => {
      const t: StoryTarget = g.set.event_id ? { eventId: g.set.event_id } : g.set.lead_id ? { leadId: g.set.lead_id } : { topic: g.set.topic };
      if (!out.some((o) => JSON.stringify(o.target) === JSON.stringify(t))) out.push({ key: `G:${i}`, label: `${({ event: 'Wydarzenie', project: 'Temat', segment: 'Temat', process: 'Procedura', company: 'Firma' })[g.kind]}: ${g.title}`, target: t });
    });
    for (const e of (events.data || []).filter((e) => e.date >= today && e.status !== 'cancelled')) {
      if (!out.some((o) => o.target.eventId === e.id)) out.push({ key: `E:${e.id}`, label: `Wydarzenie: ${e.title} (${shortDate(e.date)})`, target: { eventId: e.id } });
    }
    return out;
  }, [parsed, events.data, today]);
  const topics = [...new Set((allTasks.data || []).map((t) => t.topic).filter(Boolean))].sort();
  const target: StoryTarget | undefined = presetSet ? preset : choice === 'new' ? (newTopic.trim() ? { topic: newTopic.trim() } : undefined) : choices.find((c) => c.key === choice)?.target;

  const save = useAction(async () => {
    const r = await api.saveStory({ ...target!, thread: subject, items: items.filter((i) => i.on).map(({ on: _o, ...i }) => i) });
    for (const t of tasks.filter((x) => x.on && x.task.trim())) {
      await api.saveTask({ task: t.task, due: t.due || '', leadId: target!.leadId || '', eventId: target!.eventId || '', topic: target!.topic || '' });
    }
    return r;
  }, { ok: (r) => `Dopisano do historii: ${r.added}${r.skipped ? ` (pominięto ${r.skipped} już zapisanych)` : ''}`, onDone: reset });

  return (
    <Modal open={open} onClose={reset} wide title="Wklej wątek maila"
      footer={!parsed
        ? <button className="btn primary" disabled={!raw.trim() || parse.isPending} onClick={() => parse.mutate(raw)}>{parse.isPending ? 'Czytam wątek…' : 'Dalej'}</button>
        : <>
          <button className="btn" style={{ marginRight: 'auto' }} onClick={() => setParsed(null)}>Wstecz</button>
          <button className="btn primary" disabled={!target || !items.some((i) => i.on) || save.isPending} onClick={() => save.mutate(undefined)}>Zapisz w historii</button>
        </>}>
      {!parsed ? (
        <>
          <textarea autoFocus rows={14} value={raw} onChange={(e) => setRaw(e.target.value)}
            placeholder={'Otwórz wątek w poczcie → Ctrl+A → Ctrl+C → wklej tutaj (Ctrl+V).\nZ każdej wiadomości zostanie krótkie streszczenie: kto, kiedy, co ustalono.'} />
          <div className="small faint">RODO: zapisuję tylko krótkie streszczenia, nie całe maile. Nie wklejaj wątków z danymi dzieci ani prywatnymi danymi rodziców.</div>
        </>
      ) : (
        <div className="col" style={{ gap: 12 }}>
          <label className="field wide">Wątek<input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
          {!presetSet && (
            <div className="col tight">
              <b>Gdzie to należy?</b>
              {choices.map((c) => (
                <label key={c.key} className="row" style={{ gap: 8 }}><input type="radio" name="story-target" checked={choice === c.key} onChange={() => setChoice(c.key)} /> {c.label}</label>
              ))}
              <label className="row" style={{ gap: 8 }}><input type="radio" name="story-target" checked={choice === 'new'} onChange={() => setChoice('new')} /> Temat:
                <input type="text" list="story-topics" value={newTopic} placeholder="np. Związki wyznaniowe" onFocus={() => setChoice('new')} onChange={(e) => setNewTopic(e.target.value)} />
                <datalist id="story-topics">{topics.map((t) => <option key={t} value={t} />)}</datalist>
              </label>
            </div>
          )}
          <div className="col tight">
            <b>Wiadomości · {items.filter((i) => i.on).length}</b>
            {!parsed.ai && <div className="small faint">Podział zrobiony bez AI — popraw streszczenia, jeśli trzeba.</div>}
            {items.map((i, k) => (
              <div key={k} className="row" style={{ gap: 8, alignItems: 'flex-start' }}>
                <input type="checkbox" checked={i.on} onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, on: e.target.checked } : x)))} />
                <div className="grow col tight">
                  <div className="small soft">{shortDate(i.day)} · <b>{i.who || '—'}</b> · {DIR_LABEL[i.direction]}</div>
                  <textarea rows={2} value={i.text} onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, text: e.target.value } : x)))} />
                </div>
              </div>
            ))}
          </div>
          {tasks.length > 0 && (
            <div className="col tight">
              <b>Zadania z tego wątku</b>
              {tasks.map((t, k) => (
                <label key={k} className="row" style={{ gap: 8 }}>
                  <input type="checkbox" checked={t.on} onChange={(e) => setTasks(tasks.map((x, j) => (j === k ? { ...x, on: e.target.checked } : x)))} />
                  <span className="grow">{t.task}</span>{t.due && <span className="tag">{shortDate(t.due)}</span>}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
