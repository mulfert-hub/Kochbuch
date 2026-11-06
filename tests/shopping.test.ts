import { describe, expect, it } from 'vitest';
import { displayItem, mergeIntoList } from '../src/lib/shopping';
import type { Ingredient } from '../src/types';

const ing = (quantity: number | null, unit: string, name: string): Ingredient => ({ id: name + unit, quantity, unit, name });

describe('Einkaufsliste', () => {
  it('fasst gleiche Zutaten zusammen und rechnet Einheiten um', () => {
    let list = mergeIntoList([], { ingredients: [ing(500, 'g', 'Mehl'), ing(2, '', 'Eier'), ing(1, '', 'Zwiebel')], factor: 1, source: { recipeId: 'a', title: 'A' } });
    list = mergeIntoList(list, { ingredients: [ing(1, 'kg', 'Mehl'), ing(1, '', 'Ei'), ing(2, '', 'Zwiebeln (rot)')], factor: 1, source: { recipeId: 'b', title: 'B' } });
    const mehl = list.find((i) => i.name === 'Mehl')!;
    expect(displayItem(mehl)).toEqual({ quantity: 1.5, unit: 'kg' });
    expect(mehl.sources).toHaveLength(2);
    expect(list.find((i) => i.name === 'Eier')!.quantity).toBe(3);
    expect(list.find((i) => i.name === 'Zwiebel')!.quantity).toBe(3);
    expect(list).toHaveLength(3);
  });
  it('skaliert mit Faktor und trennt unterschiedliche Einheiten', () => {
    const list = mergeIntoList([], { ingredients: [ing(2, 'EL', 'Öl'), ing(100, 'ml', 'Öl')], factor: 2, source: { recipeId: 'a', title: 'A' } });
    expect(list).toHaveLength(2);
    expect(list[0].quantity).toBe(4);
  });
});
