import { Hono, type Context } from 'hono';
import { getSignedCookie, setSignedCookie, deleteCookie } from 'hono/cookie';
import { compress } from 'hono/compress';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Crm, HttpError } from './crm.ts';
import { importWorkbook, exportWorkbook } from './spreadsheet.ts';

export interface AppOptions {
  crm: Crm;
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

export function createApp(o: AppOptions) {
  const { crm } = o;
  const password = o.password || '';
  const secret = o.secret || createHash('sha256').update('crm:' + password).digest('hex');
  const api = new Hono();

  api.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status as 400);
    console.error(err);
    return c.json({ error: err instanceof Error ? err.message : 'Server error' }, 500);
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
      return c.json({ error: 'Wrong password.' }, 401);
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
    if (!(await authed(c))) return c.json({ error: 'Not signed in.' }, 401);
    await next();
  });

  const body = <T>(c: Context) => c.req.json<T>().catch(() => { throw new HttpError(400, 'Invalid JSON body.'); });
  const num = (s: string) => {
    const n = Number(s);
    if (!Number.isInteger(n)) throw new HttpError(400, `Bad id: ${s}`);
    return n;
  };

  /* ---- reads */
  api.get('/config', (c) => c.json(crm.config()));
  api.get('/today', (c) => c.json(crm.todayView()));
  api.get('/leads', (c) => c.json(crm.listLeads()));
  api.get('/leads/:id', (c) => c.json(crm.leadCard(c.req.param('id'))));
  api.get('/agenda', (c) => c.json(crm.agenda(c.req.query('from') || '', c.req.query('to') || '')));
  api.get('/stats', (c) => c.json(crm.stats()));
  api.get('/report', (c) => c.json(crm.report(c.req.query('from'), c.req.query('to'))));
  api.get('/events', (c) => c.json(crm.listEvents()));
  api.get('/tasks', (c) => c.json(crm.listTasks()));
  api.get('/segments', (c) => c.json(crm.listSegments()));
  api.get('/templates', (c) => c.json(crm.listTemplates()));
  api.get('/duplicates', (c) => c.json(crm.duplicates()));
  api.get('/leads/:id/template/:code', (c) => c.json(crm.renderTemplate(c.req.param('id'), c.req.param('code'))));

  /* ---- leads */
  api.post('/leads', async (c) => c.json(crm.createLead(await body(c)), 201));
  api.patch('/leads/:id', async (c) => c.json(crm.updateLead(c.req.param('id'), await body(c))));
  api.delete('/leads/:id', (c) => c.json(crm.deleteLead(c.req.param('id'))));
  api.post('/leads/:id/stage', async (c) => {
    const d = await body<{ stage: string; reason?: string }>(c);
    return c.json(crm.setStage(c.req.param('id'), d.stage, d.reason));
  });
  api.post('/leads/:id/activities', async (c) => c.json(crm.logActivity(c.req.param('id'), await body(c))));

  /* ---- activities */
  api.post('/activities/:id/complete', async (c) => c.json(crm.completeActivity(num(c.req.param('id')), await body(c))));
  api.patch('/activities/:id', async (c) => c.json(crm.updateActivity(num(c.req.param('id')), await body(c))));
  api.delete('/activities/:id', (c) => c.json(crm.deleteActivity(num(c.req.param('id')))));

  /* ---- events & tasks */
  api.post('/events', async (c) => c.json(crm.saveEvent(await body(c))));
  api.delete('/events/:id', (c) => c.json(crm.deleteEvent(c.req.param('id'))));
  api.post('/tasks', async (c) => c.json(crm.saveTask(await body(c))));
  api.post('/tasks/:id/toggle', (c) => c.json(crm.toggleTask(c.req.param('id'))));
  api.delete('/tasks/:id', (c) => c.json(crm.deleteTask(c.req.param('id'))));

  /* ---- playbook */
  api.post('/segments', async (c) => c.json(crm.saveSegment(await body(c))));
  api.delete('/segments/:name', (c) => c.json(crm.deleteSegment(c.req.param('name'))));
  api.post('/templates', async (c) => c.json(crm.saveTemplate(await body(c))));
  api.delete('/templates/:code', (c) => c.json(crm.deleteTemplate(c.req.param('code'))));

  /* ---- data */
  api.get('/export.xlsx', (c) => {
    const buf = exportWorkbook(crm);
    return c.body(new Uint8Array(buf), 200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="CRM_B2B_${crm.today()}.xlsx"`,
    });
  });
  api.post('/import', async (c) => {
    const form = await c.req.formData();
    const f = form.get('file');
    if (!(f instanceof File)) throw new HttpError(400, 'Attach an .xlsx file.');
    if (form.get('confirm') !== 'REPLACE') throw new HttpError(400, 'Import replaces all data — confirm first.');
    try {
      const rep = importWorkbook(crm.db, new Uint8Array(await f.arrayBuffer()), crm.today(), crm.owner);
      return c.json(rep);
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : String(e));
    }
  });

  const app = new Hono();
  app.use('/api/*', compress());
  app.route('/api', api);
  return app;
}
