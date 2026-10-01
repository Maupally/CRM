import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Activity, AlarmClock, PhoneCall, Target, Copy, Send, Sparkles, Loader2 } from 'lucide-react';
import { api, type Bucket } from '../api';
import { ErrorBox, Loading, STAGE_COLOR, Seg, StatTile, copyText, stageLabel, typeLabel, useConfig, useToast, useToday } from '../components/ui';
import { COUNTED, STAGES, addDays, shortDate, startOfWeek } from '../../shared/domain';

const TYPE_COLOR: Record<string, string> = {
  Call: 'var(--accent)', Email: 'var(--violet)', SMS: 'var(--warn)', Meeting: 'var(--ok)', Visit: '#1E9E8F',
};

export function ReportsPage() {
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') || 'przeglad') as 'przeglad' | 'tygodniowy';
  return (
    <>
      <div className="page-head">
        <div><h1>Raporty</h1><div className="sub">Aktywność, lejek i raport tygodniowy do wysłania.</div></div>
        <span className="spacer" />
        <Seg value={tab} options={['przeglad', 'tygodniowy'] as const} onChange={(t) => setSp(t === 'przeglad' ? {} : { tab: t }, { replace: true })}
          labels={{ przeglad: 'Przegląd', tygodniowy: 'Raport tygodniowy' }} />
      </div>
      {tab === 'przeglad' ? <Overview /> : <Weekly />}
    </>
  );
}

function Overview() {
  const q = useQuery({ queryKey: ['stats'], queryFn: api.stats });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const s = q.data!;
  const max = Math.max(1, ...s.daily.map((d) => Object.values(d.byType).reduce((a, b) => a + b, 0)));
  const maxStage = Math.max(1, ...Object.values(s.pipeline));
  const w = s.activity.week;
  const rate = w.reached + w.noAnswer ? Math.round((w.reached / (w.reached + w.noAnswer)) * 100) : 0;

  return (
    <div className="col loose" style={{ gap: 18 }}>
      <div className="grid kpis">
        <BucketTile label="Dziś" b={s.activity.today} />
        <BucketTile label="Ostatnie 7 dni" b={s.activity.week} />
        <BucketTile label="Ostatnie 30 dni" b={s.activity.month} />
        <StatTile label="Skuteczność (7 dni)" value={`${rate}%`} icon={Target} tone="green" hint={`${w.reached} odebranych · ${w.noAnswer} bez odpowiedzi`} />
        <StatTile label="Zaległe follow-upy" value={s.totals.overdue} icon={AlarmClock} tone={s.totals.overdue ? 'red' : ''} to="/firmy?widok=zalegle" />
        <StatTile label="Kolejka (prio ≥ 5)" value={s.totals.queue} icon={PhoneCall} to="/firmy?widok=kolejka" hint={`${s.totals.noContact} firm bez kontaktu`} />
      </div>

      <div className="grid halves">
        <section className="card pad">
          <div className="row between wrap" style={{ marginBottom: 18 }}><h2>Aktywność — 30 dni</h2>
            <div className="legend">{COUNTED.map((t) => <span key={t}><i style={{ background: TYPE_COLOR[t] }} />{typeLabel(t)}</span>)}</div></div>
          <div className="bars">
            {s.daily.map((d) => {
              const total = Object.values(d.byType).reduce((a, b) => a + b, 0);
              return (
                <div key={d.date} className={`b ${d.date === s.today ? 'today' : ''} ${total ? '' : 'empty'}`}
                  title={`${shortDate(d.date)}: ${total}${total ? ' — ' + Object.entries(d.byType).map(([k, v]) => `${typeLabel(k)} ${v}`).join(', ') : ''}`}>
                  {total ? COUNTED.filter((t) => d.byType[t]).map((t) => (
                    <span key={t} style={{ height: `${(d.byType[t] / max) * 100}%`, background: TYPE_COLOR[t] }} />
                  )) : <span />}
                </div>
              );
            })}
          </div>
          <div className="axis"><span>{shortDate(s.daily[0].date)}</span><span>dziś</span></div>
        </section>

        <section className="card pad">
          <h2 style={{ marginBottom: 18 }}>Lejek</h2>
          <div className="funnel">
            {STAGES.map((st) => (
              <Link key={st} to={`/firmy?etap=${encodeURIComponent(st)}`}>
                <span className="soft">{stageLabel(st)}</span>
                <div className="track"><div className="fill" style={{ width: `${(s.pipeline[st] / maxStage) * 100}%`, background: STAGE_COLOR[st] }} /></div>
                <b>{s.pipeline[st]}</b>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-head"><h2>Segmenty</h2></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr>
              <th>Segment</th><th className="num">Razem</th>
              {STAGES.map((st) => <th key={st} className="num">{stageLabel(st)}</th>)}
              <th className="num">Z telefonem</th>
            </tr></thead>
            <tbody>
              {s.segments.map((r) => (
                <tr key={r.name} onClick={() => { location.href = `/firmy?segment=${encodeURIComponent(r.name)}`; }}>
                  <td style={{ fontWeight: 600 }}>{r.name}</td><td className="num">{r.total}</td>
                  {STAGES.map((st) => <td key={st} className={`num ${r[st] ? '' : 'faint'}`}>{r[st] || '·'}</td>)}
                  <td className="num">{r.withPhone}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr>
              <td>Razem</td><td className="num">{s.totals.leads}</td>
              {STAGES.map((st) => <td key={st} className="num">{s.pipeline[st]}</td>)}
              <td className="num">{s.segments.reduce((a, r) => a + r.withPhone, 0)}</td>
            </tr></tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}

function BucketTile({ label, b }: { label: string; b: Bucket }) {
  return (
    <StatTile label={label} value={b.total} icon={Activity}
      hint={<>{b.companies} firm · {COUNTED.filter((t) => b.byType[t]).map((t) => `${typeLabel(t)} ${b.byType[t]}`).join(' · ') || 'brak'}</>} />
  );
}

const lsGet = (k: string) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

function Weekly() {
  const today = useToday();
  const toast = useToast();
  const cfg = useConfig();
  const [from, setFrom] = useState(() => addDays(today, -6));
  const [to, setTo] = useState(today);
  const key = `crm-report-notes:${from}:${to}`;
  const [notes, setNotes] = useState(() => lsGet(`crm-report-notes:${addDays(today, -6)}:${today}`));
  const [final, setFinal] = useState<{ key: string; text: string } | null>(null);
  useEffect(() => { setNotes(lsGet(key)); }, [key]);
  const q = useQuery({ queryKey: ['report', from, to], queryFn: () => api.report(from, to), enabled: !!from && !!to });
  const sum = useMutation({
    mutationFn: () => api.reportSummary(from, to, notes),
    onSuccess: (r) => setFinal({ key, text: r.text }),
    onError: (e) => toast((e as Error).message, 'error'),
  });
  const text = final?.key === key ? final.text : q.data?.text;
  const presets: [string, string, string][] = [
    ['Ostatnie 7 dni', addDays(today, -6), today],
    ['Ten tydzień', startOfWeek(today), today],
    ['Poprzedni tydzień', addDays(startOfWeek(today), -7), addDays(startOfWeek(today), -1)],
    ['30 dni', addDays(today, -29), today],
  ];
  return (
    <section className="card">
      <div className="toolbar">
        <div className="chips">
          {presets.map(([l, a, b]) => (
            <button key={l} className={`chip ${from === a && to === b ? 'on' : ''}`} onClick={() => { setFrom(a); setTo(b); }}>{l}</button>
          ))}
        </div>
        <span className="grow" />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 160, height: 36 }} />
        <span className="soft">–</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 160, height: 36 }} />
      </div>
      <div className="divider" />
      <div className="col tight" style={{ padding: '12px 20px' }}>
        <label className="field">Od siebie — co jeszcze się wydarzyło, co podkreślić
          <textarea rows={3} value={notes} placeholder="np. Dzień otwarty opublikowany na FB, zaproszenia do partnerów wysłane. Rozmowa z dyrekcją o biegu."
            onChange={(e) => { setNotes(e.target.value); lsSet(key, e.target.value); }} />
        </label>
        <div className="row wrap">
          <button className="btn sm primary" onClick={() => sum.mutate()} disabled={sum.isPending || !q.data}>
            {sum.isPending ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
            {cfg.data?.assistant ? (final?.key === key ? ' Podsumuj jeszcze raz' : ' Dodaj podsumowanie') : ' Dodaj moje uwagi'}
          </button>
          {final?.key === key && <button className="btn sm ghost" onClick={() => setFinal(null)}>Bez podsumowania</button>}
          <span className="soft small grow">{cfg.data?.assistant
            ? 'Asystent przejdzie po rozmowach, zadaniach i wydarzeniach z okresu i napisze krótkie podsumowanie — z Twoimi uwagami.'
            : 'Twoje uwagi trafią na górę raportu.'} Raport jest po angielsku.</span>
        </div>
      </div>
      <div className="divider" />
      <div className="row wrap" style={{ padding: '12px 20px' }}>
        <span className="grow" />
        <button className="btn sm" disabled={!text} onClick={() => { copyText(text!); toast('Skopiowano raport'); }}><Copy size={14} /> Kopiuj</button>
        <a className="btn sm" href={text ? `mailto:?subject=${encodeURIComponent('B2B weekly report')}&body=${encodeURIComponent(text)}` : undefined}><Send size={14} /> Wyślij</a>
      </div>
      {q.isLoading ? <Loading /> : q.error ? <div className="pad"><ErrorBox error={q.error} /></div> : <pre className="report">{text}</pre>}
    </section>
  );
}
