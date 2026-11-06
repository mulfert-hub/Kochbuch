import { describe, expect, it } from 'vitest';
import { linesFromPlainText, parseRecipe } from '../src/lib/recipeParser';

// Echter OCR-Rohtext eines ChatGPT-Screenshots (iPhone), so wie Tesseract ihn geliefert hat
const RAW = `12:14     „il 5 CE?
—_     (2 ...
Ja, natürlich! & Apfel passt sehr gut
zur Hirse.
Ich würde den Apfel allerdings vorher
dünsten oder fein reiben und mitkochen,
damit er schön weich wird.
So bereitest du den Hirse-Apfel-Brei zu:
e 309g Hirse
e Y% kleiner Apfel
e 120 ml Wasser
e 1TL Rapsöl
1. Hirse mit Wasser ca. 10-15 Minuten
weich köcheln.
2. Apfel schälen, fein reiben und die letzten
5 Minuten mit der Hirse mitköcheln
lassen.
3. Bei Bedarf etwas Wasser ergänzen.
4. Etwas abkühlen lassen und Rapsöl
unterrühren.
Tipp: Wenn der Apfel säuerlich ist, kannst du
etwas Birne oder Banane ergänzen. Apfel
allein funktioniert aber genauso gut. &
| OO» OO N 6 0
+ ChatGPT fragen     Q Cl)`;

describe('echter ChatGPT-Screenshot', () => {
  const r = parseRecipe(linesFromPlainText(RAW));
  it('Titel aus „So bereitest du den … zu:“', () => expect(r.title).toBe('Hirse-Apfel-Brei'));
  it('Zutaten', () =>
    expect(r.ingredients.map((i) => [i.quantity, i.unit, i.name])).toEqual([
      [30, 'g', 'Hirse'],
      [0.5, '', 'kleiner Apfel'],
      [120, 'ml', 'Wasser'],
      [1, 'TL', 'Rapsöl'],
    ]));
  it('nummerierte Schritte ohne Überschrift', () =>
    expect(r.steps).toEqual([
      'Hirse mit Wasser ca. 10-15 Minuten weich köcheln.',
      'Apfel schälen, fein reiben und die letzten 5 Minuten mit der Hirse mitköcheln lassen.',
      'Bei Bedarf etwas Wasser ergänzen.',
      'Etwas abkühlen lassen und Rapsöl unterrühren.',
    ]));
  it('Tipp als Notiz ohne UI-Reste', () =>
    expect(r.notes).toBe('Wenn der Apfel säuerlich ist, kannst du etwas Birne oder Banane ergänzen. Apfel allein funktioniert aber genauso gut.'));
});
