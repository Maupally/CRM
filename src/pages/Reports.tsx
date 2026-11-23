import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PhoneCall, Copy, Send, Loader2, Download, Settings2 } from 'lucide-react';
import { api, type CallConfig } from '../api';
import { Loading, copyText, useToast, useToday } from '../components/ui';
import { addDays } from '../../shared/domain';

/**
 * Call report: the weekly calls from Plus recording, per person (Sales / Admin), sent by e-mail like the Apps Script
 * did. The other reports (weekly B2B, done list, messages) are written in the chat now, from the connector.
 */
export function ReportsPage() {
  return (
    <>
      <div className="page-head">
        <div><h1>Call report</h1><div className="sub">Połączenia z nagrywania Plusa za tydzień (pt–czw), per osoba — podgląd i wysyłka mailem.</div></div>
      </div>
      <CallReport />
    </>
  );
}

/** The Friday–Thursday week ending on the latest Thursday, as in the old Apps Script. */
function reportWeek(today: string) {
  let to = today;
  while (new Date(`${to}T12:00:00Z`).getUTCDay() !== 4) to = addDays(to, -1);
  return { from: addDays(to, -6), to };
}

function CallReport() {
  const today = useToday();
  const toast = useToast();
  const cfg = useQuery({ queryKey: ['call-config'], queryFn: api.callConfig });
  const [range, setRange] = useState(() => reportWeek(today));
  const [showCfg, setShowCfg] = useState(false);
  const run = useMutation({ mutationFn: () => api.callReport(range.from, range.to), onError: (e: Error) => toast(e.message, 'error') });
  const send = useMutation({ mutationFn: () => api.sendCallReport(range.from, range.to),
    onSuccess: (r) => toast(`Wysłano do ${r.sent} odbiorców`), onError: (e: Error) => toast(e.message, 'error') });
  const shift = (days: number) => setRange({ from: addDays(range.from, days), to: addDays(range.to, days) });
  const c = cfg.data;
  const download = () => {
    if (!run.data) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([run.data.html], { type: 'text/html' }));
    a.download = `call-report-${run.data.report.label}.html`;
    a.click();
  };

  if (cfg.isLoading) return <Loading />;
  return (
    <div className="col" style={{ gap: 18 }}>
      <section className="card pad col" style={{ gap: 12 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <h2 className="grow" style={{ margin: 0 }}>Call report — aktywność telefoniczna</h2>
          <button className="btn sm ghost" onClick={() => setShowCfg(!showCfg)}><Settings2 size={14} /> Konfiguracja</button>
        </div>
        {c && !c.ready && <div className="error-box small">Brak danych logowania do nagrywania Plusa. W Vercel → Settings → Environment Variables dodaj <code>PLUS_REC_USER</code> i <code>PLUS_REC_PASSWORD</code>, potem Redeploy.</div>}
        {c && !c.people.length && <div className="hint">Najpierw wklej swój stary skrypt w „Konfiguracja” — wezmę z niego osoby, numery i odbiorców (bez hasła).</div>}
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn sm" onClick={() => shift(-7)}>← tydzień</button>
          <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} style={{ width: 150 }} />
          <span className="soft">→</span>
          <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} style={{ width: 150 }} />
          <button className="btn sm" onClick={() => shift(7)} disabled={range.to >= today}>tydzień →</button>
          <span className="grow" />
          <button className="btn primary" onClick={() => run.mutate()} disabled={run.isPending || !c?.ready || !c?.people.length}>
            {run.isPending ? <Loader2 size={15} className="spin" /> : <PhoneCall size={15} />} Generuj raport
          </button>
        </div>
        <div className="hint">Tydzień jak w skrypcie: piątek–czwartek. Dane pobierane na żywo z nagrywania Plusa (dopasowanie po numerze, potem po nazwie działu).</div>
      </section>

      {showCfg && c && <CallConfigPanel c={c} />}

      {run.data && (
        <section className="card pad col" style={{ gap: 10 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <b className="grow">{run.data.report.from} → {run.data.report.to} · pobrano {run.data.report.fetched} połączeń</b>
            <button className="btn sm" onClick={() => { copyText(run.data!.html); toast('Skopiowano HTML'); }}><Copy size={14} /> Kopiuj HTML</button>
            <button className="btn sm" onClick={download}><Download size={14} /> Pobierz</button>
            <button className="btn sm primary" disabled={send.isPending || !c?.mail || !c?.recipients.length}
              title={c?.mail ? '' : 'Wysyłka z Opal5 nie jest włączona (RESEND_API_KEY, MAIL_FROM)'}
              onClick={() => confirm(`Wysłać raport do ${c?.recipients.length} odbiorców?`) && send.mutate()}>
              {send.isPending ? <Loader2 size={14} className="spin" /> : <Send size={14} />} Wyślij ({c?.recipients.length || 0})
            </button>
          </div>
          {run.data.report.warnings.map((w) => <div key={w} className="small" style={{ color: 'var(--warn)' }}>⚠ {w}</div>)}
          <iframe title="Call report" srcDoc={run.data.html} sandbox="" style={{ width: '100%', height: 620, border: 0, borderRadius: 10, background: '#f0f0f0' }} />
        </section>
      )}
    </div>
  );
}

function CallConfigPanel({ c }: { c: CallConfig & { ready: boolean; mail: boolean } }) {
  const toast = useToast();
  const [script, setScript] = useState('');
  const [people, setPeople] = useState(c.people);
  const [recipients, setRecipients] = useState(c.recipients.join('\n'));
  const [blacklist, setBlacklist] = useState(c.blacklist.join(' '));
  useEffect(() => { setPeople(c.people); setRecipients(c.recipients.join('\n')); setBlacklist(c.blacklist.join(' ')); }, [c]);
  const imp = useMutation({ mutationFn: () => api.importCallScript(script),
    onSuccess: (r) => { toast(`Wczytano: ${r.people.length} osób, ${r.blacklist.length} numerów, ${r.recipients.length} odbiorców`); setScript(''); cfgRefetch(); },
    onError: (e: Error) => toast(e.message, 'error') });
  const save = useMutation({ mutationFn: () => api.saveCallConfig({ people, recipients: recipients.split(/[\s,;]+/), blacklist: blacklist.split(/[\s,;]+/) }),
    onSuccess: () => { toast('Zapisano'); cfgRefetch(); }, onError: (e: Error) => toast(e.message, 'error') });
  const qc = useQueryClient();
  const cfgRefetch = () => qc.invalidateQueries({ queryKey: ['call-config'] });
  return (
    <section className="card pad col" style={{ gap: 12 }}>
      <h2 style={{ margin: 0 }}>Konfiguracja raportu</h2>
      <div className="small soft">Logowanie do Plusa: {c.ready ? '✅ ustawione w Vercel' : '❌ brak (PLUS_REC_USER, PLUS_REC_PASSWORD)'} · Wysyłka maili: {c.mail ? '✅' : '❌ wyłączona — raport pobierzesz i wyślesz sam'}</div>
      <label className="field">Wklej stary skrypt Google Apps Script — wezmę osoby, numery wewnętrzne i odbiorców (login i hasło pomijam)
        <textarea rows={4} value={script} onChange={(e) => setScript(e.target.value)} placeholder="const CONFIG = { … }" /></label>
      <button className="btn sm" style={{ alignSelf: 'flex-start' }} disabled={!script.trim() || imp.isPending} onClick={() => imp.mutate()}>Wczytaj ze skryptu</button>
      {people.length > 0 && (
        <div className="col tight">
          <span className="small soft">Osoby — numer nagrywany (MSISDN) daje wynik zgodny z raportem Plusa; bez numeru dopasowanie idzie po nazwie działu</span>
          {people.map((p, i) => (
            <div key={i} className="row wrap" style={{ gap: 6 }}>
              <b style={{ width: 150 }} className="trunc">{p.person}</b>
              <select value={p.group} onChange={(e) => setPeople(people.map((x, k) => k === i ? { ...x, group: e.target.value as 'sales' | 'admin' } : x))} style={{ width: 100 }}>
                <option value="sales">Sales</option><option value="admin">Admin</option>
              </select>
              <input type="text" value={p.recordingNumber || ''} placeholder="numer, np. 48600123456" style={{ width: 170 }}
                onChange={(e) => setPeople(people.map((x, k) => k === i ? { ...x, recordingNumber: e.target.value || null } : x))} />
              <span className="small faint trunc grow">{p.recordingNumber ? '' : p.departmentNames.join(' | ')}{p.treatAllAsExternal ? ' · cały ruch jako zewnętrzny' : ''}</span>
            </div>
          ))}
        </div>
      )}
      <label className="field">Odbiorcy (po jednym w linii)<textarea rows={4} value={recipients} onChange={(e) => setRecipients(e.target.value)} /></label>
      <label className="field">Numery wewnętrzne (blacklist) — połączenie między nimi liczy się jako wewnętrzne<textarea rows={3} value={blacklist} onChange={(e) => setBlacklist(e.target.value)} /></label>
      <button className="btn primary sm" style={{ alignSelf: 'flex-start' }} disabled={save.isPending} onClick={() => save.mutate()}>Zapisz konfigurację</button>
    </section>
  );
}

const MSG_COLOR = { email: 'var(--violet)', sms: 'var(--warn)', internal: 'var(--ok)' } as const;
const MONTH = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const monthLabel = (m: string) => `${MONTH[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const monthEnd = (m: string) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
