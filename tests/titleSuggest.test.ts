import { describe, expect, it } from 'vitest';
import { isPlausibleTitle, suggestTitle } from '../src/lib/titleSuggest';
import { parseIngredientLine } from '../src/lib/ingredientParser';
import { linesFromPlainText, parseRecipe } from '../src/lib/recipeParser';

const ings = (...l: string[]) => l.map((x) => parseIngredientLine(x));

describe('Titel aus Zutaten ableiten', () => {
  it('Brei', () =>
    expect(suggestTitle(ings('30 g Hirse', '½ kleiner Apfel', '120 ml Wasser', '1 TL Rapsöl'), ['Hirse mit Wasser 10 Minuten weich köcheln.', 'Apfel reiben und mitköcheln.'])).toBe('Hirse-Apfel-Brei'));
  it('Suppe', () =>
    expect(
      suggestTitle(ings('1 kg Hokkaido-Kürbis', '1 Zwiebel', '3 cm Ingwer', '2 EL Olivenöl', '800 ml Gemüsebrühe', '200 ml Kokosmilch'), [
        'Kürbis würfeln.',
        'Mit Brühe 20 Minuten köcheln und pürieren.',
      ]),
    ).toBe('Kürbis-Ingwer-Suppe'));
  it('Pfanne', () =>
    expect(
      suggestTitle(ings('1 Zwiebel', '1 rote Paprikaschote', '2 Knoblauchzehen', '1 Dose stückige Tomaten', '4 Eier'), [
        'Gemüse in einer Pfanne anbraten.',
        'Tomaten zugeben, Eier hineinschlagen.',
      ]),
    ).toBe('Paprika-Tomaten-Pfanne'));
  it('Kuchen', () =>
    expect(suggestTitle(ings('250 g Butter', '200 g Zucker', '4 Eier', '400 g Mehl', '1,5 kg Äpfel'), ['Teig rühren und im Backofen 40 Minuten backen.'])).toBe('Apfel-Kuchen'));
  it('Salat', () => expect(suggestTitle(ings('1 Gurke', '200 g Feta', '2 EL Olivenöl'), ['Alles mit dem Dressing mischen.'])).toBe('Gurke-Feta-Salat'));
  it('ohne erkennbare Art', () => expect(suggestTitle(ings('500 g Gnocchi', '250 g Kirschtomaten'), ['Alles mischen.'])).toBe('Gnocchi mit Tomaten'));
  it('nur Grundzutaten → kein Vorschlag', () => expect(suggestTitle(ings('1 Prise Salz', '100 ml Wasser'), [])).toBeNull());
});

describe('Ist der erkannte Titel brauchbar?', () => {
  it.each([
    ['Hirse-Apfel-Brei', true],
    ['Omas Apfelkuchen vom Blech', true],
    ['Ja, natürlich! Apfel passt sehr gut zur Hirse.', false],
    ['Ich würde den Apfel allerdings vorher', false],
    ['Neues Rezept', false],
    ['Zutaten:', false],
    ['De) kochliebeanna', false],
    ['kochliebe_anna Schnelle Ofen-Gnocchi', false],
  ])('%s → %s', (t, ok) => expect(isPlausibleTitle(t)).toBe(ok));
});

describe('Erkennung ohne Rezeptnamen im Screenshot', () => {
  const RAW = `Ja, natürlich! Apfel passt sehr gut
zur Hirse.
e 30 g Hirse
e Y kleiner Apfel
e 120 ml Wasser
e 1TL Rapsöl
1. Hirse mit Wasser ca. 10-15 Minuten
weich köcheln.
2. Apfel schälen, fein reiben und die letzten
5 Minuten mit der Hirse mitköcheln
lassen.`;
  const r = parseRecipe(linesFromPlainText(RAW));
  it('Titel abgeleitet und markiert', () => {
    expect(r.title).toBe('Hirse-Apfel-Brei');
    expect(r.titleDerived).toBe(true);
  });
  it('mit erkennbarem Namen bleibt der Name', () => {
    const r2 = parseRecipe(linesFromPlainText('Omas Apfelkuchen\nZutaten\n200 g Mehl\nZubereitung\nBacken.'));
    expect(r2.title).toBe('Omas Apfelkuchen');
    expect(r2.titleDerived).toBe(false);
  });
});
