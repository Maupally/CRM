import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Link2, Plus } from 'lucide-react';
import { marketingClient, shareLinks } from '../api';
import { ContentCalendar, ContentReport, PartnerBacklog } from '../components/Marketing';
import { Seg, copyText, useAction, useToast } from '../components/ui';
import { shortDate } from '../../shared/domain';

const own = marketingClient();
type Tab = 'kalendarz' | 'rozliczenie' | 'partnerzy' | 'dostep';

export function MarketingPage() {
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('marketing.tab') as Tab) || 'kalendarz');
  const pick = (t: Tab) => { setTab(t); try { localStorage.setItem('marketing.tab', t); } catch { /* private mode */ } };
  return (
    <>
      <div className="page-head">
        <div><h1>Marketing</h1><div className="sub">Kalendarz treści, rozliczenie i backlog partnerski — zespół pracuje na nich przez własne linki, bez dostępu do reszty Opal5.</div></div>
      </div>
      <section className="card">
        <div style={{ padding: '14px 20px 6px' }}>
          <Seg value={tab} onChange={pick} options={['kalendarz', 'rozliczenie', 'partnerzy', 'dostep'] as Tab[]}
            labels={{ kalendarz: 'Kalendarz treści', rozliczenie: 'Rozliczenie', partnerzy: 'Backlog partnerski', dostep: 'Dostęp zespołu' }} />
        </div>
        {tab === 'kalendarz' && <ContentCalendar client={own} />}
        {tab === 'rozliczenie' && <ContentReport client={own} />}
        {tab === 'partnerzy' && <PartnerBacklog client={own} />}
        {tab === 'dostep' && <TeamAccess />}
      </section>
    </>
  );
}

/** Personal links: each opens only the content calendar and the partnership backlog; revoking one closes it at once. */
function TeamAccess() {
  const q = useQuery({ queryKey: ['share-links'], queryFn: shareLinks.list });
  const [name, setName] = useState('');
  const toast = useToast();
  const url = (t: string) => `${location.origin}/z/${t}`;
  const add = useAction((n: string) => shareLinks.add(n), { onDone: (l) => { setName(''); copyText(url(l.token)); toast(`Link dla ${l.name} skopiowany`); } });
  const revoke = useAction((t: string) => shareLinks.revoke(t), { ok: 'Link wyłączony' });
  return (
    <div className="col" style={{ padding: '6px 20px 18px', gap: 12 }}>
      <div className="small soft">
        Każda osoba dostaje własny link. Widzi i edytuje tylko kalendarz treści i backlog partnerski (plus listę nadchodzących wydarzeń i imiona zespołu) —
        nie widzi firm, zadań, ludzi ani niczego innego. Usuwać może tylko to, co sama dodała. Gdy ktoś odchodzi albo link wycieknie — wyłącz go.
      </div>
      <form className="row" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); if (name.trim()) add.mutate(name.trim()); }}>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Imię, np. Roma" style={{ maxWidth: 260 }} />
        <button className="btn primary" disabled={!name.trim() || add.isPending}><Plus size={15} /> Utwórz link</button>
      </form>
      <ul className="list">
        {(q.data || []).map((l) => (
          <li key={l.token} className="li" style={{ opacity: l.revoked ? 0.5 : 1 }}>
            <span className="type-ic"><Link2 size={16} /></span>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="title">{l.name}{l.revoked && ' · wyłączony'}</div>
              <div className="meta trunc">utworzony {shortDate(l.createdAt.slice(0, 10))}{l.lastUsed ? ` · ostatnio ${shortDate(l.lastUsed.slice(0, 10))}` : ' · jeszcze nieużyty'}</div>
            </div>
            {!l.revoked && <>
              <button className="btn sm" onClick={() => { copyText(url(l.token)); toast('Skopiowano'); }}><Copy size={14} /> Kopiuj</button>
              <button className="btn sm ghost danger" onClick={() => confirm(`Wyłączyć link ${l.name}?`) && revoke.mutate(l.token)}>Wyłącz</button>
            </>}
          </li>
        ))}
      </ul>
    </div>
  );
}
