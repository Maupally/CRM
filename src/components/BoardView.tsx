import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { Minus, Plus, Maximize2, MapPin, CalendarDays, Building2, FolderOpen } from 'lucide-react';
import type { Board, BoardEdge, BoardNode } from '../../shared/domain';

type P = { x: number; y: number };
const SIZE: Record<BoardNode['kind'], [number, number]> = { person: [84, 104], event: [130, 62], company: [124, 50], place: [110, 40] };

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
        const f = 26000 / d2;
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
      const f = (d - 170) * 0.04;
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

const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
const wrap = (s: string, n: number, lines = 2) => {
  const words = s.split(/\s+/); const out: string[] = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > n) { if (cur) out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) out.push(cur);
  if (out.length > lines) { out.length = lines; out[lines - 1] = out[lines - 1].slice(0, n - 1) + '…'; }
  return out;
};
const href = (n: BoardNode) => (n.kind === 'person' ? `/zespol/${n.id}` : n.kind === 'event' ? `/wydarzenia/${n.id}` : n.kind === 'company' ? `/firmy/${n.id}` : '');

/**
 * The detective wall: people as pinned photos, events and companies as cards, places as map pins, and red
 * threads between whatever is connected. Drag to move around, scroll or +/− to zoom, click to follow the threads.
 */
export function BoardView({ board, focus, height = 640 }: { board: Board; focus?: string; height?: number }) {
  const { nodes, edges } = useMemo(() => {
    if (!focus) return board;
    const near = new Set([focus]);
    for (const e of board.edges) { if (e.a === focus) near.add(e.b); if (e.b === focus) near.add(e.a); }
    return { nodes: board.nodes.filter((n) => near.has(n.key)), edges: board.edges.filter((e) => near.has(e.a) && near.has(e.b)) };
  }, [board, focus]);
  const pos = useMemo(() => layout(nodes, edges), [nodes, edges]);
  const [moved, setMoved] = useState<Map<string, P>>(new Map());
  const at = (k: string) => moved.get(k) || pos.get(k) || { x: 0, y: 0 };
  const [sel, setSel] = useState<string | null>(focus || null);
  const [edgeSel, setEdgeSel] = useState<BoardEdge | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ kind: 'pan' | 'node'; key?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  // fit everything in view when the board changes
  const fit = () => {
    const el = box.current; if (!el || !nodes.length) return;
    const xs = nodes.map((n) => at(n.key).x), ys = nodes.map((n) => at(n.key).y);
    const w = Math.max(...xs) - Math.min(...xs) + 220, h = Math.max(...ys) - Math.min(...ys) + 220;
    const k = Math.min(1.4, Math.max(0.25, Math.min(el.clientWidth / w, el.clientHeight / h)));
    setView({ k, x: el.clientWidth / 2 - ((Math.max(...xs) + Math.min(...xs)) / 2) * k, y: el.clientHeight / 2 - ((Math.max(...ys) + Math.min(...ys)) / 2) * k });
  };
  useEffect(() => { setMoved(new Map()); setSel(focus || null); setEdgeSel(null); }, [nodes, focus]);
  useEffect(() => { fit(); }, [pos]); // eslint-disable-line react-hooks/exhaustive-deps

  const near = useMemo(() => {
    if (!sel) return null;
    const s = new Set([sel]);
    for (const e of edges) { if (e.a === sel) s.add(e.b); if (e.b === sel) s.add(e.a); }
    return s;
  }, [sel, edges]);

  const zoom = (f: number, cx?: number, cy?: number) => setView((v) => {
    const el = box.current!; const px = cx ?? el.clientWidth / 2, py = cy ?? el.clientHeight / 2;
    const k = Math.min(2.5, Math.max(0.2, v.k * f));
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
    (e.target as Element).setPointerCapture?.(e.pointerId);
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
    if (d && !d.moved) { if (d.kind === 'node') { setSel(d.key === sel ? null : d.key!); setEdgeSel(null); } else { setSel(focus || null); setEdgeSel(null); } }
  };

  const selected = sel ? nodes.find((n) => n.key === sel) : null;
  const selEdges = sel ? edges.filter((e) => e.a === sel || e.b === sel) : [];
  const byKey = new Map(nodes.map((n) => [n.key, n]));

  if (!nodes.length) return <div className="empty">Na tablicy jeszcze nic nie ma. Claude dopina tu ludzi, wydarzenia i miejsca z notatek.</div>;

  return (
    <div className="board-wrap">
      <div className="board" ref={box} style={{ height }} onPointerDown={(e) => down(e)} onPointerMove={move} onPointerUp={up}>
        <svg width="100%" height="100%">
          <defs>
            <filter id="bshadow" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity=".35" /></filter>
            <clipPath id="photoclip"><rect x={-34} y={-44} width={68} height={62} /></clipPath>
          </defs>
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {edges.map((e) => {
              const a = at(e.a), b = at(e.b);
              const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + Math.min(40, Math.hypot(b.x - a.x, b.y - a.y) * 0.12);
              const dim = near && !(near.has(e.a) && near.has(e.b) && (e.a === sel || e.b === sel));
              const hot = edgeSel === e;
              return (
                <g key={`${e.a}|${e.b}`} className="thread" opacity={dim ? 0.12 : 1}
                  onPointerDown={(ev) => { ev.stopPropagation(); }} onPointerUp={(ev) => { ev.stopPropagation(); setEdgeSel(e); setSel(null); }}>
                  <path d={`M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`} className="hit" />
                  <path d={`M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`} className={`line ${e.kinds.includes('link') || e.kinds.includes('note') ? 'strong' : ''} ${hot ? 'hot' : ''}`}
                    strokeWidth={Math.min(5, 1.4 + e.labels.length * 0.6)} />
                  <title>{e.labels.join('\n')}</title>
                </g>
              );
            })}
            {nodes.map((n) => {
              const p = at(n.key);
              const dim = near && !near.has(n.key);
              const [w, h] = SIZE[n.kind];
              const tilt = ((n.key.charCodeAt(n.key.length - 1) % 7) - 3) * 0.9;
              return (
                <g key={n.key} transform={`translate(${p.x},${p.y}) rotate(${tilt})`} opacity={dim ? 0.25 : 1}
                  className={`bnode k-${n.kind} ${sel === n.key ? 'on' : ''}`} onPointerDown={(e) => down(e, n.key)}>
                  {n.kind === 'person' ? (
                    <>
                      <rect x={-w / 2} y={-h / 2} width={w} height={h} className="card-bg" filter="url(#bshadow)" />
                      {n.photo ? <image href={n.photo} x={-34} y={-44} width={68} height={62} preserveAspectRatio="xMidYMid slice" clipPath="url(#photoclip)" />
                        : <><rect x={-34} y={-44} width={68} height={62} className={`photo ${n.team ? 'team' : ''}`} /><text y={-6} className="ini">{initials(n.label)}</text></>}
                      {wrap(n.label, 13, 2).map((l, i) => <text key={i} y={30 + i * 11} className="name">{l}</text>)}
                    </>
                  ) : n.kind === 'place' ? (
                    <>
                      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={4} className="card-bg" filter="url(#bshadow)" />
                      {wrap(`📍 ${n.label}`, 18, 2).map((l, i, all) => <text key={i} y={4 + (i - (all.length - 1) / 2) * 12} className="name">{l}</text>)}
                    </>
                  ) : (
                    <>
                      <rect x={-w / 2} y={-h / 2} width={w} height={h} className="card-bg" filter="url(#bshadow)" />
                      {wrap(n.label, n.kind === 'event' ? 22 : 20, n.kind === 'event' ? 3 : 2).map((l, i) => <text key={i} y={-h / 2 + 18 + i * 12} className="name">{l}</text>)}
                      {n.sub && <text y={h / 2 - 7} className="sub">{n.sub}</text>}
                    </>
                  )}
                  <circle cy={-h / 2 + 4} r={5} className="pin" />
                </g>
              );
            })}
          </g>
        </svg>
        <div className="board-tools" onPointerDown={(e) => e.stopPropagation()}>
          <button className="btn sm icon" onClick={() => zoom(1.25)} aria-label="Przybliż"><Plus size={14} /></button>
          <button className="btn sm icon" onClick={() => zoom(0.8)} aria-label="Oddal"><Minus size={14} /></button>
          <button className="btn sm icon" onClick={() => { setMoved(new Map()); setTimeout(fit); }} aria-label="Całość"><Maximize2 size={14} /></button>
        </div>
      </div>

      {(selected || edgeSel) && (
        <aside className="board-side card pad col" style={{ gap: 10 }}>
          {selected ? (
            <>
              <div className="row" style={{ gap: 8 }}>
                {selected.kind === 'event' ? <CalendarDays size={16} /> : selected.kind === 'company' ? <Building2 size={16} /> : selected.kind === 'place' ? <MapPin size={16} /> : null}
                <b className="grow">{selected.label}</b>
              </div>
              {selected.sub && <div className="small soft">{selected.sub}</div>}
              {href(selected) && <Link className="btn sm" to={href(selected)}><FolderOpen size={14} /> {selected.kind === 'person' ? 'Otwórz teczkę' : 'Otwórz'}</Link>}
              <div className="eyebrow">Nitki · {selEdges.length}</div>
              <div className="col" style={{ gap: 8, overflow: 'auto', maxHeight: height - 160 }}>
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
