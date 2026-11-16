import { describe, expect, it } from 'vitest';
import { address, greetFromPerson, greetingLine, guessTitle, personalize, vocative } from '../shared/greeting';

describe('vocative', () => {
  const men: [string, string][] = [
    ['Damian', 'Damianie'], ['Jan', 'Janie'], ['Marcin', 'Marcinie'], ['Adam', 'Adamie'], ['Jakub', 'Jakubie'],
    ['Filip', 'Filipie'], ['Krzysztof', 'Krzysztofie'], ['Józef', 'Józefie'], ['Stanisław', 'Stanisławie'], ['Zbigniew', 'Zbigniewie'],
    ['Borys', 'Borysie'], ['Robert', 'Robercie'], ['Hubert', 'Hubercie'], ['Dawid', 'Dawidzie'], ['Konrad', 'Konradzie'],
    ['Piotr', 'Piotrze'], ['Wiktor', 'Wiktorze'], ['Artur', 'Arturze'], ['Kacper', 'Kacprze'], ['Aleksander', 'Aleksandrze'],
    ['Michał', 'Michale'], ['Rafał', 'Rafale'], ['Paweł', 'Pawle'], ['Marek', 'Marku'], ['Jacek', 'Jacku'], ['Wojtek', 'Wojtku'],
    ['Leszek', 'Leszku'], ['Patryk', 'Patryku'], ['Dominik', 'Dominiku'], ['Wojciech', 'Wojciechu'], ['Tomasz', 'Tomaszu'],
    ['Łukasz', 'Łukaszu'], ['Mateusz', 'Mateuszu'], ['Grzegorz', 'Grzegorzu'], ['Maciej', 'Macieju'], ['Andrzej', 'Andrzeju'],
    ['Mikołaj', 'Mikołaju'], ['Kamil', 'Kamilu'], ['Karol', 'Karolu'], ['Daniel', 'Danielu'], ['Ernest', 'Erneście'],
    ['Jerzy', 'Jerzy'], ['Antoni', 'Antoni'], ['Ignacy', 'Ignacy'], ['Kuba', 'Kubo'], ['Hugo', 'Hugo'], ['Feliks', 'Feliksie'],
  ];
  it.each(men)('Pan %s → %s', (n, v) => expect(vocative(n, 'pan')).toBe(v));

  const women: [string, string][] = [
    ['Anna', 'Anno'], ['Katarzyna', 'Katarzyno'], ['Agnieszka', 'Agnieszko'], ['Magdalena', 'Magdaleno'], ['Julia', 'Julio'],
    ['Natalia', 'Natalio'], ['Maria', 'Mario'], ['Patrycja', 'Patrycjo'], ['Iza', 'Izo'], ['Izabela', 'Izabelo'],
    ['Kasia', 'Kasiu'], ['Zosia', 'Zosiu'], ['Marysia', 'Marysiu'], ['Ania', 'Aniu'], ['Madzia', 'Madziu'], ['Ksenia', 'Ksenio'],
    ['Ola', 'Olu'], ['Ela', 'Elu'], ['Noemi', 'Noemi'], ['Miriam', 'Miriam'],
  ];
  it.each(women)('Pani %s → %s', (n, v) => expect(vocative(n, 'pani')).toBe(v));

  it('greets by the first name only, keeps capitals, handles double names', () => {
    expect(vocative('damian nowak', 'pan')).toBe('Damianie');
    expect(vocative('  Anna-Maria ', 'pani')).toBe('Anno-Mario');
  });
});

describe('guessTitle', () => {
  it('reads Pan / Pani from the name', () => {
    expect(guessTitle('Damian')).toBe('pan');
    expect(guessTitle('Anna')).toBe('pani');
    expect(guessTitle('Kuba')).toBe('pan');
    expect(guessTitle('Noemi')).toBe('pani');
  });
});

describe('personalize', () => {
  it('puts the name into "Dzień dobry"', () => {
    const t = 'Dzień dobry,\nchciałem przypomnieć o jutrzejszej wizycie.';
    expect(personalize(t, { name: 'Damian', title: 'pan' }, 'pl')).toBe('Dzień dobry, Panie Damianie,\nchciałem przypomnieć o jutrzejszej wizycie.');
    expect(personalize('Dzień dobry!\nPróbowałem…', { name: 'Anna', title: 'pani' }, 'pl')).toBe('Dzień dobry, Pani Anno!\nPróbowałem…');
  });
  it('uses a hand-corrected vocative', () => {
    expect(address({ name: 'Derek', title: 'pan', voc: 'Dereku' })).toBe('Panie Dereku');
  });
  it('leaves the text alone without a name or without a greeting', () => {
    expect(personalize('Dzień dobry,\nx', { name: ' ', title: 'pan' }, 'pl')).toBe('Dzień dobry,\nx');
    expect(personalize('Proszę o kontakt.', { name: 'Damian', title: 'pan' }, 'pl')).toBe('Proszę o kontakt.');
  });
  it('English: first name after the greeting', () => {
    expect(personalize('Hi,\nwe have…', { name: 'damian', title: 'pan' }, 'en')).toBe('Hi Damian,\nwe have…');
    expect(personalize('Good morning!\nx', { name: 'Anna', title: 'pani' }, 'en')).toBe('Good morning Anna!\nx');
  });
  it('greeting line for the offer mail', () => {
    expect(greetingLine({ name: 'Damian', title: 'pan' }, 'pl')).toBe('Dzień dobry, Panie Damianie,');
    expect(greetingLine({ name: 'Anna', title: 'pani' }, 'en')).toBe('Good morning Anna,');
  });
});

describe('greetFromPerson', () => {
  it('reads the contact field of a company', () => {
    expect(greetFromPerson('pani Celina Nowak (HR)')).toEqual({ name: 'Celina', title: 'pani' });
    expect(greetFromPerson('Pan Damian')).toEqual({ name: 'Damian', title: 'pan' });
    expect(greetFromPerson('Tomasz Kowalski, właściciel')).toEqual({ name: 'Tomasz', title: 'pan' });
    expect(greetFromPerson('')).toEqual({ name: '', title: 'pan' });
    expect(greetFromPerson('biuro@firma.pl')).toEqual({ name: '', title: 'pan' });
  });
});
