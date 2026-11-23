/**
 * Google Forms without clicking through Google: Opal5 writes a Google Apps Script that builds the whole form
 * (questions, validation, consents), links a response sheet, can close itself on a date or after N sign-ups
 * and e-mail every new entry. Paste it at script.google.com, press Run — the links appear in the log.
 */
import { txt } from '../shared/domain.js';

export type QuestionType = 'text' | 'paragraph' | 'email' | 'phone' | 'number' | 'date' | 'choice' | 'checkbox' | 'dropdown' | 'consent' | 'section';
export interface Question { title: string; type?: QuestionType; options?: string[]; required?: boolean; help?: string }
export interface FormSpec {
  title: string;
  kind?: 'registration' | 'contest' | 'custom';
  description?: string;
  eventTitle?: string;
  when?: string;
  place?: string;
  organizer?: string;
  questions?: Question[];
  /** yyyy-MM-dd — the form stops taking answers at the end of that day */
  closeDate?: string;
  /** stop after this many sign-ups (0 = no limit) */
  maxResponses?: number;
  /** who gets an e-mail on every new entry */
  notifyEmail?: string;
  confirmation?: string;
}

const consent = (org: string, what: string) => `Wyrażam zgodę na przetwarzanie danych osobowych przez ${org} w celu ${what}.`;

function defaults(s: FormSpec): Question[] {
  return buildDefaults(s.kind, s.eventTitle || s.title, s.organizer);
}

/** The standard questions for a sign-up or a contest entry. */
export function buildDefaults(kind: FormSpec['kind'], event: string, organizer?: string): Question[] {
  const s = { kind, eventTitle: event, title: event, organizer } as FormSpec;
  const org = s.organizer || 'Maple Bear Katowice';
  const ev = s.eventTitle || s.title;
  if (s.kind === 'contest') {
    return [
      { title: 'Dane dziecka', type: 'section' },
      { title: 'Imię i nazwisko dziecka', type: 'text', required: true },
      { title: 'Wiek dziecka', type: 'number', required: true },
      { title: 'Klasa / grupa', type: 'text' },
      { title: 'Szkoła / przedszkole', type: 'text' },
      { title: 'Praca konkursowa', type: 'section' },
      { title: 'Tytuł pracy', type: 'text', required: true },
      { title: 'Krótki opis pracy', type: 'paragraph' },
      { title: 'Link do zdjęcia pracy (Google Drive, OneDrive…) — albo prześlij zdjęcie mailem', type: 'text', help: 'Jeśli wolisz, odpowiedz na maila potwierdzającego i dołącz zdjęcie.' },
      { title: 'Rodzic / opiekun', type: 'section' },
      { title: 'Imię i nazwisko rodzica / opiekuna', type: 'text', required: true },
      { title: 'E-mail', type: 'email', required: true },
      { title: 'Telefon', type: 'phone', required: true },
      { title: 'Zgody', type: 'section' },
      { title: 'Regulamin konkursu', type: 'consent', options: [`Akceptuję regulamin konkursu „${ev}”.`], required: true },
      { title: 'Dane osobowe', type: 'consent', options: [consent(org, `przeprowadzenia konkursu „${ev}”`)], required: true },
      { title: 'Publikacja pracy', type: 'choice', options: ['Zgadzam się na publikację pracy z imieniem dziecka', 'Zgadzam się na publikację pracy bez imienia', 'Nie zgadzam się na publikację'], required: true },
      { title: 'Wizerunek', type: 'choice', options: ['Tak, zgadzam się na publikację zdjęć z wydarzenia z udziałem dziecka', 'Nie'], required: true },
    ];
  }
  return [
    { title: 'Imię i nazwisko rodzica / opiekuna', type: 'text', required: true },
    { title: 'E-mail', type: 'email', required: true },
    { title: 'Telefon', type: 'phone', required: true },
    { title: 'Imię i nazwisko dziecka', type: 'text', required: true },
    { title: 'Wiek dziecka', type: 'number', required: true },
    { title: 'Ile osób przyjdzie (razem z dzieckiem)?', type: 'number', required: true },
    { title: 'Skąd wiesz o wydarzeniu?', type: 'choice', options: ['Facebook', 'Instagram', 'Od znajomych', 'Plakat / ulotka', 'Strona szkoły', 'Inne'] },
    { title: 'Alergie, potrzeby, uwagi', type: 'paragraph' },
    { title: 'Dane osobowe', type: 'consent', options: [consent(org, `organizacji wydarzenia „${ev}”`)], required: true },
    { title: 'Wizerunek', type: 'choice', options: ['Tak, zgadzam się na publikację zdjęć z wydarzenia z udziałem dziecka', 'Nie'], required: true },
    { title: 'Informacje o kolejnych wydarzeniach', type: 'checkbox', options: [`Chcę dostawać od ${org} informacje o kolejnych wydarzeniach.`] },
  ];
}

const js = (v: unknown) => JSON.stringify(v ?? '');

function item(q: Question): string {
  const t = js(txt(q.title));
  const req = q.required ? '.setRequired(true)' : '';
  const help = q.help ? `.setHelpText(${js(q.help)})` : '';
  const opts = js((q.options || []).map((o) => txt(o)).filter(Boolean));
  switch (q.type || 'text') {
    case 'section': return `  form.addSectionHeaderItem().setTitle(${t})${help};`;
    case 'paragraph': return `  form.addParagraphTextItem().setTitle(${t})${help}${req};`;
    case 'email': return `  form.addTextItem().setTitle(${t})${help}${req}.setValidation(FormApp.createTextValidation().requireTextIsEmail().setHelpText('Wpisz poprawny adres e-mail.').build());`;
    case 'phone': return `  form.addTextItem().setTitle(${t})${help}${req}.setValidation(FormApp.createTextValidation().requireTextMatchesPattern('^[+0-9 ()-]{9,}$').setHelpText('Wpisz numer telefonu.').build());`;
    case 'number': return `  form.addTextItem().setTitle(${t})${help}${req}.setValidation(FormApp.createTextValidation().requireNumber().setHelpText('Wpisz liczbę.').build());`;
    case 'date': return `  form.addDateItem().setTitle(${t})${help}${req};`;
    case 'choice': return `  form.addMultipleChoiceItem().setTitle(${t})${help}.setChoiceValues(${opts})${req};`;
    case 'dropdown': return `  form.addListItem().setTitle(${t})${help}.setChoiceValues(${opts})${req};`;
    case 'checkbox': return `  form.addCheckboxItem().setTitle(${t})${help}.setChoiceValues(${opts})${req};`;
    case 'consent': return `  form.addCheckboxItem().setTitle(${t})${help}.setChoiceValues(${opts})${req};`;
    default: return `  form.addTextItem().setTitle(${t})${help}${req};`;
  }
}

export function buildFormScript(s: FormSpec): string {
  const title = txt(s.title) || 'Zapisy';
  const qs = s.questions?.length ? s.questions : defaults(s);
  const desc = txt(s.description) || [
    s.kind === 'contest' ? `Zgłoszenie do konkursu ${s.eventTitle ? `„${s.eventTitle}”` : ''}.` : `Zapisy na ${s.eventTitle ? `„${s.eventTitle}”` : 'wydarzenie'}.`,
    s.when ? `Kiedy: ${s.when}.` : '', s.place ? `Gdzie: ${s.place}.` : '',
    s.organizer || 'Maple Bear Katowice',
  ].filter(Boolean).join('\n');
  const confirm = txt(s.confirmation) || (s.kind === 'contest'
    ? 'Dziękujemy! Zgłoszenie do konkursu zostało przyjęte. Szczegóły prześlemy mailem.'
    : 'Dziękujemy za zapis! Do zobaczenia — szczegóły prześlemy mailem.');
  const max = Math.max(0, Math.round(Number(s.maxResponses) || 0));
  const notify = txt(s.notifyEmail);
  const close = /^\d{4}-\d{2}-\d{2}$/.test(txt(s.closeDate)) ? txt(s.closeDate) : '';
  return `/**
 * Opal5 — formularz Google: ${title.replace(/\*\//g, '')}
 *
 * JAK URUCHOMIĆ (1 minuta):
 * 1. Otwórz https://script.google.com/create (zalogowany na konto szkoły).
 * 2. Usuń to, co jest w edytorze, i wklej cały ten skrypt.
 * 3. Na górze wybierz funkcję „utworzFormularz” i kliknij „Uruchom”.
 *    Za pierwszym razem Google zapyta o uprawnienia: „Przejrzyj uprawnienia” → wybierz konto → „Zezwól”.
 * 4. Na dole („Dziennik wykonania”) pojawią się linki: formularz do wysłania, krótki link, edycja i arkusz z odpowiedziami.
 */

var TYTUL = ${js(title)};
var LIMIT_ZGLOSZEN = ${max};          // 0 = bez limitu
var POWIADOMIENIA_NA = ${js(notify)}; // e-mail na każde zgłoszenie ("" = bez powiadomień)
var ZAMKNIJ_DNIA = ${js(close)};      // "rrrr-mm-dd" = koniec przyjmowania zgłoszeń ("" = bez daty)

function utworzFormularz() {
  var form = FormApp.create(TYTUL);
  form.setDescription(${js(desc)});
  form.setConfirmationMessage(${js(confirm)});
  form.setProgressBar(true);
  form.setAllowResponseEdits(true);

${qs.map(item).join('\n')}

  var arkusz = SpreadsheetApp.create(TYTUL + ' — odpowiedzi');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, arkusz.getId());
  PropertiesService.getScriptProperties().setProperty('FORM_ID', form.getId());

  if (POWIADOMIENIA_NA || LIMIT_ZGLOSZEN > 0) ScriptApp.newTrigger('poZgloszeniu').forForm(form).onFormSubmit().create();
  if (ZAMKNIJ_DNIA) ScriptApp.newTrigger('zamknijFormularz').timeBased().at(new Date(ZAMKNIJ_DNIA + 'T23:59:00')).create();

  var link = form.getPublishedUrl();
  var krotki = link;
  try { krotki = form.shortenFormUrl(link); } catch (e) {}
  Logger.log('✅ Gotowe: ' + TYTUL);
  Logger.log('Link do wysłania: ' + krotki);
  Logger.log('Pełny link: ' + link);
  Logger.log('Edycja formularza: ' + form.getEditUrl());
  Logger.log('Odpowiedzi (arkusz): ' + arkusz.getUrl());
}

function poZgloszeniu(e) {
  var form = e.source;
  var ile = form.getResponses().length;
  if (POWIADOMIENIA_NA) {
    var linie = e.response.getItemResponses().map(function (r) { return r.getItem().getTitle() + ': ' + r.getResponse(); });
    MailApp.sendEmail(POWIADOMIENIA_NA, 'Nowe zgłoszenie (' + ile + '): ' + TYTUL, linie.join('\\n'));
  }
  if (LIMIT_ZGLOSZEN > 0 && ile >= LIMIT_ZGLOSZEN) {
    form.setAcceptingResponses(false);
    form.setCustomClosedFormMessage('Komplet zgłoszeń — dziękujemy! Zapraszamy na kolejne wydarzenia.');
  }
}

function zamknijFormularz() {
  var id = PropertiesService.getScriptProperties().getProperty('FORM_ID');
  if (!id) return;
  var form = FormApp.openById(id);
  form.setAcceptingResponses(false);
  form.setCustomClosedFormMessage('Zapisy zostały zamknięte. Dziękujemy!');
}
`;
}
