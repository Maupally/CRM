/**
 * Tablica klas: the year's classes from the youngest to the oldest — blue who attends, green who joins, amber who
 * might (open leads, with their enrolment chance). The exports are read here in the browser; only the anonymous
 * board (class, birth year, gender, stage) is kept — no names, e-mails or phones leave this page.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Download, FileSpreadsheet, Save, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import { ErrorBox, Seg, useAction, useToast } from '../components/ui';
import { buildBoard, count, kindOfExport, sanitizeBoard, stageLabel, type BoardEntry, type ClassBoardData } from '../../shared/classboard';

type Ink = { bg: string; title: string; current: string; leaving: string; joining: string; potential: string; soft: string; faint: string; line: string };
const LIGHT: Ink = { bg: '#ffffff', title: '#111827', current: '#2563eb', leaving: '#2563eb', joining: '#15803d', potential: '#b45309', soft: '#6b7280', faint: '#9ca3af', line: '#e5e7eb' };
/** the Opal5 dark theme */
const DARK: Ink = { bg: '#12203F', title: '#EEF2FA', current: '#8DB0FF', leaving: '#8DB0FF', joining: '#6EE7B7', potential: '#FCD34D', soft: '#9AA8C4', faint: '#6D7C9C', line: 'rgba(238,242,250,0.12)' };
let INK: Ink = LIGHT;
const appDark = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
const FONT = "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif";
const PAD = 32, LINE = 20;
/** a lead opens in the school system */
const LEAD_URL = 'https://evvotek.com/lead/';
type Hit = { x: number; y: number; w: number; h: number; url: string };
let COL = 158;
const YEARS = ['2627', '2728'] as const;
const yearLabel = (y: string) => `20${y.slice(0, 2)}/${y.slice(2)}`;
const mmYY = (d?: string) => (d ? `${d.slice(5, 7)}.${d.slice(0, 4)}` : '–');
const LEGEND: [keyof Ink, string, string][] = [
  ['current', 'zapisani', 'chodzą w tym roku (faktura); przekreśleni odchodzą'],
  ['joining', 'dołączają', 'umowa podpisana, start później (data obok)'],
  ['potential', 'potencjalni', 'aktywne leady (bez future leadów), w nawiasie szansa zapisu'],
];

function entryText(e: BoardEntry, year: string, names: boolean): string {
  const who = names && e.name ? e.name : '';
  if (e.kind === 'current' || e.kind === 'leaving') return who || mmYY(e.born);
  if (e.kind === 'joining') return `${who || mmYY(e.born)} → ${e.start ? `${e.start.slice(5, 7)}.${e.start.slice(2, 4)}` : '?'}`;
  const later = e.year && e.year !== year ? ` ${yearLabel(e.year).slice(2)}` : '';
  return `${who || stageLabel(e.stage) || 'lead'}${later} (${e.chance ?? 0}%)`;
}

/** Draws the board on a canvas — the same picture goes to the screen, the PNG and the clipboard. */
function draw(canvas: HTMLCanvasElement, b: ClassBoardData, numbersOnly: boolean, dark: boolean, names: boolean): Hit[] {
  const hits: Hit[] = [];
  INK = dark ? DARK : LIGHT;
  COL = names ? 196 : 158;
  const cols = b.columns;
  const rows = numbersOnly ? 0 : Math.max(0, ...cols.map((c) => c.entries.length));
  const w = Math.max(PAD * 2 + cols.length * COL, 900);
  const top = 150;
  const listTop = top + 128;
  const h = listTop + rows * LINE + 64;
  const scale = 2;
  canvas.width = w * scale; canvas.height = h * scale;
  canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
  const x = canvas.getContext('2d')!;
  x.scale(scale, scale);
  x.fillStyle = INK.bg; x.fillRect(0, 0, w, h);
  const text = (t: string, px: number, py: number, size: number, color: string, opts: { weight?: number; align?: CanvasTextAlign; strike?: boolean; max?: number } = {}) => {
    x.font = `${opts.weight || 400} ${size}px ${FONT}`; x.fillStyle = color; x.textAlign = opts.align || 'left';
    while (opts.max && t.length > 3 && x.measureText(t).width > opts.max) t = `${t.slice(0, -2)}…`;
    x.fillText(t, px, py);
    if (opts.strike) { const m = x.measureText(t).width; x.fillRect(opts.align === 'center' ? px - m / 2 : px, py - size * 0.32, m, 1); }
    return x.measureText(t).width;
  };
  const tot = (k: 'current' | 'leaving' | 'joining' | 'potential') => cols.reduce((a, c) => a + count(c, k), 0);
  text(`Klasy ${yearLabel(b.year)}`, PAD, 46, 24, INK.title, { weight: 600 });
  text(`Maple Bear Katowice · stan na ${b.madeOn.split('-').reverse().join('.')} · od najmłodszych do najstarszych`, PAD, 70, 13, INK.soft);
  // legend
  LEGEND.forEach(([k, name, what], i) => {
    const c = INK[k];
    const ly = 98 + i * 18;
    x.fillStyle = c; x.fillRect(PAD, ly - 9, 8, 8);
    const nw = text(name, PAD + 16, ly, 13, c, { weight: 600 });
    text(`— ${what}`, PAD + 20 + nw, ly, 13, INK.soft);
  });
  text(names ? 'zawiera imiona — tylko do użytku wewnętrznego' : 'mm.rrrr = miesiąc urodzenia · bez imion i danych kontaktowych', w - PAD, 98, 12, names ? INK.potential : INK.faint, { align: 'right' });
  const leaving = tot('leaving');
  text(`${tot('current') + leaving} zapisanych${leaving ? ` (${leaving} odchodzi)` : ''} · ${tot('joining')} dołącza · ${tot('potential')} potencjalnych`, w - PAD, 116, 13, INK.title, { align: 'right', weight: 600 });

  x.fillStyle = INK.line; x.fillRect(PAD, top - 8, w - PAD * 2, 1);
  cols.forEach((c, i) => {
    const cx = PAD + i * COL;
    if (i) { x.fillStyle = INK.line; x.fillRect(cx, top, 1, h - top - 48); }
    const lx = cx + 12;
    text(c.label, lx, top + 22, 16, INK.title, { weight: 600, max: COL - 20 });
    text(c.cohort, lx, top + 40, 12, INK.faint);
    const cur = count(c, 'current') + count(c, 'leaving'), join = count(c, 'joining'), pot = count(c, 'potential');
    text(`${cur} zapisanych`, lx, top + 64, 13, cur ? INK.current : INK.faint, { weight: 600 });
    text(`${join} dołącza`, lx, top + 81, 13, join ? INK.joining : INK.faint, { weight: 600 });
    text(`${pot} potencjalnych`, lx, top + 98, 13, pot ? INK.potential : INK.faint, { weight: 600 });
    if (!numbersOnly) {
      x.fillStyle = INK.line; x.fillRect(lx, listTop - 12, COL - 24, 1);
      c.entries.forEach((e, k) => {
        const y = listTop + 6 + k * LINE;
        const tw = text(entryText(e, b.year, names), lx, y, 13, INK[e.kind], { strike: e.kind === 'leaving', max: COL - 20 });
        // leads are links to their card in the school system (on screen; the PNG is just a picture)
        if (names && e.leadId) {
          x.fillStyle = INK[e.kind]; x.globalAlpha = 0.35; x.fillRect(lx, y + 3, tw, 1); x.globalAlpha = 1;
          hits.push({ x: lx, y: y - 14, w: tw, h: LINE, url: LEAD_URL + encodeURIComponent(e.leadId) });
        }
      });
    }
  });
  text('Źródło: eksport uczniów i leadów z systemu szkoły · leady na kolejne lata w kolumnie dzisiejszego rocznika', PAD, h - 22, 11, INK.faint);
  return hits;
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
  const [dark, setDark] = useState(appDark);
  const [names, setNames] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hits = useRef<Hit[]>([]);
  const fresh = useMemo(() => (files.students ? buildBoard(files.students, files.leads || [], year) : null), [files, year]);
  const board = fresh || saved.data || null;
  // names exist only in a board built here from the exports; the saved one never has them
  const hasNames = !!fresh && fresh.columns.some((c) => c.entries.some((e) => e.name));
  const studentsNoNames = !!files.students && !files.students.some((r) => r.first_name || r.last_name);
  const save = useAction((b: ClassBoardData) => api.saveClassBoard(sanitizeBoard(b, b.year)), { ok: 'Zapisano tablicę (bez danych osobowych)' });

  useEffect(() => {
    if (!board || !canvas.current) return;
    const go = () => { hits.current = draw(canvas.current!, board, numbersOnly, dark, names && hasNames); };
    go();
    // the font may arrive a moment later
    document.fonts?.load(`600 16px ${FONT}`).then(go).catch(() => undefined);
  }, [board, numbersOnly, dark, names, hasNames]);

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

  const hitAt = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    return hits.current.find((h) => px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h);
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
          <Seg value={dark ? 'dark' : 'light'} onChange={(v) => setDark(v === 'dark')} options={['light', 'dark'] as const} labels={{ light: 'Jasny', dark: 'Ciemny' }} />
          <label className="row small" style={{ gap: 6 }} title={hasNames ? '' : 'Imiona widać tylko po wgraniu eksportów w tej przeglądarce'}>
            <input type="checkbox" checked={names && hasNames} disabled={!hasNames} onChange={(e) => setNames(e.target.checked)} /> Imiona i nazwiska</label>
          <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={numbersOnly} onChange={(e) => setNumbersOnly(e.target.checked)} /> Tylko liczby</label>
          <button className="btn" disabled={!board} onClick={copy}><Copy size={15} /> Kopiuj obraz</button>
          <button className="btn" disabled={!board} onClick={download}><Download size={15} /> Pobierz PNG</button>
          {fresh && <button className="btn primary" onClick={() => save.mutate(fresh)}><Save size={15} /> Zapisz w Opal5</button>}
        </div>
        <div className="row small soft" style={{ gap: 8, alignItems: 'flex-start' }}>
          <ShieldCheck size={16} style={{ flex: 'none', color: 'var(--ok)' }} />
          <span>Pliki czytam tylko w tej przeglądarce — nic z nich nie wysyłam. Imiona widzisz tylko tutaj; „Zapisz w Opal5” zapisuje wersję bez imion, maili i telefonów (klasa, miesiąc urodzenia, etap i szansa leada). Możesz wgrywać eksporty prosto z systemu, bez czyszczenia.</span>
        </div>
        {files.names.length > 0 && <div className="small">{files.names.join(' · ')}{!files.leads && ' · (dorzuć eksport leadów, żeby zobaczyć potencjalnych)'}</div>}
        {names && hasNames && <div className="small" style={{ color: 'var(--warn)' }}>Imiona widać tylko tutaj — nie zapisuję ich w Opal5. Zanim wyślesz obrazek do raportu, odznacz „Imiona i nazwiska”.</div>}
        {studentsNoNames && <div className="small soft">Eksport uczniów ma puste kolumny first_name / last_name — wyeksportuj go z systemu z imionami, żeby zobaczyć dzieci po imieniu.</div>}
        {err && <div className="error-box small">{err}</div>}
        {!fresh && saved.data && <div className="small soft">Pokazuję tablicę zapisaną {saved.data.madeOn.split('-').reverse().join('.')}. Wgraj nowe eksporty, żeby ją odświeżyć.</div>}
        {saved.error && <ErrorBox error={saved.error} />}
      </section>
      {board ? (
        <section className="card" style={{ overflowX: 'auto', padding: 12 }}><canvas ref={canvas}
          onMouseMove={(e) => { e.currentTarget.style.cursor = hitAt(e) ? 'pointer' : 'default'; }}
          onClick={(e) => { const h = hitAt(e); if (h) window.open(h.url, '_blank', 'noopener'); }} /></section>
      ) : (
        <section className="card pad soft">Wgraj dwa pliki z systemu szkoły: <b>students_export</b> (uczniowie) i <b>leads_export</b> (leady). Kolejność nie ma znaczenia.</section>
      )}
    </>
  );
}
