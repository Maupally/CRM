import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { Minus, Plus, Maximize2, MapPin, CalendarDays, Building2, FolderOpen, type LucideIcon } from 'lucide-react';
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

const KIND_ICON: Record<BoardNode['kind'], LucideIcon> = { person: FolderOpen, event: CalendarDays, company: Building2, place: MapPin };
const KIND_NAME: Record<BoardNode['kind'], string> = { person: 'Osoba', event: 'Wydarzenie', company: 'Firma', place: 'Miejsce' };
const href = (n: BoardNode) => (n.kind === 'person' ? `/zespol/${n.id}` : n.kind === 'event' ? `/wydarzenia/${n.id}` : n.kind === 'company' ? `/firmy/${n.id}` : '');

/**
 * The connections board: people, events, companies and places as tiles, lines between whatever is connected.
 * Drag to move around, scroll or +/− to zoom, click a tile to see what ties it to the rest.
 * `pick` selects and centres a tile from outside (the search next to the board).
 */
export function BoardView({ board, focus, height = 640, pick }: { board: Board; focus?: string; height?: number; pick?: { key: string; n: number } }) {
  const { nodes, edges } = useMemo(() => {
    if (!focus) return board;
    const near = new Set([focus]);
    for (const e of board.edges) { if (e.a === focus) near.add(e.b); if (e.b === focus) near.add(e.a); }
    return { nodes: board.nodes.filter((n) => near.has(n.key)), edges: board.edges.filter((e) => near.has(e.a) && near.has(e.b)) };
  }, [board, focus]);
  // the layout is the slow part: keep it for as long as the same tiles and lines are on the board (refetches, revisits)
  const sig = useMemo(() => `${nodes.map((n) => n.key).join(',')}#${edges.map((e) => `${e.a}|${e.b}`).join(',')}`, [nodes, edges]);
  const pos = useMemo(() => {
    const hit = LAYOUTS.get(sig);
    if (hit) return hit;
    const p = layout(nodes, edges);
    if (LAYOUTS.size > 20) LAYOUTS.clear();
    LAYOUTS.set(sig, p);
    return p;
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const [moved, setMoved] = useState<Map<string, P>>(new Map());
  const at = (k: string) => moved.get(k) || pos.get(k) || { x: 0, y: 0 };
  const [sel, setSel] = useState<string | null>(null);
  const [edgeSel, setEdgeSel] = useState<BoardEdge | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: 'pan' | 'node'; key?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  const fit = () => {
    const el = box.current; if (!el || !nodes.length) return;
    const xs = nodes.map((n) => at(n.key).x), ys = nodes.map((n) => at(n.key).y);
    const w = Math.max(...xs) - Math.min(...xs) + 260, h = Math.max(...ys) - Math.min(...ys) + 160;
    const k = Math.min(1.2, Math.max(0.3, Math.min(el.clientWidth / w, el.clientHeight / h)));
    setView({ k, x: el.clientWidth / 2 - ((Math.max(...xs) + Math.min(...xs)) / 2) * k, y: el.clientHeight / 2 - ((Math.max(...ys) + Math.min(...ys)) / 2) * k });
  };
  useEffect(() => { setMoved(new Map()); setSel(null); setEdgeSel(null); }, [sig, focus]);
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

  const zoom = (f: number, cx?: number, cy?: number) => setView((v) => {
    const el = box.current!; const px = cx ?? el.clientWidth / 2, py = cy ?? el.clientHeight / 2;
    const k = Math.min(2.2, Math.max(0.2, v.k * f));
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

  const selected = sel ? nodes.find((n) => n.key === sel) : null;
  const selEdges = sel ? edges.filter((e) => e.a === sel || e.b === sel) : [];
  const byKey = new Map(nodes.map((n) => [n.key, n]));

  if (!nodes.length) return <div className="empty">Jeszcze nic nie jest powiązane. Claude dopina tu ludzi, wydarzenia i miejsca z notatek.</div>;

  return (
    <div className="board-wrap">
      <div className="board" ref={box} style={{ height }} onPointerDown={(e) => down(e)} onPointerMove={move} onPointerUp={up}>
        <div className="board-canvas" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          <svg className="board-lines" width="1" height="1">
            {edges.map((e) => {
              const a = at(e.a), b = at(e.b);
              const dx = (b.x - a.x) * 0.5;
              const on = !!sel && (e.a === sel || e.b === sel);
              const dim = !!near && !on;
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
            const dim = near && !near.has(n.key);
            return (
              <div key={n.key} className={`btile k-${n.kind} ${sel === n.key ? 'on' : ''} ${dim ? 'dim' : ''} ${n.team ? 'team' : ''}`}
                style={{ left: p.x, top: p.y }} onPointerDown={(e) => down(e, n.key)}>
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
          <button className="btn sm icon" onClick={() => { setMoved(new Map()); setTimeout(fit); }} aria-label="Całość"><Maximize2 size={14} /></button>
        </div>
        <div className="board-legend">
          <span><i className="k-person" />Zespół</span><span><i className="k-ext" />Z zewnątrz</span><span><i className="k-event" />Wydarzenia</span>
          <span><i className="k-company" />Firmy</span><span><i className="k-place" />Miejsca</span>
        </div>
      </div>

      {(selected || edgeSel) && (
        <aside className="board-side card pad col" style={{ gap: 10 }}>
          {selected ? (
            <>
              <div className="row" style={{ gap: 10 }}>
                {selected.kind === 'person' ? <Avatar name={selected.label} size="sm" /> : <span className={`bic k-${selected.kind}`}>{(() => { const I = KIND_ICON[selected.kind]; return <I size={15} />; })()}</span>}
                <div className="grow col" style={{ gap: 0, minWidth: 0 }}><b className="trunc">{selected.label}</b>{selected.sub && <span className="small soft trunc">{selected.sub}</span>}</div>
              </div>
              {href(selected) && <Link className="btn sm primary" to={href(selected)}><FolderOpen size={14} /> {selected.kind === 'person' ? 'Otwórz teczkę' : 'Otwórz'}</Link>}
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
