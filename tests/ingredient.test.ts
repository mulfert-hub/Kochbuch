import { describe, expect, it } from 'vitest';
import { parseIngredientLine } from '../src/lib/ingredientParser';

const p = (s: string) => {
  const { id: _id, group: _g, ...rest } = parseIngredientLine(s);
  return rest;
};

describe('parseIngredientLine', () => {
  it('Standard', () => expect(p('200 g Mehl')).toMatchObject({ quantity: 200, unit: 'g', name: 'Mehl' }));
  it('ohne Leerzeichen', () => expect(p('200g Zucker')).toMatchObject({ quantity: 200, unit: 'g', name: 'Zucker' }));
  it('Bruch + Langform', () => expect(p('1/2 Teelöffel Salz')).toMatchObject({ quantity: 0.5, unit: 'TL', name: 'Salz' }));
  it('Unicode-Bruch', () => expect(p('1½ EL Olivenöl')).toMatchObject({ quantity: 1.5, unit: 'EL', name: 'Olivenöl' }));
  it('Spanne ohne Einheit', () => expect(p('2-3 Eier')).toMatchObject({ quantity: 2, quantityMax: 3, unit: '', name: 'Eier' }));
  it('Notiz nach Komma', () => expect(p('1 Zwiebel, fein gewürfelt')).toMatchObject({ quantity: 1, name: 'Zwiebel', note: 'fein gewürfelt' }));
  it('Notiz in Klammern', () => expect(p('100 g Butter (weich)')).toMatchObject({ name: 'Butter', note: 'weich' }));
  it('ohne Menge', () => expect(p('Salz und Pfeffer')).toMatchObject({ quantity: null, unit: '', name: 'Salz und Pfeffer' }));
  it('Aufzählungszeichen', () => expect(p('• 2 Knoblauchzehen')).toMatchObject({ quantity: 2, name: 'Knoblauchzehen' }));
  it('OCR: l statt 1', () => expect(p('l EL Honig')).toMatchObject({ quantity: 1, unit: 'EL', name: 'Honig' }));
  it('OCR: % statt ½', () => expect(p('% TL Zimt')).toMatchObject({ quantity: 0.5, unit: 'TL', name: 'Zimt' }));
  it('Menge am Ende', () => expect(p('Mehl 250 g')).toMatchObject({ quantity: 250, unit: 'g', name: 'Mehl' }));
  it('Dezimal Komma', () => expect(p('1,5 l Gemüsebrühe')).toMatchObject({ quantity: 1.5, unit: 'l', name: 'Gemüsebrühe' }));
  it('Prise', () => expect(p('1 Prise Muskat')).toMatchObject({ quantity: 1, unit: 'Prise', name: 'Muskat' }));
  it('Päckchen', () => expect(p('1 Päckchen Backpulver')).toMatchObject({ unit: 'Pck.', name: 'Backpulver' }));
});
