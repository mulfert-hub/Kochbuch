import { describe, expect, it } from 'vitest';
import { parseCookCommand, parseSpokenList } from '../src/lib/spoken';

describe('Sprachbefehle im Kochmodus', () => {
  it.each([
    ['Weiter', { type: 'next' }],
    ['nächster Schritt', { type: 'next' }],
    ['zurück', { type: 'prev' }],
    ['Lies vor', { type: 'read' }],
    ['nochmal bitte', { type: 'read' }],
    ['Zutaten', { type: 'ingredients' }],
    ['Timer zehn Minuten', { type: 'timer', seconds: 600 }],
    ['Stell einen Timer auf 25 Minuten', { type: 'timer', seconds: 1500 }],
    ['Timer eine halbe Stunde', { type: 'timer', seconds: 1800 }],
    ['Timer 90 Sekunden', { type: 'timer', seconds: 90 }],
    ['Timer starten', { type: 'stepTimer' }],
    ['Alarm aus', { type: 'stopAlarm' }],
    ['Stopp', { type: 'stopAlarm' }],
    ['Das Wetter ist schön', null],
    ['Stell einen 10-Minuten-Timer', { type: 'timer', seconds: 600 }],
    ['Timer auf 5 Minuten stellen', { type: 'timer', seconds: 300 }],
    ['zehn Minuten', { type: 'timer', seconds: 600 }],
    ['Wecker in einer halben Stunde', { type: 'timer', seconds: 1800 }],
    ['Timer eine Minute', { type: 'timer', seconds: 60 }],
    ['Timer anderthalb Stunden', { type: 'timer', seconds: 5400 }],
    ['Timer zwei und halb Minuten', { type: 'timer', seconds: 150 }],
    ['Timer stellen', { type: 'stepTimer' }],
    ['Timer', { type: 'stepTimer' }],
    ['Stell den Timer', { type: 'stepTimer' }],
    ['Lass das 10 Minuten köcheln und dann weiter', { type: 'next' }],
  ])('„%s“', (text, cmd) => expect(parseCookCommand(text)).toEqual(cmd));
});

describe('Einkaufsliste per Sprache', () => {
  it('trennt bei Komma und „und“, wandelt Zahlwörter um', () =>
    expect(parseSpokenList('Milch, zwei Zitronen und ein Stück Butter')).toEqual(['Milch', '2 Zitronen', '1 Stück Butter']));
  it('halbe Mengen', () => expect(parseSpokenList('ein halbes Kilo Mehl sowie drei Eier')).toEqual(['0,5 Kilo Mehl', '3 Eier']));
  it('Großschreibung', () => expect(parseSpokenList('tomaten und basilikum')).toEqual(['Tomaten', 'Basilikum']));
});
