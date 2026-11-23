/** What a team member sees from a personal link: the content calendar and the partnership backlog — nothing else. */
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { marketingClient } from '../api';
import { ContentCalendar, ContentReport, PartnerBacklog, useTeamContext } from '../components/Marketing';
import { Loading, Seg, ThemeToggle } from '../components/ui';

type Tab = 'kalendarz' | 'rozliczenie' | 'partnerzy';

export function TeamSpacePage() {
  const { token = '' } = useParams();
  const client = useMemo(() => marketingClient(token), [token]);
  const ctx = useTeamContext(client);
  const [tab, setTab] = useState<Tab>('kalendarz');
  if (ctx.isLoading) return <Loading />;
  if (ctx.error) return <div className="login"><div className="card pad">{(ctx.error as Error).message}</div></div>;
  return (
    <div className="team-space">
      <header className="row between" style={{ padding: '16px 20px' }}>
        <div className="brand" style={{ padding: 0 }}><span className="brand-mark">MB</span><b>Maple Bear · Marketing</b></div>
        <div className="row" style={{ gap: 8 }}><span className="soft small">Cześć, {ctx.data?.name}</span><ThemeToggle /></div>
      </header>
      <section className="card" style={{ margin: '0 auto', maxWidth: 1100 }}>
        <div style={{ padding: '14px 20px 6px' }}>
          <Seg value={tab} onChange={setTab} options={['kalendarz', 'rozliczenie', 'partnerzy'] as Tab[]}
            labels={{ kalendarz: 'Kalendarz treści', rozliczenie: 'Rozliczenie', partnerzy: 'Backlog partnerski' }} />
        </div>
        {tab === 'kalendarz' && <ContentCalendar client={client} />}
        {tab === 'rozliczenie' && <ContentReport client={client} />}
        {tab === 'partnerzy' && <PartnerBacklog client={client} />}
      </section>
    </div>
  );
}
