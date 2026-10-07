# Opal5

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
   - opcjonalnie `SESSION_SECRET` — dowolny długi ciąg znaków,
   - opcjonalnie `RESEND_API_KEY` + `MAIL_FROM` (np. `Martin <martin@twojadomena.pl>`, domena
     zweryfikowana w resend.com) i `MAIL_REPLY_TO` — wtedy maile do grup firm wysyła sam CRM.
     Bez tego asystent przygotuje adresy (UDW) i treść do wklejenia w swojej poczcie.
4. **Deployments → Redeploy**.
5. Wejdź na adres projektu, zaloguj się, **Ustawienia → Dane → Import z arkusza** i wgraj .xlsx
   (w Google Sheets: Plik → Pobierz → Microsoft Excel).

Każdy push na gałąź daje podgląd (Preview), push na gałąź produkcyjną — wersję produkcyjną.

## Asystent głosowy

Niebieski przycisk z mikrofonem (prawy dolny róg). Mówisz po polsku, asystent szuka firm w bazie
(radzi sobie z przekręconymi nazwami) i każdą zmianę pokazuje jako kartę do zatwierdzenia — skrót,
notatkę, daty i treść maila można poprawić przed zapisem. Bez zatwierdzenia nic się nie zapisuje.

- **Polecenia**: „Dzwoniłem do Cichoń, nie odebrali, spróbuj w piątek”, „Muszę się z nimi umówić
  w przyszłym tygodniu”, „Dodaj firmę Kowalski Logistyka z Gliwic…”, „Decyduje pani Celina”.
- **Relacja z rozmowy**: dłuższe nagranie (pauzy nie przerywają). Asystent wyciąga ustalenia, osobę
  decyzyjną, dane kontaktowe, następny krok i — jeśli padła obietnica — szkic maila.
- **Briefing**: co dziś, w jakiej kolejności i jedno zdanie przypomnienia o każdej firmie.
- **Tryb głośnomówiący** (np. w samochodzie): czyta odpowiedzi na głos i słucha dalej;
  „zatwierdź” / „odrzuć” / „popraw datę na środę” mówione głosem.
- **Jak zagadać**: ściąga do rozmowy z Playbooka, notatek i historii firmy.
- **Mail**: „wyślij im podsumowanie” — szkic z szablonu, otwierany w poczcie, zapisywany w historii.
- **Wizytówka**: zdjęcie aparatem → nowa firma z osobą i kontaktem.
- **Pytania o bazę**: „które stadniny z Katowic mają telefon, a nikt do nich nie dzwonił?”,
  potem „zaplanuj im telefony na przyszły tydzień” — rozłoży równo na dni robocze.
- **Raport i wydarzenia**: „zrób raport tygodniowy”, „bieg Terry'ego Foxa jest potwierdzony”.

- **Projekty i zadania**: wydarzenia to projekty z listą zadań („wrzuć mi na dziś przygotowanie
  tekstów na bieg”). Asystent od razu pisze gotowe materiały (tekst dla nauczycieli, post, SMS do
  rodziców) i podpina pliki z Bazy wiedzy (np. plakat). „Zrobione”, „przesuń na jutro”,
  „co mi zostało w projekcie X” — odhacza i przesuwa. Widok: **Zadania → Projekty**.
- **Mail do grupy**: „wyślij zaproszenie na bieg do szkół i przedszkoli” — lista odbiorców z bazy,
  temat i treść do poprawienia, załączniki. Ostrzega, gdy wśród odbiorców są firmy bez wcześniejszego
  kontaktu (masowy mail bez zgody = niezamówiona informacja handlowa). Ten sam mail nie pójdzie
  dwa razy pod jeden adres w tej samej kampanii.
- **Pliki (📎)**: wrzuć PDF, Worda albo zdjęcie i powiedz, co zrobić — „dodaj kod QR do zapisów
  w prawym dolnym rogu”, „zrób do tego stronę www w HTML”, „streść”. Gotowe pliki wracają w czacie
  i lądują w Bazie wiedzy (podgląd, pobieranie). Rozmowa zostaje po zamknięciu — „Nowa rozmowa” czyści.

## Przeniesienie z Claude i styl pisania

Wszystko dzieje się w Opal5. Wiedzę z projektu „Maple Bear” przenosisz raz:
1. claude.ai → Ustawienia → Prywatność → **Eksportuj dane**; z maila pobierz plik .zip.
2. **Baza wiedzy → Przenieś z Claude** → wybierz plik, zaznacz projekt i czaty (B2B, conversation,
   templates). Plik czyta przeglądarka; do CRM trafiają tylko zaznaczone rzeczy: dokumenty projektu,
   jego instrukcje, rozmowy (jako notatki) i artefakty HTML (jako narzędzia, np. kalkulator).
3. **Ustawienia → Styl pisania → Ucz się z czatów**: asystent czyta wybrane rozmowy i zapisuje
   zasady pisania — osobno maile B2B i rozmowy swobodne (rodzice, nauczyciele).

(Dodatkowo `/api/mcp/<token>` to konektor MCP dla claude.ai — opcjonalny, nieużywany w UI.)

## Internet

Asystent w CRM sam szuka w internecie, gdy pytasz „co to za firma”, podajesz adres e-mail albo
domenę, albo mówisz „sprawdź w internecie…” (web search + otwieranie stron).

## Narzędzia HTML

Artefakt z czatu Claude (np. kalkulator, strona z szablonami) pobierz jako .html i wgraj do Bazy
wiedzy — pojawi się w „Narzędziach” i działa w CRM (w piaskownicy, bez dostępu do danych CRM).

## Zespół

**Więcej → Zespół** (`/zespol`): dyrekcja, koordynatorzy, nauczyciele — imię, funkcja, e-mail, telefon
i jak ich nazywasz („dyrektor”, „Patryk”). Asystent sprawdza tę listę, gdy w poleceniu pada imię
albo funkcja, i przypina osobę do zadania; gdy kogoś nie zna, proponuje dodanie. W zadaniu widać,
do kogo jest, z telefonem i mailem. Mail w zadaniu ma osobne pola Do / Temat / Treść (każde do
skopiowania) i nigdy nie ma stopki. Najczęstsze kontakty są na górze listy.

## Baza wiedzy

**Więcej → Baza wiedzy** (`/wiedza`). Tu trafia to, co było w projekcie „Maple Bear” w czatach Claude:
plakaty, prezentacje, oferta, gotowe teksty, zasady. Projektu z claude.ai nie da się podpiąć przez API,
więc: w projekcie pobierz pliki (i artefakty), wgraj je tutaj; wiedzę z samych rozmów wklej jako
**Notatkę**. Dobry tytuł i opis („Plakat biegu Terry'ego Foxa, 10.10”) pomagają asystentowi trafić.
Pliki do 4 MB; z PDF i Worda CRM sam wyciąga tekst.

Model: Claude Opus 5.5 (`server/assistant.ts`). Szybkie sprawy (odhaczanie, przesuwanie, notatki, telefony) idą bez Bazy wiedzy i plików, na niskim poziomie myślenia; pełna ścieżka włącza się, gdy trzeba coś napisać albo dołączono plik. Rozpoznawanie i czytanie mowy robi przeglądarka
(Chrome na Androidzie, Safari).

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
server/assistant.ts    asystent (narzędzia, propozycje, wykonanie)
server/knowledge.ts    Baza wiedzy (pliki, notatki, wyszukiwanie)
server/studio.ts       kody QR i nanoszenie ich na PDF / plakat
server/mail.ts         wysyłka maili do grup (Resend)
server/db.ts           Postgres (serwer) albo PGlite (lokalnie), schemat `crm`
server/report.ts       raport tygodniowy
server/spreadsheet.ts  import / eksport .xlsx
server/app.ts          API + logowanie
api/index.ts           funkcja Vercel
src/                   interfejs (React)
```
