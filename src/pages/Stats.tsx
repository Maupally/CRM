import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, type Bucket } from '../api.ts';
import { ErrorBox, Loading, stageClass } from '../components/ui.tsx';
import { COUNTED, STAGES, shortDate } from '../../shared/domain.ts';

const TYPE_COLOR: Record<string, string> = {
  Call: 'var(--info)', Email: 'var(--violet)', SMS: 'var(--faint)', Meeting: 'var(--ok)', Visit: 'var(--warn)',
};
const STAGE_COLOR: Record<string, string> = {
  new: 'var(--faint)', contacting: 'var(--info)', 'scheduled visit': 'var(--violet)', negotiation: 'var(--warn)',
  active: 'var(--ok)', disqualified: 'var(--bad)',
};

export function StatsPage() {
  const q = useQuery({ queryKey: ['stats'], queryFn: api.stats });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const s = q.data!;
  const max = Math.max(1, ...s.daily.map((d) => Object.values(d.byType).reduce((a, b) => a + b, 0)));
  const maxStage = Math.max(1, ...Object.values(s.pipeline));

  return (
    <>
      <div className="page-head"><h1>Stats</h1></div>

      <div className="grid kpis" style={{ marginBottom: 16 }}>
        <BucketCard label="Today" b={s.activity.today} />
        <BucketCard label="Last 7 days" b={s.activity.week} />
        <BucketCard label="Last 30 days" b={s.activity.month} />
        <Link to="/leads?follow=overdue" className={`card kpi ${s.totals.overdue ? 'alert' : ''}`}>
          <div className="label">Overdue follow-ups</div><div className="value">{s.totals.overdue}</div>
          <div className="sub">open this list →</div>
        </Link>
        <Link to="/leads?stage=new&has=phone&sort=priority" className="card kpi">
          <div className="label">New, priority ≥ 5</div><div className="value">{s.totals.queue}</div>
          <div className="sub">{s.totals.noContact} leads with no contact data</div>
        </Link>
      </div>

      <div className="grid halves" style={{ marginBottom: 16 }}>
        <section className="card card-pad">
          <div className="row between"><h2>Outreach, last 30 days</h2>
            <div className="legend">{COUNTED.map((t) => <span key={t}><i style={{ background: TYPE_COLOR[t] }} />{t}</span>)}</div></div>
          <div className="bars">
            {s.daily.map((d) => {
              const total = Object.values(d.byType).reduce((a, b) => a + b, 0);
              return (
                <div key={d.date} className={`b ${d.date === s.today ? 'today' : ''}`}
                  title={`${shortDate(d.date)}: ${total}${total ? ' — ' + Object.entries(d.byType).map(([k, v]) => `${k} ${v}`).join(', ') : ''}`}>
                  {COUNTED.filter((t) => d.byType[t]).map((t) => (
                    <span key={t} style={{ height: `${(d.byType[t] / max) * 100}%`, background: TYPE_COLOR[t] }} />
                  ))}
                </div>
              );
            })}
          </div>
          <div className="bar-axis"><span>{shortDate(s.daily[0].date)}</span><span>today</span></div>
        </section>

        <section className="card card-pad">
          <h2 style={{ marginBottom: 14 }}>Pipeline</h2>
          <div className="funnel">
            {STAGES.map((st) => (
              <Link key={st} to={`/leads?stage=${encodeURIComponent(st)}`} className="f" style={{ textDecoration: 'none' }}>
                <span className={`pill ${stageClass(st)}`} style={{ justifySelf: 'start' }}>{st}</span>
                <div className="track"><div className="fill" style={{ width: `${(s.pipeline[st] / maxStage) * 100}%`, background: STAGE_COLOR[st] }} /></div>
                <b style={{ textAlign: 'right' }}>{s.pipeline[st]}</b>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-head"><h2>By segment</h2></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr>
              <th>Segment</th><th className="num">Total</th>
              {STAGES.map((st) => <th key={st} className="num">{st}</th>)}
              <th className="num">With phone</th>
            </tr></thead>
            <tbody>
              {s.segments.map((r) => (
                <tr key={r.name} onClick={() => { location.href = `/leads?segment=${encodeURIComponent(r.name)}`; }}>
                  <td className="company">{r.name}</td><td className="num">{r.total}</td>
                  {STAGES.map((st) => <td key={st} className={`num ${r[st] ? '' : 'faint'}`}>{r[st] || '·'}</td>)}
                  <td className="num">{r.withPhone}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr>
              <td>Total</td><td className="num">{s.totals.leads}</td>
              {STAGES.map((st) => <td key={st} className="num">{s.pipeline[st]}</td>)}
              <td className="num">{s.segments.reduce((a, r) => a + r.withPhone, 0)}</td>
            </tr></tfoot>
          </table>
        </div>
      </section>
    </>
  );
}

function BucketCard({ label, b }: { label: string; b: Bucket }) {
  return (
    <div className="card kpi">
      <div className="label">{label}</div>
      <div className="value">{b.total}</div>
      <div className="sub">{b.companies} companies · {b.reached} reached · {b.noAnswer} no answer</div>
      <div className="sub">{COUNTED.filter((t) => b.byType[t]).map((t) => `${t} ${b.byType[t]}`).join(' · ') || '—'}</div>
    </div>
  );
}
