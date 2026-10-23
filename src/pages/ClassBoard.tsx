/**
 * Tablica klas: the year's classes from the youngest to the oldest, drawn like a whiteboard — blue who attends,
 * green who joins, yellow who might (open leads). The exports are read here in the browser; only the anonymous
 * board (class, birth year, gender, stage) is kept — no names, e-mails or phones leave this page.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Download, FileSpreadsheet, Save, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import { ErrorBox, Seg, useAction, useToast } from '../components/ui';
import { buildBoard, count, kindOfExport, stageLabel, type BoardEntry, type ClassBoardData } from '../../shared/classboard';

const INK = { title: '#1f2937', current: '#1d4ed8', leaving: '#1d4ed8', joining: '#15803d', potential: '#c99a00', soft: '#6b7280', line: '#d1d5db' };
const FONT = "'Caveat', 'Comic Sans MS', cursive";
const COL = 168, PAD = 28, LINE = 22;
const YEARS = ['2627', '2728'] as const;
const yearLabel = (y: string) => `20${y.slice(0, 2)}/${y.slice(2)}`;
const mmYY = (d?: string) => (d ? `${d.slice(5, 7)}.${d.slice(0, 4)}` : '');

function entryText(e: BoardEntry, year: string): string {
  const g = e.gender === 'F' ? '♀' : e.gender === 'M' ? '♂' : '•';
  if (e.kind === 'current') return `${g} ur. ${mmYY(e.born)}`;
  if (e.kind === 'leaving') return `${g} ${mmYY(e.born)} odchodzi`;
  if (e.kind === 'joining') return `${g} ${mmYY(e.born)} → od ${e.start ? `${e.start.slice(5, 7)}.${e.start.slice(2, 4)}` : "?"}`;
  return `? ${stageLabel(e.stage) || 'lead'}${e.year && e.year !== year ? ` ${yearLabel(e.year).slice(2)}` : ''}`;
}

/** Draws the whiteboard on a canvas — the same picture goes to the screen, the PNG and the clipboard. */
function draw(canvas: HTMLCanvasElement, b: ClassBoardData, numbersOnly: boolean) {
  const cols = b.columns;
  const rows = numbersOnly ? 0 : Math.max(0, ...cols.map((c) => c.entries.length));
  const w = PAD * 2 + cols.length * COL;
  const h = 150 + 120 + rows * LINE + 70;
  const scale = 2;
  canvas.width = w * scale; canvas.height = h * scale;
  canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  const x = canvas.getContext('2d')!;
  x.scale(scale, scale);
  x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
  x.strokeStyle = '#9ca3af'; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6);
  const text = (t: string, px: number, py: number, size: number, color: string, opts: { bold?: boolean; align?: CanvasTextAlign; strike?: boolean; max?: number } = {}) => {
    x.font = `${opts.bold ? 700 : 500} ${size}px ${FONT}`; x.fillStyle = color; x.textAlign = opts.align || 'left';
    // never run into the next column
    while (opts.max && t.length > 3 && x.measureText(t).width > opts.max) t = `${t.slice(0, -2)}…`;
    x.fillText(t, px, py);
    if (opts.strike) { const m = x.measureText(t).width; x.fillRect(opts.align === 'center' ? px - m / 2 : px, py - size * 0.3, m, 1.5); }
  };
  text(`Klasy ${yearLabel(b.year)} — Maple Bear Katowice`, PAD, 52, 36, INK.title, { bold: true });
  // legend
  let lx = PAD;
  for (const [c, l] of [[INK.current, 'chodzą'], [INK.joining, 'dołączają'], [INK.potential, 'potencjalni (leady)']] as const) {
    x.fillStyle = c; x.beginPath(); x.arc(lx + 7, 86, 7, 0, Math.PI * 2); x.fill();
    text(l, lx + 20, 93, 22, c, { bold: true }); lx += 34 + x.measureText(l).width + 18;
  }
  text(`stan na ${b.madeOn.split('-').reverse().join('.')} · od najmłodszych do najstarszych`, w - PAD, 93, 18, INK.soft, { align: 'right' });

  const top = 130;
  cols.forEach((c, i) => {
    const cx = PAD + i * COL;
    if (i) { x.fillStyle = INK.line; x.fillRect(cx, top, 1.5, h - top - 70); }
    const mid = cx + COL / 2;
    text(c.label, mid, top + 32, 28, INK.title, { bold: true, align: 'center', max: COL - 12 });
    if (c.cohort) text(c.cohort, mid, top + 56, 18, INK.soft, { align: 'center' });
    const cur = count(c, 'current') + count(c, 'leaving'), join = count(c, 'joining'), pot = count(c, 'potential');
    // „13  +2  ?11” centred as one group
    const parts: [string, string, number][] = [[String(cur), INK.current, 36], [`+${join}`, INK.joining, 28], [`?${pot}`, INK.potential, 28]];
    const widths = parts.map(([t, , sz]) => { x.font = `700 ${sz}px ${FONT}`; return x.measureText(t).width; });
    let px = mid - (widths.reduce((a, b) => a + b, 0) + 2 * 12) / 2;
    parts.forEach(([t, col, sz], k) => { text(t, px, top + 100, sz, col, { bold: true }); px += widths[k] + 12; });
    if (!numbersOnly) c.entries.forEach((e, k) => text(entryText(e, b.year), cx + 10, top + 140 + k * LINE, 18, INK[e.kind], { strike: e.kind === 'leaving', max: COL - 16 }));
  });
  const tot = (k: 'current' | 'leaving' | 'joining' | 'potential') => cols.reduce((a, c) => a + count(c, k), 0);
  const leaving = tot('leaving');
  text(`Razem: ${tot('current') + leaving} chodzi${leaving ? ` (w tym ${leaving} odchodzi)` : ''}`, PAD, h - 28, 26, INK.current, { bold: true });
  x.font = `700 26px ${FONT}`;
  const off = PAD + x.measureText(`Razem: ${tot('current') + leaving} chodzi${leaving ? ` (w tym ${leaving} odchodzi)` : ''}`).width;
  text(` · +${tot('joining')} dołącza`, off, h - 28, 26, INK.joining, { bold: true });
  x.font = `700 26px ${FONT}`;
  text(` · ${tot('potential')} potencjalnych`, off + x.measureText(` · +${tot('joining')} dołącza`).width, h - 28, 26, INK.potential, { bold: true });
}

async function readExport(f: File) {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await f.arrayBuffer());
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: null });
  return { kind: kindOfExport(Object.keys(rows[0] || {})), rows };
}

export function ClassBoardPage() {
  const toast = useToast();
  const [year, setYear] = useState<string>('2627');
  const saved = useQuery({ queryKey: ['classboard', year], queryFn: () => api.classBoard(year) });
  const [files, setFiles] = useState<{ students?: Record<string, unknown>[]; leads?: Record<string, unknown>[]; names: string[] }>({ names: [] });
  const [err, setErr] = useState('');
  const [numbersOnly, setNumbersOnly] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const fresh = useMemo(() => (files.students ? buildBoard(files.students, files.leads || [], year) : null), [files, year]);
  const board = fresh || saved.data || null;
  const save = useAction((b: ClassBoardData) => api.saveClassBoard(b), { ok: 'Zapisano tablicę (bez danych osobowych)' });

  useEffect(() => {
    if (!board || !canvas.current) return;
    const go = () => draw(canvas.current!, board, numbersOnly);
    go();
    // the marker font may arrive a moment later
    document.fonts?.load(`700 28px ${FONT}`).then(go).catch(() => undefined);
  }, [board, numbersOnly]);

  const onFiles = async (list: FileList | null) => {
    setErr('');
    if (!list?.length) return;
    const next = { ...files, names: [...files.names] };
    for (const f of Array.from(list)) {
      try {
        const r = await readExport(f);
        if (!r.kind) { setErr(`„${f.name}” nie wygląda na eksport uczniów ani leadów.`); continue; }
        next[r.kind] = r.rows;
        next.names = [...next.names.filter((n) => !n.startsWith(r.kind === 'students' ? 'Uczniowie' : 'Leady')), `${r.kind === 'students' ? 'Uczniowie' : 'Leady'}: ${f.name} (${r.rows.length})`];
      } catch (e) { setErr(`Nie mogę odczytać „${f.name}”: ${(e as Error).message}`); }
    }
    setFiles(next);
  };

  const png = () => new Promise<Blob>((res, rej) => canvas.current!.toBlob((b) => (b ? res(b) : rej(new Error('Nie udało się zrobić obrazka'))), 'image/png'));
  const download = async () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await png());
    a.download = `klasy-${year}.png`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const copy = async () => {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': png() })]); toast('Skopiowano obrazek — wklej do maila (Ctrl+V)'); }
    catch { toast('Przeglądarka nie pozwala skopiować obrazka — użyj „Pobierz PNG”.', 'error'); }
  };

  return (
    <>
      <div className="page-head">
        <div><h1>Tablica klas</h1><div className="sub">Klasy od najmłodszych do najstarszych: kto chodzi, kto dołącza, kto może dołączyć. Do raportu.</div></div>
      </div>
      <section className="card pad col" style={{ gap: 12, marginBottom: 16 }}>
        <div className="row wrap" style={{ gap: 10 }}>
          <Seg value={year} onChange={setYear} options={YEARS} labels={{ 2627: 'Rok 2026/27', 2728: 'Rok 2027/28' }} />
          <label className="btn primary" style={{ cursor: 'pointer' }}>
            <FileSpreadsheet size={16} /> Wgraj eksporty (uczniowie + leady)
            <input type="file" accept=".xlsx,.xls,.csv" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
          </label>
          <span className="grow" />
          <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={numbersOnly} onChange={(e) => setNumbersOnly(e.target.checked)} /> Tylko liczby</label>
          <button className="btn" disabled={!board} onClick={copy}><Copy size={15} /> Kopiuj obraz</button>
          <button className="btn" disabled={!board} onClick={download}><Download size={15} /> Pobierz PNG</button>
          {fresh && <button className="btn primary" onClick={() => save.mutate(fresh)}><Save size={15} /> Zapisz w Opal5</button>}
        </div>
        <div className="row small soft" style={{ gap: 8, alignItems: 'flex-start' }}>
          <ShieldCheck size={16} style={{ flex: 'none', color: 'var(--ok)' }} />
          <span>Pliki czytam tylko w tej przeglądarce — nic z nich nie wysyłam. Na tablicy (i w zapisie) zostaje tylko klasa, rok i miesiąc urodzenia, płeć i etap leada: bez imion, maili i telefonów. Możesz wgrywać eksporty prosto z systemu, bez czyszczenia.</span>
        </div>
        {files.names.length > 0 && <div className="small">{files.names.join(' · ')}{!files.leads && ' · (dorzuć eksport leadów, żeby zobaczyć potencjalnych)'}</div>}
        {err && <div className="error-box small">{err}</div>}
        {!fresh && saved.data && <div className="small soft">Pokazuję tablicę zapisaną {saved.data.madeOn.split('-').reverse().join('.')}. Wgraj nowe eksporty, żeby ją odświeżyć.</div>}
        {saved.error && <ErrorBox error={saved.error} />}
      </section>
      {board ? (
        <section className="card" style={{ overflowX: 'auto', padding: 12 }}><canvas ref={canvas} /></section>
      ) : (
        <section className="card pad soft">Wgraj dwa pliki z systemu szkoły: <b>students_export</b> (uczniowie) i <b>leads_export</b> (leady). Kolejność nie ma znaczenia.</section>
      )}
    </>
  );
}
