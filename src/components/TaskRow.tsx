import { Link } from 'react-router-dom';
import { Check, Phone } from 'lucide-react';
import type { OpenItem } from '../api';
import { normPhone } from '../../shared/domain';
import { DueTag, TypeIcon, telHref, typeLabel } from './ui';

/** One open activity: what, with whom, when — plus call and complete. Used on the dashboard and in Tasks. */
export function TaskRow({ a, today, onComplete, showDate = true }: {
  a: OpenItem; today: string; onComplete: (a: OpenItem) => void; showDate?: boolean;
}) {
  const phone = normPhone(a.phone);
  return (
    <li className="li">
      <button className="check" title="Oznacz jako zrobione" aria-label="Zrobione" onClick={() => onComplete(a)}><Check size={14} /></button>
      <TypeIcon type={a.type} />
      <div className="grow">
        <Link to={`/firmy/${a.leadId}`} className="title trunc" style={{ display: 'block' }}>{a.company}</Link>
        <div className="row" style={{ gap: 6, marginTop: 2 }}>
          {showDate && <DueTag date={a.date} today={today} />}
          <span className="meta trunc">{typeLabel(a.type)}{a.note ? ` · ${a.note}` : ''}{a.city ? ` · ${a.city}` : ''}</span>
        </div>
      </div>
      <div className="act">
        {phone && (
          <a className="btn sm" href={telHref(phone)} title={`Zadzwoń ${phone}`}>
            <Phone size={14} /><span className="hide-sm mono">{phone}</span>
          </a>
        )}
      </div>
    </li>
  );
}
