import { describe, expect, it } from 'vitest';
import { findDurations, formatClock } from '../src/lib/durations';
import { guessAisle } from '../src/lib/aisles';

describe('Zeiten in Schritten finden', () => {
  const d = (t: string) => findDurations(t).map((x) => [x.seconds, x.maxSeconds, x.text]);
  it('Minuten', () => expect(d('Zugedeckt 20 Minuten köcheln lassen.')).toEqual([[1200, null, '20 Minuten']]));
  it('Spanne', () => expect(d('Hirse ca. 10–15 Minuten weich köcheln.')).toEqual([[600, 900, '10–15 Minuten']]));
  it('Stunden + Abkürzungen', () => expect(d('1 Std. gehen lassen, dann 25 Min. backen.')).toEqual([[3600, null, '1 Std.'], [1500, null, '25 Min.']]));
  it('Bruch und Wort', () => expect(d('1½ Stunden schmoren, eine halbe Stunde ruhen')).toEqual([[5400, null, '1½ Stunden'], [1800, null, 'eine halbe Stunde']]));
  it('keine Temperaturen oder Mengen', () => expect(d('Bei 180 °C backen. 200 g Mehl.')).toEqual([]));
  it('Uhr-Format', () => {
    expect(formatClock(1200)).toBe('20:00');
    expect(formatClock(3725)).toBe('1:02:05');
  });
});

describe('Supermarkt-Abteilungen', () => {
  it.each([
    ['rote Linsen', 'trocken'], ['Kokosmilch', 'gewuerze'], ['Milch', 'kuehl'], ['Zwiebel', 'obst-gemuese'], ['Hokkaido-Kürbis', 'obst-gemuese'],
    ['Tomatenmark', 'gewuerze'], ['stückige Tomaten', 'trocken'], ['Tomaten', 'obst-gemuese'], ['Olivenöl', 'gewuerze'], ['Möhren', 'obst-gemuese'],
    ['Eier', 'kuehl'], ['Rinderrouladen', 'fleisch-fisch'], ['Mehl', 'backen'], ['Baguette', 'brot'], ['Zartbitterschokolade', 'backen'],
    ['TK-Erbsen', 'tiefkuehl'], ['Spülmittel', 'sonstiges'],
  ])('%s → %s', (n, a) => expect(guessAisle(n)).toBe(a));
});

import { ingredientsInStep } from '../src/lib/cookMatch';
import { parseIngredientLine } from '../src/lib/ingredientParser';

describe('Zutaten im Schritt', () => {
  const ings = ['1 Zwiebel', '1 rote Paprikaschote', '2 Knoblauchzehen', '1 kg Hokkaido-Kürbis', '2 EL Kürbiskerne', '800 ml Gemüsebrühe', '2 EL Olivenöl'].map((l) => parseIngredientLine(l));
  const names = (step: string) => ingredientsInStep(step, ings).map((i) => i.name);
  it('Teil-Wörter', () => expect(names('Zwiebel, Paprika und Knoblauch klein schneiden und im Öl anbraten.')).toEqual(['Zwiebel', 'rote Paprikaschote', 'Knoblauchzehen', 'Olivenöl']));
  it('kein Kürbis → Kürbiskerne', () => expect(names('Kürbis zugeben und mit Brühe ablöschen.')).toEqual(['Hokkaido-Kürbis', 'Gemüsebrühe']));
  it('Kürbiskerne direkt', () => expect(names('Kürbiskerne rösten.')).toEqual(['Kürbiskerne']));
});
