# B2B CRM

CRM do partnerstw B2B: pulpit dnia, zadania, lejek (kanban), baza firm z widokami,
karta firmy z historią i pitchem, kalendarz, wydarzenia z checklistą, raporty
i raport tygodniowy. Zastępuje wersję z Google Apps Script + Sheets: te same dane,
etapy, wzór priorytetu i raport, ale na prawdziwej bazie danych.

Działa na telefonie: dolne menu, duże przyciski, okna jako panele od dołu. Można go
dodać do ekranu głównego („Dodaj do ekranu głównego” w Chrome).

## Uruchomienie na Vercel (z telefonu)

1. **Vercel → Add New → Project → Import** repozytorium `Maupally/CRM`.
   - Application Preset / Framework: **Vite** (w repo jest `vercel.json`, więc i tak ustawi się samo).
   - Root Directory: `./`. Build i Output zostaw domyślne (`npm run build`, `dist`).
2. **Baza danych**: w projekcie **Storage → Create Database → Neon** (albo **Supabase**) → **Connect**.
   Vercel sam doda zmienną `DATABASE_URL` / `POSTGRES_URL`. Tabele tworzą się same przy pierwszym wejściu —
   nie trzeba nic uruchamiać w SQL Editorze. Wszystkie tabele są w schemacie `crm`, więc CRM może też
   współdzielić bazę z innym projektem.
3. **Settings → Environment Variables**:
   - `APP_PASSWORD` — hasło do CRM (**obowiązkowo**, w bazie są prawdziwe kontakty),
   - `OWNER` — imię w raporcie (domyślnie `Martin`),
   - `ANTHROPIC_API_KEY` — klucz z console.anthropic.com, włącza asystenta głosowego,
   - opcjonalnie `SESSION_SECRET` — dowolny długi ciąg znaków.
4. **Deployments → Redeploy**.
5. Wejdź na adres projektu, zaloguj się, **Ustawienia → Dane → Import z arkusza** i wgraj .xlsx
   (w Google Sheets: Plik → Pobierz → Microsoft Excel).

Każdy push na gałąź daje podgląd (Preview), push na gałąź produkcyjną — wersję produkcyjną.

## Asystent głosowy

Niebieski przycisk z mikrofonem (prawy dolny róg). Mówisz po polsku, np.:

- „Dzwoniłem do Cichoń Dressage, nie odebrali, spróbuj w piątek.”
- „Muszę się z nimi umówić w przyszłym tygodniu.”
- „Dodaj firmę Kowalski Logistyka z Gliwic, telefon 600 100 200.”
- „Decyduje pani Celina, najlepiej dzwonić rano” — trafia do notatek firmy.
- „Jak zagadać do tej firmy?” — ściąga do rozmowy z Playbooka, notatek i historii.
- „Co mam dziś do zrobienia?”

Asystent szuka firm w bazie (radzi sobie z przekręconymi nazwami), a każdą zmianę pokazuje jako
kartę do zatwierdzenia — skrót rozmowy i daty można poprawić przed zapisem. Bez zatwierdzenia nic
się nie zapisuje. Na karcie firmy „ta firma” oznacza otwartą firmę. Działa na Claude Opus 5
(`server/assistant.ts`); rozpoznawanie mowy robi przeglądarka (Chrome na Androidzie, Safari).

## Co się zmieniło względem wersji z Sheets

- **Jedno źródło prawdy.** „Ostatni / Następny kontakt” liczą się z historii aktywności, a nie są
  trzymane w dwóch miejscach — nie mogą się już rozjechać.
- **Zmiany etapu są zapisane jako dane**, a nie wyciągane z tekstu notatki.
- **Zamknięcie firmy** (partner / odrzucona) anuluje otwarte follow-upy zamiast oznaczać je jako zrobione.
- **Brak zduplikowanych ID** i kolumn z formułami, które dało się zepsuć.
- **Po rozmowie jeden formularz**: co się wydarzyło, etap (sam albo ręcznie) i następny krok.
- **Kopia = stary arkusz.** Eksport daje .xlsx z tymi samymi zakładkami i kolumnami.

## Ekrany

| | |
|---|---|
| **Pulpit** | zaległe i dzisiejsze zadania, kolejka telefonów, lejek, wydarzenia |
| **Zadania** | widoki: dziś i zaległe / nadchodzące / wszystkie / zrobione; filtr po typie |
| **Lejek** | tablica kanban — przeciągnij kartę albo użyj menu ⋯ na telefonie |
| **Firmy** | zapisane widoki (kolejka, w grze, zaległe, bez kroku, partnerzy…), filtry, akcje grupowe |
| **Karta firmy** | ścieżka etapów, szybkie akcje, zapis aktywności, następny krok, historia, pitch, szablony |
| **Kalendarz** | tydzień / 2 tygodnie: aktywności, wydarzenia, zadania |
| **Wydarzenia** | wydarzenia z checklistą przygotowań |
| **Raporty** | aktywność 30 dni, lejek, segmenty, raport tygodniowy do wysłania |
| **Ustawienia** | Playbook (segmenty i pitch), szablony, import / eksport, duplikaty |

Skróty: `/` lub `Ctrl+K` — szukaj firmy; `Ctrl+Enter` — zapisz aktywność.

## Lokalnie

Node 22. Bez `DATABASE_URL` używa wbudowanego Postgresa (PGlite) w `data/pglite` — nic nie trzeba instalować.

```bash
npm install
npm run import -- CRM_B2B.xlsx
npm run dev                        # http://localhost:5173
npm run typecheck && npm test
```

Docker / VPS: `docker build -t b2b-crm . && docker run -p 3000:3000 -e DATABASE_URL=… -e APP_PASSWORD=… b2b-crm`.

## Struktura

```
shared/domain.ts       etapy, reguły (priorytet, auto-etap), normalizacja, polskie etykiety
server/crm.ts          wszystkie odczyty i zapisy
server/db.ts           Postgres (serwer) albo PGlite (lokalnie), schemat `crm`
server/report.ts       raport tygodniowy
server/spreadsheet.ts  import / eksport .xlsx
server/app.ts          API + logowanie
api/index.ts           funkcja Vercel
src/                   interfejs (React)
```
