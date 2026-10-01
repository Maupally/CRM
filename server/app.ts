import { Hono, type Context } from 'hono';
import { getSignedCookie, setSignedCookie, deleteCookie } from 'hono/cookie';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Crm, HttpError } from './crm.js';
import { openDb } from './db.js';
import { importWorkbook, exportWorkbook } from './spreadsheet.js';
import { Assistant, withSummary, type AssistantTurn } from './assistant.js';
import { Knowledge, MAX_FILE } from './knowledge.js';
import { mailEnabled } from './mail.js';

export interface AppOptions {
  /** Called on the first request; the result is reused afterwards. */
  crm: () => Promise<Crm>;
  /** When empty, the app runs without a login (local use only). */
  password?: string;
  secret?: string;
  secureCookies?: boolean;
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
      spoken?: boolean; attachments?: number[]; containerId?: string }>(c);
    return c.json(await new Assistant(await crm()).ask(d.text || '', Array.isArray(d.history) ? d.history : [],
      { leadId: d.leadId, image: d.image || null, spoken: !!d.spoken, attachments: Array.isArray(d.attachments) ? d.attachments : [],
        containerId: typeof d.containerId === 'string' ? d.containerId : undefined }));
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
    if (/html/.test(f.mime)) headers['Content-Security-Policy'] = 'sandbox; default-src \'none\'; img-src * data:; style-src \'unsafe-inline\' *; font-src *';
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
