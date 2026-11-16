import { useState } from 'react';
import { Seg } from './ui';
import { greetingLine, guessTitle, vocative, type Greet, type Title } from '../../shared/greeting';

export const NO_GREET: Greet = { name: '', title: 'pan' };

/**
 * Name of the person we write to + Pan / Pani: "Dzień dobry, Panie Damianie,".
 * Pan / Pani is guessed from the name until clicked; the vocative is computed and can be corrected by hand.
 */
export function GreetInput({ value, onChange, lang = 'pl', placeholder = 'Imię rodzica (np. Damian)' }: {
  value: Greet; onChange: (g: Greet) => void; lang?: 'pl' | 'en'; placeholder?: string;
}) {
  const [manual, setManual] = useState(false);
  const has = !!value.name.trim();
  const setName = (name: string) => {
    if (!name.trim()) setManual(false);
    onChange({ name, title: manual && name.trim() ? value.title : guessTitle(name), voc: '' });
  };
  const auto = vocative(value.name, value.title);
  return (
    <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
      <input type="text" placeholder={placeholder} value={value.name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 200 }}
        title="Wstawi się w powitanie: Dzień dobry, Panie Damianie," />
      {has && lang === 'pl' && (
        <>
          <Seg<Title> value={value.title} options={['pan', 'pani'] as const} labels={{ pan: 'Pan', pani: 'Pani' }}
            onChange={(t) => { setManual(true); onChange({ ...value, title: t, voc: '' }); }} />
          <input type="text" value={value.voc || auto} onChange={(e) => onChange({ ...value, voc: e.target.value })}
            title="Forma w wołaczu — popraw, jeśli imię odmienia się inaczej" aria-label="Imię w wołaczu" style={{ width: 120 }} />
        </>
      )}
      {has && <span className="faint small">→ {greetingLine(value, lang, 'Hi')}</span>}
    </div>
  );
}
