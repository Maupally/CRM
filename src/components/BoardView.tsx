import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { Minus, Plus, Maximize2, MapPin, CalendarDays, Building2, FolderOpen, Crosshair, X, type LucideIcon } from 'lucide-react';
import { Seg } from './ui';
import { Avatar } from './ui';
import type { Board, BoardEdge, BoardNode } from '../../shared/domain';

type P = { x: number; y: number };
const LAYOUTS = new Map<string, Map<string, P>>();

/** A simple force layout, deterministic, run once per board: pushes nodes apart, pulls threads tight. */
function layout(nodes: BoardNode[], edges: BoardEdge[]): Map<string, P> {
  const pos = new Map<string, P>();
  const n = nodes.length;
  nodes.forEach((v, i) => {
    const r = 120 + 26 * Math.sqrt(n) * (v.kind === 'person' ? 0.7 : 1.1);
    const a = (i / Math.max(1, n)) * Math.PI * 2 * 3.1;
    pos.set(v.key, { x: Math.cos(a) * r * (0.6 + (i % 5) * 0.1), y: Math.sin(a) * r * (0.6 + (i % 7) * 0.07) });
  });
  const vel = new Map(nodes.map((v) => [v.key, { x: 0, y: 0 }]));
  const deg = new Map(nodes.map((v) => [v.key, 0]));
  for (const e of edges) { deg.set(e.a, (deg.get(e.a) || 0) + 1); deg.set(e.b, (deg.get(e.b) || 0) + 1); }
  for (let step = 0; step < 320; step++) {
    const cool = 1 - step / 340;
    for (let i = 0; i < n; i++) {
      const a = pos.get(nodes[i].key)!;
      for (let j = i + 1; j < n; j++) {
        const b = pos.get(nodes[j].key)!;
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = (i - j) * 0.5; dy = 1; d2 = dx * dx + dy * dy; }
        const f = 42000 / d2;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * f, fy = (dy / d) * f;
        const va = vel.get(nodes[i].key)!, vb = vel.get(nodes[j].key)!;
        va.x += fx; va.y += fy; vb.x -= fx; vb.y -= fy;
      }
    }
    for (const e of edges) {
      const a = pos.get(e.a), b = pos.get(e.b);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 200) * 0.04;
      const va = vel.get(e.a)!, vb = vel.get(e.b)!;
      va.x += (dx / d) * f; va.y += (dy / d) * f; vb.x -= (dx / d) * f; vb.y -= (dy / d) * f;
    }
    for (const v of nodes) {
      const p = pos.get(v.key)!, s = vel.get(v.key)!;
      const pull = deg.get(v.key) ? 0.012 : 0.03;
      s.x -= p.x * pull; s.y -= p.y * pull;
      const m = Math.min(40, Math.hypot(s.x, s.y)) * cool;
      const h = Math.hypot(s.x, s.y) || 1;
      p.x += (s.x / h) * m; p.y += (s.y / h) * m;
      s.x *= 0.5; s.y *= 0.5;
    }
  }
  return pos;
}

/** Columns: one per kind, most connected (or A–Z) on top. */
function columns(nodes: BoardNode[], sort: 'links' | 'name'): Map<string, P> {
  const pos = new Map<string, P>();
  const cols = CATS.map(([c]) => nodes.filter((n) => catOf(n) === c)).filter((l) => l.length);
  cols.forEach((list, ci) => {
    list.sort((a, b) => (sort === 'name' ? a.label.localeCompare(b.label, 'pl') : b.weight - a.weight || a.label.localeCompare(b.label, 'pl')));
    list.forEach((n, i) => pos.set(n.key, { x: (ci - (cols.length - 1) / 2) * 230, y: (i - (list.length - 1) / 2) * 66 }));
  });
  return pos;
}

/** Rings around one tile: its direct connections, then theirs; everything else on the outer ring. */
function radial(center: string, nodes: BoardNode[], edges: BoardEdge[], depth: number): { pos: Map<string, P>; dist: Map<string, number> } {
  const adj = new Map<string, string[]>();
  for (const e of edges) { adj.set(e.a, [...(adj.get(e.a) || []), e.b]); adj.set(e.b, [...(adj.get(e.b) || []), e.a]); }
  const dist = new Map<string, number>([[center, 0]]);
  const queue = [center];
  while (queue.length) { const k = queue.shift()!; for (const x of adj.get(k) || []) if (!dist.has(x)) { dist.set(x, dist.get(k)! + 1); queue.push(x); } }
  const pos = new Map<string, P>([[center, { x: 0, y: 0 }]]);
  const angle = new Map<string, number>();
  const ring = (d: number) => nodes.filter((n) => (d > depth ? !dist.has(n.key) || dist.get(n.key)! > depth : dist.get(n.key) === d) && n.key !== center);
  let r = 0;
  for (let d = 1; d <= depth + 1; d++) {
    const list = ring(d);
    if (!list.length) continue;
    // keep children next to their parents: order by the parents' angle, then by kind and name
    const want = (n: BoardNode) => {
      const ps = (adj.get(n.key) || []).filter((x) => angle.has(x));
      return ps.length ? ps.reduce((s, x) => s + angle.get(x)!, 0) / ps.length : 10 + CATS.findIndex(([c]) => c === catOf(n));
    };
    list.sort((a, b) => want(a) - want(b) || catOf(a).localeCompare(catOf(b)) || b.weight - a.weight);
    r = Math.max(r + (d === 1 ? 250 : 230), (list.length * 200) / (2 * Math.PI));
    list.forEach((n, i) => {
      const a = (i / list.length) * Math.PI * 2 - Math.PI / 2;
      angle.set(n.key, a);
      pos.set(n.key, { x: Math.cos(a) * r * 1.25, y: Math.sin(a) * r });
    });
  }
  return { pos, dist };
}

const CATS = [['team', 'Zespół'], ['ext', 'Z zewnątrz'], ['event', 'Wydarzenia'], ['company', 'Firmy'], ['place', 'Miejsca']] as const;
type Cat = (typeof CATS)[number][0];
const catOf = (n: BoardNode): Cat => (n.kind === 'person' ? (n.team ? 'team' : 'ext') : n.kind);
type Smart = 'all' | 'linked' | 'upcoming' | 'top' | 'lonely';
const SMART: [Smart, string, string][] = [
  ['all', 'Wszystko', ''],
  ['linked', 'Tylko powiązani', 'bez osób, które nie mają żadnych nitek'],
  ['upcoming', 'Nadchodzące wydarzenia', 'wydarzenia od dziś i kto przy nich jest'],
  ['top', 'Najbardziej powiązani', '15 osób i rzeczy z największą liczbą powiązań i to, co je łączy'],
  ['lonely', 'Bez powiązań', 'kto nie jest jeszcze z niczym powiązany — do uzupełnienia'],
];

const KIND_ICON: Record<BoardNode['kind'], LucideIcon> = { person: FolderOpen, event: CalendarDays, company: Building2, place: MapPin };
const KIND_NAME: Record<BoardNode['kind'], string> = { person: 'Osoba', event: 'Wydarzenie', company: 'Firma', place: 'Miejsce' };
const href = (n: BoardNode) => (n.kind === 'person' ? `/zespol/${n.id}` : n.kind === 'event' ? `/wydarzenia/${n.id}` : n.kind === 'company' ? `/firmy/${n.id}` : '');
type Mode = 'free' | 'groups' | 'center';

/**
 * The connections board: people, events, companies and places as tiles, lines between whatever is connected.
 * Three arrangements — free, in columns, or around one tile ("Ustaw w centrum") with everything unrelated greyed out —
 * plus filters by kind and smart filters. `pick` selects and centres a tile from outside (the search next to the board).
 */
export function BoardView({ board, focus, height = 640, pick, defaultCenter }: {
  board: Board; focus?: string; height?: number; pick?: { key: string; n: number }; defaultCenter?: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [mode, setMode] = useState<Mode>(defaultCenter ? 'center' : 'free');
  const [center, setCenter] = useState<string | undefined>(defaultCenter);
  const [depth, setDepth] = useState<'1' | '2'>('1');
  const [sort, setSort] = useState<'links' | 'name'>('links');
  const [hidden, setHidden] = useState<Set<Cat>>(new Set());
  const [smart, setSmart] = useState<Smart>('all');
  useEffect(() => { if (defaultCenter && !center) { setCenter(defaultCenter); setMode('center'); } }, [defaultCenter]); // eslint-disable-line react-hooks/exhaustive-deps

  const scoped = useMemo(() => {
    if (!focus) return board;
    const near = new Set([focus]);
    for (const e of board.edges) { if (e.a === focus) near.add(e.b); if (e.b === focus) near.add(e.a); }
    return { nodes: board.nodes.filter((n) => near.has(n.key)), edges: board.edges.filter((e) => near.has(e.a) && near.has(e.b)) };
  }, [board, focus]);
  const counts = useMemo(() => new Map(CATS.map(([c]) => [c, scoped.nodes.filter((n) => catOf(n) === c).length])), [scoped]);

  // filters: kinds switched off, then the smart filter
  const { nodes, edges } = useMemo(() => {
    let ns = scoped.nodes.filter((n) => !hidden.has(catOf(n)) || n.key === center);
    const keep = (set: Set<string>) => { ns = ns.filter((n) => set.has(n.key)); };
    const es0 = (list: BoardNode[]) => { const k = new Set(list.map((n) => n.key)); return scoped.edges.filter((e) => k.has(e.a) && k.has(e.b)); };
    if (smart === 'linked') keep(new Set(es0(ns).flatMap((e) => [e.a, e.b])));
    if (smart === 'lonely') { const linked = new Set(es0(ns).flatMap((e) => [e.a, e.b])); ns = ns.filter((n) => !linked.has(n.key)); }
    if (smart === 'upcoming') {
      const ev = new Set(ns.filter((n) => n.kind === 'event' && n.sub >= today).map((n) => n.key));
      const s = new Set(ev);
      for (const e of es0(ns)) { if (ev.has(e.a)) s.add(e.b); if (ev.has(e.b)) s.add(e.a); }
      keep(s);
    }
    if (smart === 'top') {
      const top = new Set([...ns].sort((a, b) => b.weight - a.weight).slice(0, 15).map((n) => n.key));
      keep(top);
    }
    return { nodes: ns, edges: es0(ns) };
  }, [scoped, hidden, smart, center, today]);

  const activeCenter = mode === 'center' && center && nodes.some((n) => n.key === center) ? center : undefined;
  // the free layout is the slow part: keep it for as long as the same tiles and lines are on the board (refetches, revisits)
  const sig = useMemo(() => `${nodes.map((n) => n.key).join(',')}#${edges.map((e) => `${e.a}|${e.b}`).join(',')}`, [nodes, edges]);
  const arranged = useMemo(() => {
    if (mode === 'groups') return { pos: columns(nodes, sort), dist: null };
    if (activeCenter) return radial(activeCenter, nodes, edges, Number(depth));
    const hit = LAYOUTS.get(sig);
    if (hit) return { pos: hit, dist: null };
    const p = layout(nodes, edges);
    if (LAYOUTS.size > 20) LAYOUTS.clear();
    LAYOUTS.set(sig, p);
    return { pos: p, dist: null };
  }, [sig, mode, sort, activeCenter, depth]); // eslint-disable-line react-hooks/exhaustive-deps
  const pos = arranged.pos;
  const far = (k: string) => !!arranged.dist && (!arranged.dist.has(k) || arranged.dist.get(k)! > Number(depth));

  const [moved, setMoved] = useState<Map<string, P>>(new Map());
  const at = (k: string) => moved.get(k) || pos.get(k) || { x: 0, y: 0 };
  const [sel, setSel] = useState<string | null>(null);
  const [edgeSel, setEdgeSel] = useState<BoardEdge | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: 'pan' | 'node'; key?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  const fit = () => {
    const el = box.current; if (!el || !nodes.length) return;
    // around a centre: fit what is connected, not the grey outer ring
    const shown = arranged.dist ? nodes.filter((n) => !far(n.key)) : nodes;
    const list = shown.length ? shown : nodes;
    const xs = list.map((n) => at(n.key).x), ys = list.map((n) => at(n.key).y);
    const w = Math.max(...xs) - Math.min(...xs) + 260, h = Math.max(...ys) - Math.min(...ys) + 160;
    const k = Math.min(1.2, Math.max(0.25, Math.min(el.clientWidth / w, el.clientHeight / h)));
    setView({ k, x: el.clientWidth / 2 - ((Math.max(...xs) + Math.min(...xs)) / 2) * k, y: el.clientHeight / 2 - ((Math.max(...ys) + Math.min(...ys)) / 2) * k });
  };
  useEffect(() => { setMoved(new Map()); setEdgeSel(null); }, [sig, focus, mode, activeCenter, depth, sort]);
  useEffect(() => { fit(); }, [pos]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = box.current;
    if (!pick || !el || !pos.has(pick.key)) return;
    const p = at(pick.key);
    setSel(pick.key); setEdgeSel(null);
    setView((v) => { const k = Math.max(v.k, 0.9); return { k, x: el.clientWidth / 2 - p.x * k, y: el.clientHeight / 2 - p.y * k }; });
  }, [pick]); // eslint-disable-line react-hooks/exhaustive-deps

  const near = useMemo(() => {
    if (!sel) return null;
    const s = new Set([sel]);
    for (const e of edges) { if (e.a === sel) s.add(e.b); if (e.b === sel) s.add(e.a); }
    return s;
  }, [sel, edges]);
  const isDim = (k: string) => (near ? !near.has(k) : far(k));

  const zoom = (f: number, cx?: number, cy?: number) => setView((v) => {
    const el = box.current!; const px = cx ?? el.clientWidth / 2, py = cy ?? el.clientHeight / 2;
    const k = Math.min(2.2, Math.max(0.15, v.k * f));
    return { k, x: px - ((px - v.x) / v.k) * k, y: py - ((py - v.y) / v.k) * k };
  });
  useEffect(() => {
    const el = box.current; if (!el) return;
    const wheel = (e: WheelEvent) => { e.preventDefault(); const r = el.getBoundingClientRect(); zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top); };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  const down = (e: RPointerEvent, key?: string) => {
    e.stopPropagation();
    box.current?.setPointerCapture?.(e.pointerId);
    const p = key ? at(key) : { x: view.x, y: view.y };
    drag.current = { kind: key ? 'node' : 'pan', key, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false };
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.kind === 'pan') setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
    else setMoved((m) => new Map(m).set(d.key!, { x: d.ox + dx / view.k, y: d.oy + dy / view.k }));
  };
  const up = () => {
    const d = drag.current; drag.current = null;
    if (d && !d.moved) { if (d.kind === 'node') { setSel(d.key === sel ? null : d.key!); setEdgeSel(null); } else { setSel(null); setEdgeSel(null); } }
  };
  const centerOn = (k: string) => { setCenter(k); setMode('center'); setSel(null); };

  const byKey = new Map(scoped.nodes.map((n) => [n.key, n]));
  const selected = sel ? byKey.get(sel) : null;
  const selEdges = sel ? edges.filter((e) => e.a === sel || e.b === sel) : [];
  const centerNode = center ? byKey.get(center) : undefined;

  if (!scoped.nodes.length) return <div className="empty">Jeszcze nic nie jest powiązane. Claude dopina tu ludzi, wydarzenia i miejsca z notatek.</div>;

  return (
    <div className="board-wrap">
      <div className="board-bar">
        <Seg value={mode} options={['free', 'groups', 'center'] as const} onChange={(m) => { setMode(m); if (m === 'center' && !center) setCenter(sel || defaultCenter || nodes[0]?.key); }}
          labels={{ free: 'Swobodnie', groups: 'Kolumny', center: 'Od środka' }} />
        {mode === 'groups' && <Seg value={sort} options={['links', 'name'] as const} labels={{ links: 'Najwięcej powiązań', name: 'A–Z' }} onChange={setSort} />}
        {mode === 'center' && centerNode && (
          <>
            <span className="tag soon"><Crosshair size={12} /> {centerNode.label}
              {center !== defaultCenter && defaultCenter && <button className="tag-x" onClick={() => setCenter(defaultCenter)} title="Wróć do domyślnego"><X size={11} /></button>}</span>
            <Seg value={depth} options={['1', '2'] as const} labels={{ '1': 'Bezpośrednie', '2': '+ ich powiązania' }} onChange={setDepth} />
          </>
        )}
        <span className="grow" />
        <div className="chips">
          {CATS.filter(([c]) => counts.get(c)).map(([c, label]) => (
            <button key={c} className={`chip ${hidden.has(c) ? '' : 'on'}`} onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(c)) n.delete(c); else n.add(c); return n; })}>
              <i className={`dot k-${c}`} />{label} <span className="n">{counts.get(c)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="board-bar sub">
        <span className="small soft">Pokaż:</span>
        <div className="chips">
          {SMART.map(([k, label, hint]) => <button key={k} title={hint} className={`chip ${smart === k ? 'on' : ''}`} onClick={() => setSmart(k)}>{label}</button>)}
        </div>
      </div>

      <div className="board" ref={box} style={{ height }} onPointerDown={(e) => down(e)} onPointerMove={move} onPointerUp={up}>
        {!nodes.length && <div className="empty" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>Nic nie pasuje do filtrów.</div>}
        <div className="board-canvas" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          {activeCenter && [1, 2].slice(0, Number(depth)).map((d) => {
            const r = Math.max(...nodes.filter((n) => arranged.dist?.get(n.key) === d).map((n) => Math.hypot(at(n.key).x / 1.25, at(n.key).y)), 0);
            return r ? <div key={d} className="board-ring" style={{ left: -r * 1.25, top: -r, width: r * 2.5, height: r * 2 }} /> : null;
          })}
          <svg className="board-lines" width="1" height="1">
            {edges.map((e) => {
              const a = at(e.a), b = at(e.b);
              const dx = (b.x - a.x) * 0.5;
              const on = !!sel && (e.a === sel || e.b === sel);
              const dim = near ? !on : far(e.a) || far(e.b);
              return (
                <g key={`${e.a}|${e.b}`} className={`bl ${on || edgeSel === e ? 'on' : ''} ${dim ? 'dim' : ''} ${e.kinds.includes('link') || e.kinds.includes('note') ? 'strong' : ''}`}
                  onPointerDown={(ev) => ev.stopPropagation()} onPointerUp={(ev) => { ev.stopPropagation(); setEdgeSel(e); setSel(null); }}>
                  <path d={`M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`} className="hit" />
                  <path d={`M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`} className="ln" />
                  <title>{e.labels.join('\n')}</title>
                </g>
              );
            })}
          </svg>
          {nodes.map((n) => {
            const p = at(n.key);
            const I = KIND_ICON[n.kind];
            return (
              <div key={n.key} className={`btile k-${n.kind} ${sel === n.key ? 'on' : ''} ${isDim(n.key) ? 'dim' : ''} ${n.team ? 'team' : ''} ${n.key === activeCenter ? 'center' : ''}`}
                style={{ left: p.x, top: p.y }} onPointerDown={(e) => down(e, n.key)} onDoubleClick={() => centerOn(n.key)}>
                {n.kind === 'person'
                  ? (n.photo ? <img src={n.photo} alt="" className="bphoto" draggable={false} /> : <Avatar name={n.label} size="sm" />)
                  : <span className="bic"><I size={15} /></span>}
                <span className="btxt">
                  <b>{n.label}</b>
                  <small>{n.kind === 'person' ? (n.sub || (n.team ? 'Zespół' : 'z zewnątrz')) : [KIND_NAME[n.kind], n.sub].filter(Boolean).join(' · ')}</small>
                </span>
              </div>
            );
          })}
        </div>
        <div className="board-tools" onPointerDown={(e) => e.stopPropagation()}>
          <button className="btn sm icon" onClick={() => zoom(1.25)} aria-label="Przybliż"><Plus size={14} /></button>
          <button className="btn sm icon" onClick={() => zoom(0.8)} aria-label="Oddal"><Minus size={14} /></button>
          <button className="btn sm icon" onClick={() => { setMoved(new Map()); setTimeout(fit); }} aria-label="Całość" title="Pokaż całość"><Maximize2 size={14} /></button>
        </div>
        <div className="board-legend">Kliknij kafelek, żeby zobaczyć powiązania · dwuklik = ustaw w centrum</div>
      </div>

      {(selected || edgeSel) && (
        <aside className="board-side card pad col" style={{ gap: 10 }}>
          {selected ? (
            <>
              <div className="row" style={{ gap: 10 }}>
                {selected.kind === 'person' ? <Avatar name={selected.label} size="sm" /> : <span className={`bic k-${selected.kind}`}>{(() => { const I = KIND_ICON[selected.kind]; return <I size={15} />; })()}</span>}
                <div className="grow col" style={{ gap: 0, minWidth: 0 }}><b className="trunc">{selected.label}</b>{selected.sub && <span className="small soft trunc">{selected.sub}</span>}</div>
                <button className="btn sm ghost icon" onClick={() => setSel(null)} aria-label="Zamknij"><X size={14} /></button>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn sm primary grow" onClick={() => centerOn(selected.key)}><Crosshair size={14} /> Ustaw w centrum</button>
                {href(selected) && <Link className="btn sm" to={href(selected)}><FolderOpen size={14} /> {selected.kind === 'person' ? 'Teczka' : 'Otwórz'}</Link>}
              </div>
              <div className="eyebrow">Powiązania · {selEdges.length}</div>
              <div className="col" style={{ gap: 6 }}>
                {selEdges.map((e) => {
                  const other = byKey.get(e.a === sel ? e.b : e.a)!;
                  return (
                    <button key={other.key} className="board-link" onClick={() => setSel(other.key)}>
                      <b>{other.label}</b>
                      {e.labels.slice(0, 3).map((l) => <span key={l} className="small soft">{l}</span>)}
                    </button>
                  );
                })}
              </div>
            </>
          ) : edgeSel && (
            <>
              <b>{byKey.get(edgeSel.a)?.label} ↔ {byKey.get(edgeSel.b)?.label}</b>
              <div className="eyebrow">Co ich łączy</div>
              {edgeSel.labels.map((l) => <div key={l} className="small">• {l}</div>)}
            </>
          )}
        </aside>
      )}
    </div>
  );
}
