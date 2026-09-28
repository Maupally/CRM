import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.ts';
import { ErrorBox, Loading, copyText, useToast, useToday } from '../components/ui.tsx';
import { addDays, startOfWeek } from '../../shared/domain.ts';

export function ReportPage() {
  const today = useToday();
  const toast = useToast();
  const [from, setFrom] = useState(() => addDays(today, -6));
  const [to, setTo] = useState(today);
  const q = useQuery({ queryKey: ['report', from, to], queryFn: () => api.report(from, to), enabled: !!from && !!to });

  const presets: [string, string, string][] = [
    ['Last 7 days', addDays(today, -6), today],
    ['This week', startOfWeek(today), today],
    ['Last week', addDays(startOfWeek(today), -7), addDays(startOfWeek(today), -1)],
    ['Last 30 days', addDays(today, -29), today],
  ];

  return (
    <>
      <div className="page-head">
        <h1>Weekly report</h1>
        <span className="spacer" />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
        <span className="muted">to</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
      </div>
      <div className="chips" style={{ marginBottom: 12 }}>
        {presets.map(([l, a, b]) => (
          <button key={l} className={`chip ${from === a && to === b ? 'on' : ''}`} onClick={() => { setFrom(a); setTo(b); }}>{l}</button>
        ))}
      </div>
      <section className="card">
        <div className="card-head">
          <h2>Plain text — paste into an email</h2>
          <button className="btn primary sm" disabled={!q.data} onClick={() => { copyText(q.data!.text); toast('Report copied'); }}>Copy</button>
          <a className="btn sm" href={q.data ? `mailto:?subject=${encodeURIComponent('B2B weekly report')}&body=${encodeURIComponent(q.data.text)}` : undefined}>Email…</a>
        </div>
        {q.isLoading ? <Loading /> : q.error ? <div className="card-pad"><ErrorBox error={q.error} /></div> : <pre className="report">{q.data!.text}</pre>}
      </section>
    </>
  );
}
