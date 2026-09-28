/** Local / Docker server: the API plus the built frontend from dist/. On Vercel, api/index.ts is used instead. */
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { compress } from 'hono/compress';
import fs from 'node:fs';
import path from 'node:path';
import { appFromEnv } from './app.js';
import { databaseUrl } from './db.js';

const PORT = Number(process.env.PORT) || 3000;

if (!process.env.APP_PASSWORD) {
  console.warn('! APP_PASSWORD nie ustawione — CRM jest otwarty dla każdego. OK tylko lokalnie.');
}

const app = appFromEnv();
app.use('/api/*', compress());

const dist = path.resolve('dist');
if (fs.existsSync(dist)) {
  app.use('/*', serveStatic({ root: './dist' }));
  app.get('*', (c) => c.html(fs.readFileSync(path.join(dist, 'index.html'), 'utf8')));
}

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`CRM: http://localhost:${PORT}  ·  baza: ${databaseUrl() ? 'Postgres (DATABASE_URL)' : 'lokalna (data/pglite)'}`);
});
