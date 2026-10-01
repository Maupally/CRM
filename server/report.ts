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

  // Only companies actually worked on in this period, grouped by where they stand now.
  // A lead that merely sits in "contacting" since last month is not news.
  const worked = new Map<string, Activity[]>();
  for (const h of inRange) {
    if (h.result === 'planned' || h.result === 'cancelled') continue;
    // real contact or a stage move; a bare note ("added by hand", imports) is not work on the lead
    const moved = !!h.stageTo && h.stageFrom !== h.stageTo;
    if (!(COUNTED as string[]).includes(h.type) && !moved) continue;
    if (!worked.has(h.leadId)) worked.set(h.leadId, []);
    worked.get(h.leadId)!.push(h);
  }
  const stageOf = new Map(r.leads.map((l) => [l.id, l.stage]));
  const line = (id: string) => {
    const acts = worked.get(id)!.sort((x, y) => x.date.localeCompare(y.date) || x.id - y.id);
    const last = acts[acts.length - 1];
    const moved = acts.filter((h) => h.stageTo && h.stageFrom !== h.stageTo).map((h) => `${h.stageFrom || 'new'} -> ${h.stageTo}`);
    const what = acts.filter((h) => (COUNTED as string[]).includes(h.type)).map((h) => h.type).filter((x, i, all) => all.indexOf(x) === i).join(', ');
    const note = (last.note || '').replace(/\s+/g, ' ').trim();
    return `${names.get(id) || id} - ${what}${moved.length ? ` [${moved.join('; ')}]` : ''}${note ? `: ${note.length > 110 ? note.slice(0, 107) + '...' : note}` : ''}`;
  };
  const listed = (label: string, stage: string) => {
    const ids = [...worked.keys()].filter((id) => stageOf.get(id) === stage)
      .sort((x, y) => (names.get(x) || x).localeCompare(names.get(y) || y, 'pl'));
    if (!ids.length) return;
    o.push(`  ${label} (${ids.length})`);
    ids.forEach((id, n) => o.push(`    ${n + 1}. ${line(id)}`));
    o.push('');
  };

  const dropped = inRange
    .filter((h) => h.stageTo === 'disqualified')
    .map((h) => ({ company: names.get(h.leadId) || h.leadId, why: h.note || 'no reason recorded' }));

  const count = (st: string) => r.leads.filter((l) => l.stage === st).length;
  o.push('B2B PARTNERSHIPS - WORKED ON IN THIS PERIOD');
  o.push(rule);
  if (!worked.size) o.push('  No companies worked on in this period.', '');
  listed('New', 'new');
  listed('Contacting - contact attempted', 'contacting');
  listed('Visits booked', 'scheduled visit');
  listed('In negotiation', 'negotiation');
  listed('Active partnerships', 'active');
  if (dropped.length) {
    o.push(`  Disqualified in this period (${dropped.length})`);
    dropped.forEach((d, n) => o.push(`    ${n + 1}. ${d.company} - ${d.why}`));
    o.push('');
  }
  o.push(`  Pipeline now: untouched ${count('new')}   ·   contacting ${count('contacting')}   ·   visits booked ${count('scheduled visit')}` +
    `   ·   negotiation ${count('negotiation')}   ·   active ${count('active')}`);
  o.push('');

  const doneTasks = r.tasks.filter((x) => x.status === 'done' && x.completed >= a && x.completed <= b);
  if (doneTasks.length) {
    o.push(`TASKS DONE (${doneTasks.length})`);
    o.push(rule);
    for (const x of doneTasks) o.push(`  ${shortDate(x.completed)}  ${x.task}${x.eventTitle ? `  (${x.eventTitle})` : x.company ? `  (${x.company})` : ''}`);
    o.push('');
  }

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
