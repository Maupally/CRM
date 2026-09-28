/**
 * npm run import -- path/to/CRM_B2B.xlsx   (replaces everything in the database)
 * Uses DATABASE_URL when set, otherwise the local database in data/pglite.
 */
import fs from 'node:fs';
import { openDb } from './db.js';
import { importWorkbook } from './spreadsheet.js';
import { isoDay } from '../shared/domain.js';

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error('Użycie: npm run import -- plik.xlsx');
  process.exit(1);
}
const db = await openDb();
const rep = await importWorkbook(db, fs.readFileSync(file), isoDay(), process.env.OWNER || 'Martin');
console.log(`Zaimportowano: firmy ${rep.leads} · aktywności ${rep.activities} · follow-upy z arkusza ${rep.carriedOver}`);
console.log(`  segmenty ${rep.segments} · szablony ${rep.templates} · wydarzenia ${rep.events} · zadania ${rep.tasks}`);
if (rep.skippedActivities) console.log(`  pominięto ${rep.skippedActivities} wierszy historii (brak firmy albo daty)`);
for (const w of rep.warnings) console.log('  ! ' + w);
await db.close();
