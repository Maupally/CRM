/**
 * Person files and the board: dated notes about people (what happened, who was there, where), explicit relations
 * ("Klaudia poleciła Magdę") and what the CRM already knows (who helps at which event, who works for which company,
 * whose tasks are tied to what). The board is the detective wall — photos and threads between people, events,
 * companies and places.
 */
import type { Crm } from './crm.js';
import { HttpError } from './crm.js';
import { nowIso } from './db.js';
import {
  NODE_KINDS, isIsoDay, longTxt, nodeKey, searchKey, txt,
  type Board, type BoardEdge, type BoardNode, type BoardNote, type NodeKind, type NodeRef, type PersonFile,
} from '../shared/domain.js';

const placeId = (name: string) => searchKey(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const snippet = (s: string, n = 70) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export interface NoteInput {
  text: string; day?: string; ref?: string; source?: string;
  people?: (number | string)[]; events?: string[]; companies?: string[]; places?: string[];
}

export class BoardStore {
  constructor(private crm: Crm) {}
  private get db() { return this.crm.db; }

  /** A person by id, name or alias — the way Claude refers to them. */
  async person(ref: number | string): Promise<{ id: number; name: string }> {
    const people = await this.crm.listPeople();
    const id = Number(ref);
    if (id) {
      const p = people.find((x) => x.id === id);
      if (!p) throw new HttpError(404, `Nie ma osoby ${ref}.`);
      return p;
    }
    const k = searchKey(String(ref)).trim();
    const exact = people.filter((p) => searchKey(p.name) === k || p.aliases.split(',').some((a) => searchKey(a).trim() === k));
    const hits = exact.length ? exact : people.filter((p) => searchKey(p.name).includes(k));
    if (hits.length === 1) return hits[0];
    if (!hits.length) throw new HttpError(404, `Nie ma w Zespole osoby „${ref}”. Zapisz ją najpierw (save_person).`);
    throw new HttpError(400, `„${ref}” pasuje do kilku osób: ${hits.map((p) => `${p.name} (id ${p.id})`).join(', ')}. Podaj id.`);
  }

  private async refs(d: NoteInput): Promise<NodeRef[]> {
    const out: NodeRef[] = [];
    for (const p of d.people || []) out.push({ kind: 'person', id: String((await this.person(p)).id) });
    if (d.events?.length) {
      const events = await this.crm.listEvents();
      for (const e of d.events) {
        if (!events.some((x) => x.id === txt(e))) throw new HttpError(404, `Nie ma wydarzenia ${e}.`);
        out.push({ kind: 'event', id: txt(e) });
      }
    }
    for (const c of d.companies || []) {
      if (!(await this.db.get('SELECT id FROM crm.leads WHERE id = ?', [txt(c)]))) throw new HttpError(404, `Nie ma firmy ${c}.`);
      out.push({ kind: 'company', id: txt(c) });
    }
    for (const pl of d.places || []) if (txt(pl)) out.push({ kind: 'place', id: txt(pl) });
    return out.filter((r, i) => out.findIndex((x) => x.kind === r.kind && x.id === r.id) === i);
  }

  async addNote(d: NoteInput): Promise<BoardNote> {
    const text = longTxt(d.text);
    if (!text) throw new HttpError(400, 'Pusta notatka.');
    const day = isIsoDay(d.day) ? d.day : this.crm.today();
    const refs = await this.refs(d);
    if (!refs.length) throw new HttpError(400, 'Notatka musi dotyczyć choć jednej osoby, wydarzenia, firmy albo miejsca.');
    const r = await this.db.get('INSERT INTO crm.notes (day, text, ref, source, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id',
      [day, text, txt(d.ref), txt(d.source), nowIso()]);
    const id = Number(r!.id);
    for (const x of refs) await this.db.run('INSERT INTO crm.note_links (note_id, kind, ref_id) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', [id, x.kind, x.id]);
    return (await this.notes()).find((n) => n.id === id)!;
  }

  async deleteNote(id: number) {
    if (!(await this.db.run('DELETE FROM crm.notes WHERE id = ?', [id]))) throw new HttpError(404, `Nie ma notatki ${id}.`);
    await this.db.run('DELETE FROM crm.note_links WHERE note_id = ?', [id]);
    return { ok: true };
  }

  /** Notes, newest first — all, or those tied to one person/event/company/place. */
  async notes(about?: NodeRef): Promise<BoardNote[]> {
    const rows = about
      ? await this.db.all(`SELECT n.* FROM crm.notes n WHERE EXISTS (SELECT 1 FROM crm.note_links l WHERE l.note_id = n.id AND l.kind = ? AND l.ref_id = ?)
          ORDER BY n.day DESC, n.id DESC`, [about.kind, about.id])
      : await this.db.all('SELECT * FROM crm.notes ORDER BY day DESC, id DESC');
    if (!rows.length) return [];
    const [links, names] = await Promise.all([
      this.db.all(`SELECT * FROM crm.note_links WHERE note_id IN (${rows.map(() => '?').join(',')})`, rows.map((r) => r.id)),
      this.names(),
    ]);
    return rows.map((r) => ({
      id: Number(r.id), day: r.day, text: r.text, ref: r.ref, source: r.source,
      links: links.filter((l) => Number(l.note_id) === Number(r.id))
        .map((l) => ({ kind: l.kind as NodeKind, id: l.ref_id, label: names.get(`${l.kind}:${l.ref_id}`) || l.ref_id })),
    }));
  }

  async link(a: NodeRef, b: NodeRef, label: string) {
    for (const x of [a, b]) if (!(NODE_KINDS as readonly string[]).includes(x.kind) || !txt(x.id)) throw new HttpError(400, 'Zły element powiązania.');
    const r = await this.db.get('INSERT INTO crm.links (a_kind, a_id, b_kind, b_id, label, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
      [a.kind, txt(a.id), b.kind, txt(b.id), txt(label), nowIso()]);
    return { id: Number(r!.id) };
  }

  async unlink(id: number) {
    if (!(await this.db.run('DELETE FROM crm.links WHERE id = ?', [id]))) throw new HttpError(404, `Nie ma powiązania ${id}.`);
    return { ok: true };
  }

  /** Display names for note links — light queries, not the full people/event lists. */
  private async names(): Promise<Map<string, string>> {
    const m = new Map<string, string>();
    const [people, events, leads] = await Promise.all([
      this.db.all('SELECT id, name FROM crm.people'), this.db.all('SELECT id, title FROM crm.events'),
      this.db.all(`SELECT id, company FROM crm.leads WHERE id IN (
        SELECT ref_id FROM crm.note_links WHERE kind = 'company' UNION SELECT a_id FROM crm.links WHERE a_kind = 'company'
        UNION SELECT b_id FROM crm.links WHERE b_kind = 'company')`),
    ]);
    for (const p of people) m.set(`person:${p.id}`, p.name);
    for (const e of events) m.set(`event:${e.id}`, e.title);
    for (const l of leads) m.set(`company:${l.id}`, l.company);
    return m;
  }

  /** The whole wall: every person, plus the events, companies and places something ties them to. */
  async board(): Promise<Board> {
    const [people, events, links, notes, tasks] = await Promise.all([
      this.crm.listPeople(), this.crm.listEvents(),
      this.db.all('SELECT * FROM crm.links ORDER BY id'), this.notes(),
      this.db.all(`SELECT person_id, event_id, lead_id, COUNT(*) AS n FROM crm.tasks WHERE person_id > 0 AND (event_id <> '' OR lead_id <> '')
        GROUP BY person_id, event_id, lead_id`),
    ]);
    const nodes = new Map<string, BoardNode>();
    const edges = new Map<string, BoardEdge>();
    const places = new Map<string, string>();
    const companies = new Set<string>();
    const node = (r: NodeRef) => {
      if (r.kind === 'place') { const id = placeId(r.id); if (!places.has(id)) places.set(id, r.id); return `place:${id}`; }
      if (r.kind === 'company') companies.add(r.id);
      return nodeKey(r);
    };
    const edge = (a: string, b: string, kind: BoardEdge['kinds'][number], label: string, linkId?: number) => {
      if (a === b) return;
      const [x, y] = a < b ? [a, b] : [b, a];
      const k = `${x}|${y}`;
      const e = edges.get(k) || { a: x, b: y, labels: [], kinds: [], linkIds: [] };
      if (label && !e.labels.includes(label)) e.labels.push(label);
      if (!e.kinds.includes(kind)) e.kinds.push(kind);
      if (linkId) e.linkIds.push(linkId);
      edges.set(k, e);
    };

    for (const l of links) edge(node({ kind: l.a_kind, id: l.a_id }), node({ kind: l.b_kind, id: l.b_id }), 'link', l.label, Number(l.id));
    for (const n of notes) {
      const keys = n.links.map((l) => node(l));
      const label = `${n.day.slice(5).split('-').reverse().join('.')}: ${snippet(n.text)}`;
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) edge(keys[i], keys[j], 'note', label);
    }
    for (const p of people) {
      for (const e of p.events) edge(`person:${p.id}`, `event:${e.eventId}`, 'event', e.role || 'przy wydarzeniu');
      // a partner added as a "person" named after its company is the company itself — no second tile for it
      if (p.leadId && searchKey(p.name) !== searchKey(p.company)) edge(`person:${p.id}`, node({ kind: 'company', id: p.leadId }), 'company', p.role || 'z firmy');
    }
    for (const t of tasks) {
      const n = Number(t.n);
      const what = `${n} ${n === 1 ? 'zadanie' : n < 5 ? 'zadania' : 'zadań'}`;
      if (t.event_id) edge(`person:${t.person_id}`, `event:${t.event_id}`, 'task', what);
      else if (t.lead_id) edge(`person:${t.person_id}`, node({ kind: 'company', id: t.lead_id }), 'task', what);
    }
    const used = new Set([...edges.values()].flatMap((e) => [e.a, e.b]));
    // events on the board also show where they happen and with which company
    for (const e of events) {
      if (!used.has(`event:${e.id}`)) continue;
      if (e.location) edge(`event:${e.id}`, node({ kind: 'place', id: e.location }), 'place', 'miejsce');
      if (e.leadId) edge(`event:${e.id}`, node({ kind: 'company', id: e.leadId }), 'company', 'z firmą');
    }

    for (const p of people) {
      nodes.set(`person:${p.id}`, { key: `person:${p.id}`, kind: 'person', id: String(p.id), label: p.name, sub: p.role || p.company,
        photo: p.photo || undefined, team: p.kind === 'team', weight: 0 });
    }
    for (const e of events) nodes.set(`event:${e.id}`, { key: `event:${e.id}`, kind: 'event', id: e.id, label: e.title, sub: e.date, weight: 0 });
    if (companies.size) {
      const rows = await this.db.all(`SELECT id, company, city FROM crm.leads WHERE id IN (${[...companies].map(() => '?').join(',')})`, [...companies]);
      for (const r of rows) nodes.set(`company:${r.id}`, { key: `company:${r.id}`, kind: 'company', id: r.id, label: r.company, sub: r.city || '', weight: 0 });
    }
    for (const [id, name] of places) nodes.set(`place:${id}`, { key: `place:${id}`, kind: 'place', id, label: name, sub: '', weight: 0 });

    const list = [...edges.values()].filter((e) => nodes.has(e.a) && nodes.has(e.b));
    for (const e of list) { nodes.get(e.a)!.weight++; nodes.get(e.b)!.weight++; }
    const keep = [...nodes.values()].filter((n) => n.kind === 'person' || n.weight > 0);
    return { nodes: keep, edges: list };
  }

  /** A person's file: notes about them and everything they are tied to. */
  async personFile(id: number): Promise<PersonFile> {
    const p = await this.crm.getPerson(id);
    const [notes, board] = await Promise.all([this.notes({ kind: 'person', id: String(id) }), this.board()]);
    const me = `person:${id}`;
    const byKey = new Map(board.nodes.map((n) => [n.key, n]));
    const connections = board.edges.filter((e) => e.a === me || e.b === me)
      .map((e) => ({ node: byKey.get(e.a === me ? e.b : e.a)!, why: e.labels, linkIds: e.linkIds }))
      .filter((c) => c.node)
      .sort((a, b) => b.why.length - a.why.length || a.node.label.localeCompare(b.node.label, 'pl'));
    return { person: { id: p.id, name: p.name, role: p.role, company: p.company, photo: p.photo || '' }, notes, connections };
  }
}
