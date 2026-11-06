import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, startOfWeek } from '../../shared/domain';

export type CalKind = 'planned' | 'late' | 'done' | 'noans' | 'event' | 'task';
export interface CalItem { date: string; kind: CalKind; label: string; href?: string }

const MONTHS = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const DAYS = ['pn', 'wt', 'śr', 'cz', 'pt', 'sb', 'nd'];

export const monthOf = (day: string) => day.slice(0, 7) + '-01';
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}
/** First and last day shown in the 6-row grid of a month. */
export function monthRange(month: string): [string, string] {
  const first = startOfWeek(month);
  return [first, addDays(first, 41)];
}

/**
 * Month grid. Small: dots per day, for a single company. Large: labels per day, for the calendar page.
 */
export function MonthCalendar({ month, onMonth, items, today, selected, onDay, size = 'sm', renderItem }: {
  month: string; onMonth: (m: string) => void; items: CalItem[]; today: string;
  selected?: string; onDay?: (d: string) => void; size?: 'sm' | 'lg';
  renderItem?: (it: CalItem, i: number) => React.ReactNode;
}) {
  const [first] = monthRange(month);
  const weeks = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(first, w * 7 + d)));
  const lastRowEmpty = weeks[5].every((d) => d.slice(0, 7) !== month.slice(0, 7));
  const byDay = new Map<string, CalItem[]>();
  for (const it of items) {
    if (!byDay.has(it.date)) byDay.set(it.date, []);
    byDay.get(it.date)!.push(it);
  }
  const [y, m] = month.split('-').map(Number);

  return (
    <div className={`mcal ${size}`}>
      <div className="mcal-head">
        <button className="btn ghost sm icon" onClick={() => onMonth(shiftMonth(month, -1))} aria-label="Poprzedni miesiąc"><ChevronLeft size={16} /></button>
        <b>{MONTHS[m - 1]} {y}</b>
        <button className="btn ghost sm icon" onClick={() => onMonth(shiftMonth(month, 1))} aria-label="Następny miesiąc"><ChevronRight size={16} /></button>
      </div>
      <div className="mcal-grid">
        {DAYS.map((d) => <div key={d} className="mcal-dow">{d}</div>)}
        {(lastRowEmpty ? weeks.slice(0, 5) : weeks).flat().map((d) => {
          const its = byDay.get(d) || [];
          const out = d.slice(0, 7) !== month.slice(0, 7);
          return (
            <div key={d} role={onDay ? 'button' : undefined} tabIndex={onDay ? 0 : undefined}
              className={`mcal-day ${out ? 'out' : ''} ${d === today ? 'today' : ''} ${d === selected ? 'sel' : ''} ${onDay ? 'click' : ''}`}
              onClick={() => onDay?.(d)} onKeyDown={(e) => { if (e.key === 'Enter') onDay?.(d); }}>
              <span className="n">{Number(d.slice(8))}</span>
              {size === 'sm' ? (
                <span className="dots">{its.slice(0, 3).map((it, i) => <i key={i} className={it.kind} />)}</span>
              ) : (
                <div className="labels">
                  {its.slice(0, 3).map((it, i) => renderItem ? renderItem(it, i) : <span key={i} className={`ev ${it.kind}`}><span className="t">{it.label}</span></span>)}
                  {its.length > 3 && <span className="more">+{its.length - 3}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
