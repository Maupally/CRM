import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export type DB = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS segments (
  name        TEXT PRIMARY KEY,
  weight      REAL NOT NULL DEFAULT 1,
  goal        TEXT NOT NULL DEFAULT '',
  who         TEXT NOT NULL DEFAULT '',
  opening     TEXT NOT NULL DEFAULT '',
  hook        TEXT NOT NULL DEFAULT '',
  offer       TEXT NOT NULL DEFAULT '',
  cta         TEXT NOT NULL DEFAULT '',
  objections  TEXT NOT NULL DEFAULT '',
  why         TEXT NOT NULL DEFAULT '',
  sort        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS templates (
  code      TEXT PRIMARY KEY,
  kind      TEXT NOT NULL DEFAULT '',
  segments  TEXT NOT NULL DEFAULT '',
  subject   TEXT NOT NULL DEFAULT '',
  body      TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS leads (
  id           TEXT PRIMARY KEY,
  segment      TEXT NOT NULL DEFAULT 'NIEZNANA',
  company      TEXT NOT NULL,
  company_key  TEXT NOT NULL,
  industry     TEXT NOT NULL DEFAULT '',
  city         TEXT NOT NULL DEFAULT '',
  phone        TEXT NOT NULL DEFAULT '',
  email        TEXT NOT NULL DEFAULT '',
  web          TEXT NOT NULL DEFAULT '',
  person       TEXT NOT NULL DEFAULT '',
  stage        TEXT NOT NULL DEFAULT 'new',
  notes        TEXT NOT NULL DEFAULT '',
  extra        TEXT NOT NULL DEFAULT '',
  source       TEXT NOT NULL DEFAULT '',
  -- "Ostatni kontakt" from the sheet for contacts that were never logged
  legacy_last_contact TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS leads_key   ON leads(company_key);
CREATE INDEX IF NOT EXISTS leads_stage ON leads(stage);

-- The one source of truth for what happened and what is planned.
-- Last/next contact on a lead are derived from here, never stored twice.
CREATE TABLE IF NOT EXISTS activities (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id     TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  type        TEXT NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  owner       TEXT NOT NULL DEFAULT '',
  result      TEXT NOT NULL,
  stage_from  TEXT NOT NULL DEFAULT '',
  stage_to    TEXT NOT NULL DEFAULT '',
  legacy_id   TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS act_lead   ON activities(lead_id, result, date);
CREATE INDEX IF NOT EXISTS act_result ON activities(result, date);
CREATE INDEX IF NOT EXISTS act_date   ON activities(date);

CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'Other',
  date        TEXT NOT NULL,
  time        TEXT NOT NULL DEFAULT '',
  lead_id     TEXT NOT NULL DEFAULT '',
  company     TEXT NOT NULL DEFAULT '',
  location    TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'planned',
  owner       TEXT NOT NULL DEFAULT '',
  cost        TEXT NOT NULL DEFAULT '',
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id         TEXT PRIMARY KEY,
  event_id   TEXT NOT NULL DEFAULT '',
  task       TEXT NOT NULL,
  owner      TEXT NOT NULL DEFAULT '',
  due        TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'todo',
  notes      TEXT NOT NULL DEFAULT '',
  completed  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS tasks_event ON tasks(event_id);

CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
`;

export function openDb(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  return db;
}

/** Runs fn inside a transaction; rolls back on any error. */
export function tx<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
