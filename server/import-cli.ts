/** npm run import -- path/to/CRM_B2B.xlsx   (replaces everything in the database) */
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from './db.ts';
import { importWorkbook } from './spreadsheet.ts';
import { isoDay } from '../shared/domain.ts';

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error('Usage: npm run import -- path/to/file.xlsx');
  process.exit(1);
}
const dbFile = process.env.DB_FILE || path.resolve('data/crm.sqlite');
const db = openDb(dbFile);
const rep = importWorkbook(db, fs.readFileSync(file), isoDay(), process.env.OWNER || 'Martin');
console.log(`Imported into ${dbFile}:`);
console.log(`  leads ${rep.leads} · activities ${rep.activities} · follow-ups carried over ${rep.carriedOver}`);
console.log(`  segments ${rep.segments} · templates ${rep.templates} · events ${rep.events} · tasks ${rep.tasks}`);
if (rep.skippedActivities) console.log(`  skipped ${rep.skippedActivities} history rows (no matching lead or date)`);
for (const w of rep.warnings) console.log('  ! ' + w);
