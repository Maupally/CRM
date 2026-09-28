import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.ts';
import { ErrorBox, Loading, StagePill, useAction } from '../components/ui.tsx';

export function DataPage() {
  const dup = useQuery({ queryKey: ['duplicates'], queryFn: api.duplicates });
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Awaited<ReturnType<typeof api.importXlsx>> | null>(null);
  const imp = useAction(() => api.importXlsx(file!), { ok: 'Import finished', onDone: (r) => { setResult(r); setFile(null); } });

  return (
    <>
      <div className="page-head"><h1>Data</h1></div>
      <div className="grid halves">
        <div className="stack">
          <section className="card card-pad stack">
            <h2>Backup / export</h2>
            <div className="muted">Everything in one .xlsx with the same tabs and columns as the old Google Sheet (CRM, History, Playbook, Szablony, Events, Tasks). Open it in Google Sheets or Excel any time.</div>
            <div><a className="btn primary" href="/api/export.xlsx">Download .xlsx</a></div>
          </section>

          <section className="card card-pad stack">
            <h2>Import from the sheet</h2>
            <div className="muted">Upload an .xlsx exported from the Google Sheet (File → Download → Microsoft Excel).
              <b> This replaces all data in the CRM.</b> Download a backup first.</div>
            <input type="file" accept=".xlsx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <div>
              <button className="btn danger" disabled={!file || imp.isPending}
                onClick={() => confirm('Replace ALL data in the CRM with this file?') && imp.mutate(undefined)}>
                {imp.isPending ? 'Importing…' : 'Replace everything with this file'}
              </button>
            </div>
            {result && (
              <div className="stack tight">
                <div>Leads {String(result.leads)} · activities {String(result.activities)} · follow-ups carried over {String(result.carriedOver)} ·
                  segments {String(result.segments)} · templates {String(result.templates)} · events {String(result.events)} · tasks {String(result.tasks)}</div>
                {result.warnings.map((w, i) => <div key={i} className="hint">! {w}</div>)}
              </div>
            )}
          </section>
        </div>

        <section className="card">
          <div className="card-head"><h2>Possible duplicates</h2><span className="muted">{dup.data?.length ?? ''}</span></div>
          {dup.isLoading ? <Loading /> : dup.error ? <ErrorBox error={dup.error} /> : (
            <ul className="list">
              {dup.data!.map((g, i) => (
                <li key={i} className="item" style={{ display: 'block' }}>
                  {g.map((l) => (
                    <div key={l.id} className="row" style={{ padding: '2px 0' }}>
                      <span className="faint mono" style={{ width: 44 }}>{l.id}</span>
                      <Link to={`/leads/${l.id}`} className="title grow ellipsis">{l.company}</Link>
                      <span className="muted">{l.city}</span>
                      <StagePill stage={l.stage} />
                    </div>
                  ))}
                </li>
              ))}
              {!dup.data!.length && <li className="empty">No duplicates.</li>}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
