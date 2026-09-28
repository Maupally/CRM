import {
  COUNTED, type Activity, type CrmEvent, type Lead, type Task,
  shortDate, plural, daysBetween,
} from '../shared/domain.js';

export interface ReportInput {
  from: string;
  to: string;
  today: string;
  owner: string;
  leads: Lead[];
  activities: Activity[];
  events: CrmEvent[];
  tasks: Task[];
}

/**
 * Weekly report as plain text, ready to paste into an email. One line per
 * company actually touched, where each lead stands now, and what is coming up —
 * not a transcript of every logged row.
 */
export function buildReport(r: ReportInput): string {
  const { from: a, to: b, today: t } = r;
  const names = new Map(r.leads.map((l) => [l.id, l.company]));
  const inRange = r.activities.filter((h) => h.date >= a && h.date <= b);

  const byType: Record<string, number> = Object.fromEntries(COUNTED.map((x) => [x, 0]));
  const touched: string[] = [];
  let held = 0, reached = 0, noAnswer = 0;
  for (const h of inRange) {
    if (h.result === 'planned' || h.result === 'cancelled') continue;
    if (!(COUNTED as string[]).includes(h.type)) continue;
    byType[h.type]++;
    if (h.type === 'Meeting' || h.type === 'Visit') held++;
    if (h.result === 'no answer') { noAnswer++; continue; }
    if (h.result === 'reached') reached++;
    if (!touched.includes(h.leadId)) touched.push(h.leadId);
  }
  const meetingsAhead = r.activities.filter((h) =>
    h.result === 'planned' && (h.type === 'Meeting' || h.type === 'Visit') && h.date >= t).length;

  const o: string[] = [];
  const rule = '-'.repeat(56);
  o.push('B2B WEEKLY REPORT');
  o.push(`${shortDate(a)} - ${shortDate(b)}   ·   ${r.owner}`);
  o.push('');
  o.push('THIS WEEK');
  o.push(`  Contacted ${plural(touched.length, 'company', 'companies')}` +
    (noAnswer ? `   ·   ${plural(noAnswer, 'attempt', 'attempts')} without answer` : ''));
  o.push('  ' + COUNTED.map((x) => `${x} ${byType[x]}`).join('   ·   '));
  o.push(`  Meetings / visits held ${held}   ·   booked ahead ${meetingsAhead}`);
  o.push('');

  // Who sits where in the funnel right now. "new" is only a count: 900 untouched rows tell nobody anything.
  const byStage = new Map<string, string[]>();
  for (const l of r.leads) {
    if (!byStage.has(l.stage)) byStage.set(l.stage, []);
    byStage.get(l.stage)!.push(l.company);
  }
  const listed = (label: string, stage: string) => {
    const rows = [...(byStage.get(stage) || [])].sort((x, y) => x.localeCompare(y, 'pl'));
    o.push(`  ${label} (${rows.length})`);
    if (!rows.length) { o.push('    none'); return; }
    rows.forEach((c, n) => o.push(`    ${n + 1}. ${c}`));
  };

  const dropped = inRange
    .filter((h) => h.stageTo === 'disqualified')
    .map((h) => ({ company: names.get(h.leadId) || h.leadId, why: h.note || 'no reason recorded' }));

  o.push('B2B PARTNERSHIPS');
  o.push(rule);
  o.push(`  Untouched so far: ${(byStage.get('new') || []).length}`);
  o.push('');
  listed('Contacting - contact attempted', 'contacting');
  o.push('');
  listed('Visits booked', 'scheduled visit');
  o.push('');
  listed('In negotiation', 'negotiation');
  o.push('');
  listed('Active partnerships', 'active');
  o.push('');
  o.push(`  Disqualified in this period (${dropped.length})`);
  if (!dropped.length) o.push('    none');
  dropped.forEach((d, n) => o.push(`    ${n + 1}. ${d.company} - ${d.why}`));
  o.push('');

  const happened = r.events.filter((e) => e.date >= a && e.date <= b);
  const upcoming = r.events.filter((e) => e.date > b && e.status !== 'cancelled');
  o.push('EVENTS');
  o.push(rule);
  if (happened.length) {
    for (const e of happened) {
      o.push(`  Held: ${shortDate(e.date)} ${e.title}${e.location ? ', ' + e.location : ''} [${e.status}]`);
      if (e.notes) o.push(`        ${e.notes}`);
    }
  } else {
    o.push('  None in this period.');
  }
  if (upcoming.length) {
    o.push('  Coming up:');
    for (const e of upcoming.slice(0, 5)) {
      const open = r.tasks.filter((x) => x.eventId === e.id && x.status !== 'done').length;
      o.push(`    ${shortDate(e.date)}${e.time ? ' ' + e.time : ''}  ${e.title}  (` +
        `${plural(daysBetween(t, e.date), 'day', 'days')}` +
        `${open ? ', ' + plural(open, 'task', 'tasks') + ' open' : ''})`);
    }
  }

  while (o.length && o[o.length - 1] === '') o.pop();
  return o.join('\n');
}
