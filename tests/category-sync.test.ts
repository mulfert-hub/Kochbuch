import { describe, expect, it } from 'vitest';
import { mergeSnapshots, type Snapshot } from '../src/lib/syncMerge';
import type { Recipe } from '../src/types';

const recipe = (id: string, title: string, categoryIds: string[]): Recipe => ({
  id, title, servings: 2, servingsLabel: 'Portionen', categoryIds, ingredients: [], steps: [title], notes: '', timeMinutes: null,
  imageIds: [], createdAt: 1, updatedAt: 1,
});

describe('Kategorien auf mehreren Geräten', () => {
  it('neue Kategorie von einem Gerät kommt beim anderen an', () => {
    const a: Snapshot = { recipes: [], categories: [{ id: 'c1', name: 'Suppen', order: 0, updatedAt: 5 }], tombstones: [] };
    const b: Snapshot = { recipes: [], categories: [], tombstones: [] };
    expect(mergeSnapshots(b, a).categories.map((c) => c.name)).toEqual(['Suppen']);
  });

  it('gleichnamige Kategorien auf beiden Handys: Rezepte behalten ihre Kategorie, auch beim zweiten Abgleich', () => {
    // Handy B hat „Suppen“ (id zz) mit Rezept R hochgeladen
    const remoteFromB: Snapshot = { recipes: [recipe('R', 'Linsensuppe', ['zz'])], categories: [{ id: 'zz', name: 'Suppen', order: 6, updatedAt: 2 }], tombstones: [] };
    // Handy A hat ebenfalls „Suppen“ (id aa) mit Rezept Q angelegt und gleicht ab
    const localA: Snapshot = { recipes: [recipe('Q', 'Tomatensuppe', ['aa'])], categories: [{ id: 'aa', name: 'Suppen', order: 6, updatedAt: 3 }], tombstones: [] };
    const afterA = mergeSnapshots(localA, remoteFromB, 10);
    expect(afterA.categories.map((c) => c.id)).toEqual(['aa']);
    expect(afterA.recipes.find((r) => r.id === 'R')!.categoryIds).toEqual(['aa']);

    // Handy B gleicht danach ab – sein Rezept R zeigt noch auf „zz“
    const afterB = mergeSnapshots(remoteFromB, afterA, 20);
    expect(afterB.categories.map((c) => c.id)).toEqual(['aa']);
    expect(afterB.recipes.find((r) => r.id === 'R')!.categoryIds).toEqual(['aa']);
  });
});
