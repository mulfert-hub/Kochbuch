import { describe, expect, it } from 'vitest';
import { linesFromPlainText, parseRecipe } from '../src/lib/recipeParser';

const TEXT = `9:41
Kürbissuppe mit Ingwer
30 Min. · einfach
Zutaten für 4 Portionen
1 kg Hokkaido-Kürbis
1 Zwiebel
2 cm Ingwer, frisch
2 EL Olivenöl
800 ml Gemüsebrühe
200 ml Kokosmilch
Salz und Pfeffer

Zubereitung
1. Kürbis waschen, entkernen und in Würfel
schneiden. Zwiebel und Ingwer schälen und
fein hacken.
2. Öl in einem Topf erhitzen und Zwiebel und
Ingwer darin glasig dünsten.
3. Kürbis und Brühe zugeben und 20 Minuten
köcheln lassen. Kokosmilch einrühren, pü-
rieren und abschmecken.
Tipp: Mit gerösteten Kürbiskernen servieren.`;

describe('parseRecipe', () => {
  const r = parseRecipe(linesFromPlainText(TEXT));
  it('Titel', () => expect(r.title).toBe('Kürbissuppe mit Ingwer'));
  it('Portionen', () => expect(r.servings).toBe(4));
  it('Zeit', () => expect(r.timeMinutes).toBe(30));
  it('Zutaten', () => {
    expect(r.ingredients.map((i) => i.name)).toEqual([
      'Hokkaido-Kürbis', 'Zwiebel', 'Ingwer', 'Olivenöl', 'Gemüsebrühe', 'Kokosmilch', 'Salz und Pfeffer',
    ]);
    expect(r.ingredients[0]).toMatchObject({ quantity: 1, unit: 'kg' });
  });
  it('Schritte', () => {
    expect(r.steps).toHaveLength(3);
    expect(r.steps[0]).toBe('Kürbis waschen, entkernen und in Würfel schneiden. Zwiebel und Ingwer schälen und fein hacken.');
    expect(r.steps[2]).toContain('pürieren');
  });
  it('Tipp als Notiz', () => expect(r.notes).toBe('Mit gerösteten Kürbiskernen servieren.'));

  it('ohne Überschriften', () => {
    const r2 = parseRecipe(linesFromPlainText(`Pfannkuchen\n250 g Mehl\n500 ml Milch\n3 Eier\n1 Prise Salz\nAlle Zutaten zu einem glatten Teig verrühren und 10 Minuten quellen lassen.\nIn einer heißen Pfanne mit etwas Butter portionsweise goldbraun ausbacken.`));
    expect(r2.title).toBe('Pfannkuchen');
    expect(r2.ingredients).toHaveLength(4);
    expect(r2.steps.length).toBeGreaterThanOrEqual(1);
  });

  it('Spaltenlayout Mengen/Namen', () => {
    const r3 = parseRecipe(linesFromPlainText(`Brownies\nZutaten\n200 g\n150 g\n3\n100 g\nZartbitterschokolade\nButter\nEier\nZucker\nZubereitung\nSchokolade schmelzen.`));
    expect(r3.ingredients.map((i) => [i.quantity, i.unit, i.name])).toEqual([
      [200, 'g', 'Zartbitterschokolade'], [150, 'g', 'Butter'], [3, '', 'Eier'], [100, 'g', 'Zucker'],
    ]);
  });
});
