import { Hono, type Context } from 'hono';
import { getSignedCookie, setSignedCookie, deleteCookie } from 'hono/cookie';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Crm, HttpError } from './crm.js';
import { openDb } from './db.js';
import { importWorkbook, exportWorkbook } from './spreadsheet.js';
import { Assistant, withSummary, type AssistantTurn } from './assistant.js';
import { TOOLS_VERSION, handleMcp, handleStaleMcp, lastMcp, mcpToken } from './mcp.js';
import { Designs } from './designs.js';
import { Threads } from './threads.js';
import { B2c } from './b2c.js';
import { Processes } from './processes.js';
import { suggestProcesses } from './suggest.js';
import { personProfile } from './profile.js';
import { callReport, callReportHtml, callReportReady, getCallConfig, parseScriptConfig, saveCallConfig, sendCallReport } from './callreport.js';
import { Knowledge, MAX_FILE } from './knowledge.js';
import { mailEnabled } from './mail.js';

export interface AppOptions {
  /** Called on the first request; the result is reused afterwards. */
  crm: () => Promise<Crm>;
  /** When empty, the app runs without a login (local use only). */
  password?: string;
  secret?: string;
  secureCookies?: boolean;
  /** Online (Vercel) the app never runs open: without a password it shows how to set one and serves nothing else. */
  requirePassword?: boolean;
}

const COOKIE = 'crm_session';
const SESSION_DAYS = 30;

function same(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** App wired from environment variables — used by both the local server and the Vercel function. */
export function appFromEnv() {
  let crm: Promise<Crm> | null = null;
  return createApp({
    crm: () => (crm ||= openDb().then((db) => new Crm(db, process.env.OWNER || 'Martin'))
      .catch((e) => { crm = null; throw e; })),
    password: process.env.APP_PASSWORD || '',
    secret: process.env.SESSION_SECRET,
    secureCookies: process.env.SECURE_COOKIES === '1' || !!process.env.VERCEL,
    requirePassword: !!process.env.VERCEL || process.env.REQUIRE_PASSWORD === '1',
  });
}

export function createApp(o: AppOptions) {
  const password = o.password || '';
  const secret = o.secret || createHash('sha256').update('crm:' + password).digest('hex');
  const api = new Hono();

  api.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400);
    console.error(err);
    const msg = err instanceof Error ? err.message : String(err);
    if (/ECONNREFUSED|ENOTFOUND|password authentication|getaddrinfo/i.test(msg)) {
      return c.json({ error: 'Brak połączenia z bazą danych. Sprawdź DATABASE_URL w ustawieniach Vercel.' }, 500);
    }
    return c.json({ error: msg || 'Błąd serwera' }, 500);
  });

  /* ---- auth */
  const setupNeeded = !password && !!o.requirePassword;
  if (setupNeeded) {
    api.get('/me', (c) => c.json({ authenticated: false, passwordRequired: true, setupNeeded: true }));
    api.all('*', (c) => c.json({ error: 'Opal5 jest zablokowany, dopóki nie ustawisz hasła (APP_PASSWORD w Vercel).' }, 503));
    return new Hono().route('/api', api);
  }

  const authed = async (c: Context) => {
    if (!password) return true;
    const v = await getSignedCookie(c, secret, COOKIE);
    return typeof v === 'string' && Number(v) > Date.now();
  };

  api.get('/me', async (c) => c.json({ authenticated: await authed(c), passwordRequired: !!password }));

  api.post('/login', async (c) => {
    const { password: given } = await c.req.json<{ password?: string }>().catch(() => ({ password: '' }));
    if (!password) return c.json({ ok: true });
    if (!given || !same(given, password)) {
      await new Promise((r) => setTimeout(r, 600));         // slows down guessing
      return c.json({ error: 'Złe hasło.' }, 401);
    }
    const until = Date.now() + SESSION_DAYS * 86400000;
    await setSignedCookie(c, COOKIE, String(until), secret, {
      httpOnly: true, sameSite: 'Lax', secure: !!o.secureCookies, path: '/', maxAge: SESSION_DAYS * 86400,
    });
    return c.json({ ok: true });
  });

  api.post('/logout', (c) => {
    deleteCookie(c, COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  // Connector for Claude chats: the secret token in the path stands in for the login.
  const connectorToken = mcpToken(secret);
  api.post('/mcp/:token', async (c) => {
    if (!same(c.req.param('token'), connectorToken)) return handleStaleMcp(c, o.crm);
    return handleMcp(c, o.crm);
  });
  // Opened in a browser, the address says whether it is the current one; MCP clients asking for a stream get 405.
  api.get('/mcp/:token', (c) => {
    if ((c.req.header('accept') || '').includes('text/event-stream')) return c.body(null, 405);
    const good = same(c.req.param('token'), connectorToken);
    const tools = Assistant.mcpTools().map((t) => t.name).sort();
    return c.html(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font:16px system-ui;padding:24px;max-width:720px">${good
      ? `<p>✅ To jest aktualny adres konektora Opal5. Wklej go w claude.ai → Settings → Connectors.</p>
        <p>Wersja narzędzi: <b>${TOOLS_VERSION}</b> · ${tools.length} narzędzi:</p><p style="line-height:1.8">${tools.map((t) => `<code>${t}</code>`).join(' ')}</p>
        <p style="color:#666">Jeśli Claude w czacie mówi, że któregoś nie ma — claude.ai trzyma starą listę: odłącz i podłącz konektor, sprawdź w czacie
        (ikona narzędzi → Opal5), czy nowe narzędzia są włączone, i zacznij nowy czat.</p>`
      : '❌ Ten adres konektora jest nieaktualny. Skopiuj nowy z Opal5 → Ustawienia → Claude.'}</body>`, good ? 200 : 404);
  });
  api.delete('/mcp/:token', (c) => c.body(null, 405));

  api.use('*', async (c, next) => {
    if (!(await authed(c))) return c.json({ error: 'Zaloguj się.' }, 401);
    await next();
  });

  const body = <T>(c: Context) => c.req.json<T>().catch(() => { throw new HttpError(400, 'Niepoprawne dane.'); });
  const num = (s: string) => {
    const n = Number(s);
    if (!Number.isInteger(n)) throw new HttpError(400, `Złe id: ${s}`);
    return n;
  };
  const crm = o.crm;

  /* ---- reads */
  api.get('/config', async (c) => c.json({ ...(await (await crm()).config()), assistant: !!process.env.ANTHROPIC_API_KEY, mail: mailEnabled() }));
  api.get('/dashboard', async (c) => c.json(await (await crm()).dashboard()));
  api.get('/leads', async (c) => c.json(await (await crm()).listLeads()));
  api.get('/leads/:id', async (c) => c.json(await (await crm()).leadCard(c.req.param('id'))));
  api.get('/activities', async (c) => c.json(await (await crm()).activities({
    open: c.req.query('open') === '1', from: c.req.query('from') || undefined, to: c.req.query('to') || undefined,
  })));
  api.get('/agenda', async (c) => c.json(await (await crm()).agenda(c.req.query('from') || '', c.req.query('to') || '')));
  api.get('/stats', async (c) => c.json(await (await crm()).stats()));
  api.get('/report', async (c) => c.json(await (await crm()).report(c.req.query('from'), c.req.query('to'))));
  api.get('/events', async (c) => c.json(await (await crm()).listEvents()));
  api.get('/tasks', async (c) => c.json(await (await crm()).listTasks()));
  api.get('/connector', async (c) => {
    const u = new URL(c.req.url);
    const host = c.req.header('x-forwarded-host') || u.host;
    const proto = c.req.header('x-forwarded-proto') || u.protocol.replace(':', '');
    return c.json({ url: `${proto}://${host}/api/mcp/${connectorToken}`, version: TOOLS_VERSION,
      tools: Assistant.mcpTools().map((t) => t.name).sort(), ...(await lastMcp(await crm())) });
  });
  /* ---- chats */
  const threads = async () => new Threads((await crm()).db);
  api.get('/threads', async (c) => c.json(await (await threads()).list()));
  api.post('/threads', async (c) => c.json(await (await threads()).create(await body(c))));
  api.get('/threads/:id', async (c) => c.json(await (await threads()).get(num(c.req.param('id')))));
  api.patch('/threads/:id', async (c) => c.json(await (await threads()).update(num(c.req.param('id')), await body(c))));
  api.delete('/threads/:id', async (c) => c.json(await (await threads()).remove(num(c.req.param('id')))));

  /* ---- studio */
  const designs = async () => new Designs((await crm()).db);
  const RUN_CSP = "sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads; default-src 'none'; " +
    "script-src 'unsafe-inline' 'unsafe-eval' https:; style-src 'unsafe-inline' https:; img-src * data: blob:; font-src https: data:; connect-src 'none'";
  api.get('/studio', async (c) => c.json(await (await designs()).list()));
  api.post('/studio', async (c) => {
    const d = await body<{ title?: string; kind?: string; fromKnowledge?: number; versions?: { html: string; note?: string }[]; chat?: { role: 'user' | 'assistant'; text: string }[] }>(c);
    const ds = await designs();
    return c.json(d.fromKnowledge ? await ds.fromKnowledge(await kb(), Number(d.fromKnowledge), d.kind) : await ds.create(d));
  });
  api.get('/studio/:id', async (c) => {
    const { containerId: _, ...d } = await (await designs()).get(num(c.req.param('id')));
    return c.json(d);
  });
  api.patch('/studio/:id', async (c) => c.json(await (await designs()).update(num(c.req.param('id')), await body(c))));
  api.delete('/studio/:id', async (c) => c.json(await (await designs()).remove(num(c.req.param('id')))));
  api.post('/studio/:id/restore', async (c) => c.json(await (await designs()).restore(num(c.req.param('id')), Number((await body<{ version: number }>(c)).version))));
  api.post('/studio/:id/message', async (c) => {
    const d = await body<{ text?: string; attachments?: number[] }>(c);
    const { containerId: _, ...r } = await new Assistant(await crm()).designTurn(await designs(), num(c.req.param('id')), d.text || '', d.attachments || []);
    return c.json(r);
  });
  /** The document itself: for the preview frame, full screen, printing to PDF, or download (?download=1). */
  api.get('/studio/:id/html', async (c) => {
    const v = c.req.query('v');
    const ds = await designs();
    const id = num(c.req.param('id'));
    const r = await ds.render(await kb(), id, v !== undefined ? Number(v) : undefined);
    const text = ['form', 'brief'].includes((await ds.get(id)).kind);   // a script or a brief is text, not a page
    const name = `${r.title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'projekt'}.${text ? ((await ds.get(id)).kind === 'form' ? 'gs' : 'txt') : 'html'}`;
    return c.body(r.html, 200, {
      'Content-Type': `${text ? 'text/plain' : 'text/html'}; charset=utf-8`,
      'Content-Disposition': `${c.req.query('download') ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Content-Security-Policy': RUN_CSP,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
  });
  /** Keeps the current version in the knowledge base, so the assistant and tasks can use it. */
  api.post('/studio/:id/save', async (c) => {
    const ds = await designs();
    const id = num(c.req.param('id'));
    const d = await ds.get(id);
    const html = d.versions[d.versions.length - 1]?.html;
    if (!html) throw new HttpError(400, 'Projekt jest jeszcze pusty.');
    const name = `${d.title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'projekt'}.html`;
    return c.json(await (await kb()).add({ title: d.title, filename: name, mime: 'text/html', data: new TextEncoder().encode(html),
      tags: 'narzędzie studio', description: `Ze Studio (${d.versions.length} wersji)` }));
  });

  api.get('/style', async (c) => c.json(await (await crm()).style()));
  api.put('/style', async (c) => c.json(await (await crm()).saveStyle(await body(c))));
  api.post('/style/learn', async (c) => {
    const d = await body<{ ids?: number[]; chats?: number[]; mode?: string }>(c);
    return c.json({ text: await new Assistant(await crm()).learnStyle((d.ids || []).map(Number),
      d.mode === 'casual' ? 'casual' : d.mode === 'project' ? 'project' : 'b2b', (d.chats || []).map(Number)) });
  });
  api.get('/people', async (c) => c.json(await (await crm()).listPeople()));
  api.get('/events/:id/assets', async (c) => c.json(await (await designs()).list({ eventId: c.req.param('id') })));
  api.get('/events/:id/people', async (c) => c.json(await (await crm()).eventPeople(c.req.param('id'))));
  api.post('/events/:id/people', async (c) => {
    const d = await body<{ personId?: number; role?: string }>(c);
    return c.json(await (await crm()).linkPersonEvent(c.req.param('id'), Number(d.personId), d.role || ''));
  });
  api.delete('/events/:id/people/:pid', async (c) => c.json(await (await crm()).unlinkPersonEvent(c.req.param('id'), num(c.req.param('pid')))));
  api.get('/help', async (c) => c.json(await (await crm()).findHelp(c.req.query('q') || '')));

  /* ---- procedures: editing here, creating and starting by voice (claude.ai) */
  const procs = async () => new Processes(await crm());
  api.get('/processes', async (c) => c.json(await (await procs()).list()));
  api.post('/processes', async (c) => {
    const d = await body<{ id?: number }>(c);
    if (!d.id) throw new HttpError(400, 'Nowe procedury zapisuje Claude — tu można je edytować.');
    return c.json(await (await procs()).save(d));
  });
  api.delete('/processes/:id', async (c) => c.json(await (await procs()).remove(num(c.req.param('id')))));
  api.get('/processes/suggestions', async (c) => c.json(await suggestProcesses(await crm())));
  api.get('/runs', async (c) => c.json(await (await procs()).runs({ all: c.req.query('all') === '1' })));
  api.post('/runs/:id/cancel', async (c) => c.json(await (await procs()).cancel(num(c.req.param('id')))));
  api.get('/people/:id/profile', async (c) => c.json(await personProfile(await crm(), num(c.req.param('id')))));
  api.get('/people/:id/work', async (c) => c.json(await (await procs()).personWork(num(c.req.param('id')))));

  /* ---- CALL REPORT (Plus call recording) */
  const stamp = () => new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });
  api.get('/reports/calls/config', async (c) => c.json({ ...(await getCallConfig(await crm())), ready: callReportReady(), mail: mailEnabled() }));
  api.put('/reports/calls/config', async (c) => c.json(await saveCallConfig(await crm(), await body(c))));
  api.post('/reports/calls/import', async (c) => {
    const d = await body<{ script?: string }>(c);
    return c.json(await saveCallConfig(await crm(), parseScriptConfig(String(d.script || ''))));
  });
  api.get('/reports/calls', async (c) => {
    const r = await callReport(await crm(), { from: c.req.query('from'), to: c.req.query('to') });
    return c.json({ report: r, html: callReportHtml(r, stamp()) });
  });
  api.post('/reports/calls/send', async (c) => {
    const d = await body<{ from?: string; to?: string }>(c);
    const k = await crm();
    const r = await callReport(k, { from: d.from, to: d.to });
    return c.json(await sendCallReport(k, r, callReportHtml(r, stamp())));
  });

  /* ---- B2C progress */
  const b2c = async () => { const k = await crm(); return new B2c(k.db, () => k.today()); };
  api.get('/b2c', async (c) => c.json(await (await b2c()).list()));
  api.post('/b2c', async (c) => c.json(await (await b2c()).save(await body(c))));
  api.delete('/b2c/:id', async (c) => c.json(await (await b2c()).remove(num(c.req.param('id')))));
  api.post('/b2c/:id/progress', async (c) => {
    const d = await body<{ delta?: number; note?: string; day?: string }>(c);
    return c.json(await (await b2c()).progress(num(c.req.param('id')), Number(d.delta) || 0, d.note || '', d.day));
  });
  api.get('/b2c/:id/log', async (c) => c.json(await (await b2c()).log(num(c.req.param('id')))));
  api.get('/segments', async (c) => c.json(await (await crm()).listSegments()));
  api.get('/templates', async (c) => c.json(await (await crm()).listTemplates()));
  api.get('/duplicates', async (c) => c.json(await (await crm()).duplicates()));
  api.get('/leads/:id/template/:code', async (c) =>
    c.json(await (await crm()).renderTemplate(c.req.param('id'), c.req.param('code'))));

  /* ---- leads */
  api.post('/leads', async (c) => c.json(await (await crm()).createLead(await body(c)), 201));
  api.post('/leads/bulk', async (c) => c.json(await (await crm()).bulk(await body(c))));
  api.patch('/leads/:id', async (c) => c.json(await (await crm()).updateLead(c.req.param('id'), await body(c))));
  api.delete('/leads/:id', async (c) => c.json(await (await crm()).deleteLead(c.req.param('id'))));
  api.post('/leads/:id/stage', async (c) => {
    const d = await body<{ stage: string; reason?: string }>(c);
    return c.json(await (await crm()).setStage(c.req.param('id'), d.stage, d.reason));
  });
  api.post('/leads/:id/activities', async (c) => c.json(await (await crm()).logActivity(c.req.param('id'), await body(c))));

  /* ---- activities */
  api.post('/activities/:id/complete', async (c) =>
    c.json(await (await crm()).completeActivity(num(c.req.param('id')), await body(c))));
  api.patch('/activities/:id', async (c) => c.json(await (await crm()).updateActivity(num(c.req.param('id')), await body(c))));
  api.delete('/activities/:id', async (c) => c.json(await (await crm()).deleteActivity(num(c.req.param('id')))));

  /* ---- events & tasks */
  api.post('/events', async (c) => c.json(await (await crm()).saveEvent(await body(c))));
  api.delete('/events/:id', async (c) => c.json(await (await crm()).deleteEvent(c.req.param('id'))));
  api.post('/tasks', async (c) => c.json(await (await crm()).saveTask(await body(c))));
  api.post('/tasks/:id/toggle', async (c) => c.json(await (await crm()).toggleTask(c.req.param('id'))));
  api.delete('/tasks/:id', async (c) => c.json(await (await crm()).deleteTask(c.req.param('id'))));
  api.post('/people', async (c) => c.json(await (await crm()).savePerson(await body(c))));
  api.delete('/people/:id', async (c) => c.json(await (await crm()).deletePerson(Number(c.req.param('id')))));
  api.post('/people/:id/touch', async (c) => c.json(await (await crm()).touchPerson(Number(c.req.param('id')))));

  /* ---- playbook */
  api.post('/segments', async (c) => c.json(await (await crm()).saveSegment(await body(c))));
  api.delete('/segments/:name', async (c) => c.json(await (await crm()).deleteSegment(c.req.param('name'))));
  api.post('/templates', async (c) => c.json(await (await crm()).saveTemplate(await body(c))));
  api.delete('/templates/:code', async (c) => c.json(await (await crm()).deleteTemplate(c.req.param('code'))));

  /* ---- assistant: proposals first, writes only after the user approves */
  api.post('/report/summary', async (c) => {
    const d = await c.req.json().catch(() => ({}));
    const k = await crm();
    if (!process.env.ANTHROPIC_API_KEY) {         // no assistant: the notes still make it into the report
      const rep = await k.report(d.from || undefined, d.to || undefined);
      return c.json({ ...rep, summary: '', text: withSummary(rep.text, String(d.notes || ''), 'NOTES') });
    }
    return c.json(await new Assistant(k).reportWithSummary(d.from || undefined, d.to || undefined, String(d.notes || '')));
  });
  api.post('/assistant', async (c) => {
    const d = await body<{ text: string; history?: AssistantTurn[]; leadId?: string; image?: { mediaType: string; data: string };
      spoken?: boolean; attachments?: number[]; containerId?: string; threadId?: number }>(c);
    return c.json(await new Assistant(await crm()).ask(d.text || '', Array.isArray(d.history) ? d.history : [],
      { leadId: d.leadId, image: d.image || null, spoken: !!d.spoken, attachments: Array.isArray(d.attachments) ? d.attachments : [],
        containerId: typeof d.containerId === 'string' ? d.containerId : undefined, threadId: Number(d.threadId) || undefined }));
  });
  api.post('/assistant/execute', async (c) => {
    const d = await body<{ items: { tool: string; input: Record<string, unknown> }[] }>(c);
    if (!Array.isArray(d.items) || !d.items.length) throw new HttpError(400, 'Nic do zatwierdzenia.');
    const k = await crm();
    return c.json(await new Assistant(k, process.env.ANTHROPIC_API_KEY || 'unused').execute(d.items.slice(0, 20)));
  });

  /* ---- knowledge base */
  const kb = async () => new Knowledge((await crm()).db);
  api.get('/knowledge', async (c) => c.json(await (await kb()).list()));
  api.get('/knowledge/:id', async (c) => c.json(await (await kb()).get(num(c.req.param('id')))));
  api.post('/knowledge', async (c) => {
    const k = await kb();
    if ((c.req.header('content-type') || '').includes('multipart/form-data')) {
      const form = await c.req.formData();
      const f = form.get('file');
      if (!(f instanceof File)) throw new HttpError(400, 'Dołącz plik.');
      if (f.size > MAX_FILE) throw new HttpError(400, 'Plik jest za duży (maks. 4 MB).');
      return c.json(await k.add({ title: String(form.get('title') || ''), filename: f.name, mime: f.type,
        data: new Uint8Array(await f.arrayBuffer()), description: String(form.get('description') || ''), tags: String(form.get('tags') || '') }), 201);
    }
    const d = await body<{ title?: string; text?: string; description?: string; tags?: string }>(c);
    return c.json(await k.add(d), 201);
  });
  api.patch('/knowledge/:id', async (c) => c.json(await (await kb()).update(num(c.req.param('id')), await body(c))));
  api.delete('/knowledge/:id', async (c) => c.json(await (await kb()).remove(num(c.req.param('id')))));
  api.get('/knowledge/:id/file', async (c) => {
    const f = await (await kb()).file(num(c.req.param('id')));
    const inline = c.req.query('inline') === '1';
    const headers: Record<string, string> = {
      'Content-Type': f.mime || 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    };
    // generated HTML is previewed in a sandbox: no scripts, no access to the CRM's cookies or API
    // ?run=1 lets an HTML tool (a calculator, templates page from Claude) run its scripts — still in a sandbox
    // with an opaque origin, so it cannot read the CRM's cookies or call its API.
    if (/html/.test(f.mime)) {
      headers['Content-Security-Policy'] = inline && c.req.query('run') === '1'
        ? "sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads; default-src 'none'; " +
          "script-src 'unsafe-inline' 'unsafe-eval' https:; style-src 'unsafe-inline' https:; img-src * data: blob:; font-src https: data:; connect-src 'none'"
        : 'sandbox; default-src \'none\'; img-src * data:; style-src \'unsafe-inline\' *; font-src *';
    }
    return c.body(f.data as unknown as ArrayBuffer, 200, headers);
  });

  /* ---- data */
  api.get('/export.xlsx', async (c) => {
    const k = await crm();
    const buf = await exportWorkbook(k);
    return c.body(new Uint8Array(buf), 200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="CRM_B2B_${k.today()}.xlsx"`,
    });
  });
  api.post('/import', async (c) => {
    const form = await c.req.formData();
    const f = form.get('file');
    if (!(f instanceof File)) throw new HttpError(400, 'Dołącz plik .xlsx.');
    if (form.get('confirm') !== 'REPLACE') throw new HttpError(400, 'Import zastępuje wszystkie dane — potwierdź.');
    const k = await crm();
    try {
      return c.json(await importWorkbook(k.db, new Uint8Array(await f.arrayBuffer()), k.today(), k.owner));
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : String(e));
    }
  });

  const app = new Hono();
  app.route('/api', api);
  return app;
}
