import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from './db.ts';
import { Crm } from './crm.ts';
import { createApp } from './app.ts';

const DB_FILE = process.env.DB_FILE || path.resolve('data/crm.sqlite');
const PORT = Number(process.env.PORT) || 3000;
const PASSWORD = process.env.APP_PASSWORD || '';
const OWNER = process.env.OWNER || 'Martin';

if (!PASSWORD) {
  console.warn('! APP_PASSWORD is not set — the CRM is open to anyone who can reach it. Fine on localhost only.');
}

const crm = new Crm(openDb(DB_FILE), OWNER);
const app = createApp({
  crm,
  password: PASSWORD,
  secret: process.env.SESSION_SECRET,
  secureCookies: process.env.SECURE_COOKIES === '1',
});

// the built frontend, with every non-API path falling back to index.html
const dist = path.resolve('dist');
if (fs.existsSync(dist)) {
  app.use('/assets/*', serveStatic({ root: './dist' }));
  app.use('/*', serveStatic({ root: './dist' }));
  app.get('*', (c) => c.html(fs.readFileSync(path.join(dist, 'index.html'), 'utf8')));
}

serve({ fetch: app.fetch, port: PORT }, () => {
  const n = crm.listLeads().length;
  console.log(`CRM on http://localhost:${PORT}  ·  ${DB_FILE}  ·  ${n} leads`);
  if (!n) console.log('  Empty database. Import your sheet: npm run import -- path/to/CRM.xlsx');
});
