/**
 * Procedures: who does what, in which order, how long each step may take. Starting one turns its steps into
 * tasks for the right people; the CRM keeps the order (no step before the previous one is done) and shows where
 * a run is stuck — late, blocked or with nobody on it — and what is on each person's plate.
 */
import type { Row } from './db.js';
import { nowIso } from './db.js';
import { HttpError, type Crm } from './crm.js';
import { addDays, isIsoDay, longTxt, txt, type Process, type ProcessRun, type ProcessStep, type RunStep, type Task } from '../shared/domain.js';

const parseSteps = (raw: unknown): ProcessStep[] => {
  try {
    const v = JSON.parse(String(raw));
    return Array.isArray(v) ? v.map(cleanStep).filter((s) => s.title) : [];
  } catch { return []; }
};
const cleanStep = (s: Partial<ProcessStep> | undefined): ProcessStep => ({
  title: txt(s?.title), personId: Number(s?.personId) || 0, days: Math.max(0, Math.round(Number(s?.days) || 0)), doneWhen: longTxt(s?.doneWhen),
});
/** "Nowy partner: Armada" rather than "Nowy partner: Nowy partner: Armada". */
export const runLabel = (process: string, title: string) =>
  !process || title.toLowerCase().startsWith(process.toLowerCase()) ? title : `${process}: ${title}`;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export class Processes {
  constructor(private crm: Crm) {}
  private get db() { return this.crm.db; }

  private toProcess(r: Row): Process {
    return { id: Number(r.id), name: r.name, description: r.description, steps: parseSteps(r.steps), updatedAt: r.updated_at, activeRuns: Number(r.active_runs) || 0 };
  }

  async list(): Promise<Process[]> {
    const rows = await this.db.all(`SELECT p.*, (SELECT COUNT(*) FROM crm.process_runs r WHERE r.process_id = p.id AND r.status = 'active') AS active_runs
      FROM crm.processes p ORDER BY p.name`);
    return rows.map((r) => this.toProcess(r));
  }

  async get(id: number): Promise<Process> {
    const p = (await this.list()).find((x) => x.id === id);
    if (!p) throw new HttpError(404, `Nie ma procedury ${id}.`);
    return p;
  }

  /** Finds a procedure by id or by (part of) its name. */
  async find(ref: unknown): Promise<Process> {
    const id = Number(ref);
    if (id) return this.get(id);
    const k = txt(ref).toLowerCase();
    const all = await this.list();
    const hit = all.find((p) => p.name.toLowerCase() === k) || all.find((p) => k && p.name.toLowerCase().includes(k));
    if (!hit) throw new HttpError(404, `Nie ma procedury „${txt(ref)}”. Są: ${all.map((p) => p.name).join(', ') || 'brak'}.`);
    return hit;
  }

  async save(d: { id?: number; name?: string; description?: string; steps?: Partial<ProcessStep>[] }): Promise<Process> {
    const id = Number(d.id) || 0;
    const cur = id ? await this.get(id) : null;
    const name = txt(d.name ?? cur?.name);
    if (!name) throw new HttpError(400, 'Podaj nazwę procedury.');
    const steps = d.steps ? d.steps.map(cleanStep).filter((s) => s.title) : cur?.steps || [];
    if (!steps.length) throw new HttpError(400, 'Procedura musi mieć co najmniej jeden krok.');
    for (const s of steps) if (s.personId) await this.crm.getPerson(s.personId);
    const description = longTxt(d.description ?? cur?.description);
    const now = nowIso();
    if (cur) {
      await this.db.run('UPDATE crm.processes SET name = ?, description = ?, steps = ?, updated_at = ? WHERE id = ?',
        [name, description, JSON.stringify(steps), now, id]);
      return this.get(id);
    }
    const r = await this.db.get(`INSERT INTO crm.processes (name, description, steps, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING id`,
      [name, description, JSON.stringify(steps), now, now]);
    return this.get(Number(r!.id));
  }

  async remove(id: number) {
    await this.get(id);
    if ((await this.get(id)).activeRuns) throw new HttpError(409, 'Ta procedura ma trwające procesy — najpierw je zakończ albo anuluj.');
    await this.db.run('DELETE FROM crm.processes WHERE id = ?', [id]);
    return { ok: true };
  }

  /**
   * Starts a run: every step becomes a task for its person; the first one starts now (due = today + its days),
   * the next ones wait for the one before. `owners` swaps people for this run only.
   */
  async start(d: { processId: number; title?: string; leadId?: string; eventId?: string; start?: string; owners?: Record<number, number> }): Promise<ProcessRun> {
    const p = await this.get(Number(d.processId));
    const start = isIsoDay(d.start) ? d.start : this.crm.today();
    const leadId = txt(d.leadId);
    const eventId = txt(d.eventId);
    const title = txt(d.title) || p.name;
    const r = await this.db.get(`INSERT INTO crm.process_runs (process_id, title, lead_id, event_id, status, started, created_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?) RETURNING id`, [p.id, title, leadId, eventId, start, nowIso()]);
    const runId = Number(r!.id);
    for (const [i, s] of p.steps.entries()) {
      const personId = Number(d.owners?.[i + 1]) || s.personId;
      const t = await this.crm.saveTask({
        task: s.title, personId, leadId, eventId, due: i === 0 && s.days ? addDays(start, s.days) : '',
        notes: s.doneWhen ? `Gotowe, gdy: ${s.doneWhen}` : '',
      });
      await this.db.run('UPDATE crm.tasks SET run_id = ?, step = ?, step_days = ?, started = ? WHERE id = ?',
        [runId, i + 1, s.days, i === 0 ? start : '', t.id]);
    }
    return this.run(runId);
  }

  async cancel(runId: number) {
    await this.run(runId);
    await this.db.run(`UPDATE crm.process_runs SET status = 'cancelled', finished = ? WHERE id = ?`, [this.crm.today(), runId]);
    return this.run(runId);
  }

  private stuckReasons(steps: RunStep[], current: number): string[] {
    const s = steps[current - 1];
    if (!s) return [];
    const today = this.crm.today();
    const out: string[] = [];
    if (s.blocked) out.push(`zablokowane: ${s.blocked}`);
    if (!s.personId) out.push('nikt nie jest przypisany');
    if (s.due && s.due < today) out.push(`spóźnione o ${daysBetween(s.due, today)} dni`);
    else if (!s.due && s.started && daysBetween(s.started, today) > 7) out.push(`stoi od ${daysBetween(s.started, today)} dni`);
    return out;
  }

  private async build(r: Row): Promise<ProcessRun> {
    const tasks = await this.db.all(`SELECT t.*, p.name AS person_name FROM crm.tasks t LEFT JOIN crm.people p ON p.id = t.person_id
      WHERE t.run_id = ? ORDER BY t.step`, [r.id]);
    const steps: RunStep[] = tasks.map((t) => ({
      taskId: t.id, step: Number(t.step), title: t.task, status: t.status, due: t.due, completed: t.completed, blocked: t.blocked,
      started: t.started, personId: Number(t.person_id) || 0, person: t.person_name || '', doneWhen: String(t.notes || '').replace(/^Gotowe, gdy: /, ''),
    }));
    const firstOpen = steps.findIndex((s) => s.status !== 'done');
    const current = r.status === 'active' && firstOpen >= 0 ? firstOpen + 1 : 0;
    return {
      id: Number(r.id), processId: Number(r.process_id), process: r.process_name || '', title: r.title, leadId: r.lead_id, company: r.company || '',
      eventId: r.event_id, eventTitle: r.event_title || '', status: r.status, started: r.started, finished: r.finished,
      steps, current, stuck: current ? this.stuckReasons(steps, current) : [],
    };
  }

  private static RUN_SQL = `SELECT r.*, p.name AS process_name, l.company, e.title AS event_title FROM crm.process_runs r
    LEFT JOIN crm.processes p ON p.id = r.process_id LEFT JOIN crm.leads l ON l.id = r.lead_id AND r.lead_id <> ''
    LEFT JOIN crm.events e ON e.id = r.event_id AND r.event_id <> ''`;

  async run(id: number): Promise<ProcessRun> {
    const r = await this.db.get(`${Processes.RUN_SQL} WHERE r.id = ?`, [id]);
    if (!r) throw new HttpError(404, `Nie ma procesu ${id}.`);
    return this.build(r);
  }

  /** Active runs first (stuck ones on top), then the recently finished. */
  async runs(opts: { all?: boolean } = {}): Promise<ProcessRun[]> {
    const rows = await this.db.all(`${Processes.RUN_SQL} ${opts.all ? '' : `WHERE r.status = 'active'`} ORDER BY r.started DESC, r.id DESC`);
    const runs = await Promise.all(rows.map((r) => this.build(r)));
    return runs.sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || b.stuck.length - a.stuck.length);
  }

  /**
   * What is on someone's plate: their open tasks, and for steps of a procedure — which process, which step,
   * and whether it is theirs to do now or still waits for someone else.
   */
  async personWork(personId: number) {
    const p = await this.crm.getPerson(personId);
    const tasks = (await this.crm.listTasks()).filter((t) => t.personId === personId && t.status !== 'done');
    const runs = new Map<number, ProcessRun>();
    for (const t of tasks) if (t.runId && !runs.has(t.runId)) runs.set(t.runId, await this.run(t.runId));
    const today = this.crm.today();
    const items = tasks.map((t: Task) => {
      const run = t.runId ? runs.get(t.runId) : undefined;
      const waitingFor = run && run.current && run.current < t.step ? run.steps[run.current - 1] : undefined;
      return {
        task_id: t.id, task: t.task, due: t.due || undefined, late_days: t.due && t.due < today ? daysBetween(t.due, today) : undefined,
        blocked: t.blocked || undefined, company: t.company || undefined, event: t.eventTitle || undefined,
        process: run ? `${runLabel(run.process, run.title)} — krok ${t.step}/${run.steps.length}` : undefined,
        state: !run ? 'do zrobienia' : run.status !== 'active' ? 'proces zamknięty' : waitingFor
          ? `czeka na krok ${waitingFor.step}: „${waitingFor.title}”${waitingFor.person ? ` (${waitingFor.person})` : ''}` : 'teraz jego/jej ruch',
      };
    });
    return { person: p.name, role: p.role, open: items.length, items };
  }

  /** Plain text for Claude: procedures and where every run stands. */
  async status(onlyStuck = false): Promise<string> {
    const [procs, runs] = await Promise.all([this.list(), this.runs()]);
    const shown = onlyStuck ? runs.filter((r) => r.stuck.length) : runs;
    const lines: string[] = [];
    if (!onlyStuck) {
      lines.push('PROCEDURY:');
      lines.push(...(procs.length ? procs.map((p) => `id ${p.id} „${p.name}”: ${p.steps.map((s, i) => `${i + 1}. ${s.title}${s.personId ? ` [osoba ${s.personId}]` : ''}${s.days ? ` (${s.days} dni)` : ''}`).join('; ')}`) : ['(brak)']));
      lines.push('', 'TRWAJĄCE PROCESY:');
    }
    if (!shown.length) lines.push(onlyStuck ? 'Nic nie utknęło.' : '(brak)');
    for (const r of shown) {
      const s = r.steps[r.current - 1];
      lines.push(`proces ${r.id} „${r.title}” (${r.process})${r.company ? `, firma ${r.company}` : ''}${r.eventTitle ? `, wydarzenie ${r.eventTitle}` : ''}: ` +
        (s ? `krok ${r.current}/${r.steps.length} „${s.title}” — ${s.person || 'NIKT'}${s.due ? `, termin ${s.due}` : ''} (zadanie ${s.taskId})` : 'zakończony') +
        (r.stuck.length ? ` ⚠ UTKNĘŁO: ${r.stuck.join('; ')}` : ''));
    }
    return lines.join('\n');
  }
}
