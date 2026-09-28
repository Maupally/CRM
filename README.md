# B2B CRM

Calling console, pipeline, calendar, events and weekly report for B2B partnerships.
Replaces the Google Apps Script + Sheets version: same data, same stages, same
priority formula, same report — but on a real database, with a fast UI.

## What's different from the Sheets version

- **One source of truth.** "Last contact" and "Next contact" are derived from the
  activity log, not stored twice, so they can never disagree with it.
- **Stage changes are structured**, not parsed out of note text. The report's
  "disqualified" list reads them directly.
- **Closing a lead** (active / disqualified) cancels its open follow-ups instead of
  marking them "done".
- **No duplicate IDs**, no formula columns to break, no 6-second round trips.
- **After a call, one form** records what happened, moves the stage (auto or by
  hand) and books the next step. A missed call pre-fills "try again".
- **Backup = the old sheet.** Data → Download .xlsx gives the same tabs and columns,
  ready to open in Google Sheets.

## Screens

| | |
|---|---|
| **Today** | overdue and due follow-ups, next 7 days, call queue by priority, event tasks |
| **Leads** | filter by stage, segment, city, contact data, follow-up; sort; search (`/` finds any company) |
| **Lead** | log / plan activity, timeline (tick off, edit, reschedule, delete), pitch from the playbook, notes, email templates with `[Firma]` / `[Miasto]` / `[Osoba]` filled in |
| **Calendar** | week or two, activities + events + tasks |
| **Events** | events with a task checklist each |
| **Stats** | 30-day outreach chart, pipeline, per-segment table (the old Dashboard tab) |
| **Report** | weekly report as plain text, copy or email |
| **Playbook** | segments (weight, pitch, objections) and templates |
| **Data** | xlsx export / import, duplicate check |

## Run locally

Node 22.13+ (uses the built-in `node:sqlite`, nothing to compile).

```bash
npm install
npm run import -- CRM_B2B.xlsx     # the sheet: File → Download → Microsoft Excel
npm run dev                        # http://localhost:5173
```

Production build: `npm run build && APP_PASSWORD=… npm start` (serves on `PORT`, default 3000).

## Deploy

Any host that runs a Docker container with a persistent volume (Railway, Fly.io,
Render, a VPS):

```bash
docker build -t b2b-crm .
docker run -p 3000:3000 -v crm-data:/data -e APP_PASSWORD=… -e SECURE_COOKIES=1 b2b-crm
```

The database is one file, `/data/crm.sqlite`. First run is empty: open **Data** and
import the xlsx, or copy a `crm.sqlite` into the volume.

**Always set `APP_PASSWORD`** — the base holds real contact data.

## Checks

```bash
npm run typecheck
npm test
```

## Layout

```
shared/domain.ts     stages, rules (priority, auto-stage), normalisation — used by both sides
server/crm.ts        all reads and writes
server/report.ts     weekly report
server/spreadsheet.ts  xlsx import / export
server/app.ts        HTTP API + login
src/                 React UI
```
