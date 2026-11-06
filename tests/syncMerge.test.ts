import { describe, expect, it } from 'vitest';
import { mergeSnapshots, type Snapshot } from '../src/lib/syncMerge';
import type { Recipe } from '../src/types';

const rec = (id: string, title: string, updatedAt: number, extra: Partial<Recipe> = {}): Recipe => ({
  id, title, servings: 2, categoryIds: [], ingredients: [], steps: [title + ' kochen'], imageIds: [], createdAt: updatedAt, updatedAt, ...extra,
});
const snap = (s: Partial<Snapshot>): Snapshot => ({ recipes: [], categories: [], tombstones: [], ...s });

describe('Synchronisation: Zusammenführen', () => {
  it('vereinigt Rezepte beider Seiten', () => {
    const m = mergeSnapshots(snap({ recipes: [rec('a', 'Suppe', 1)] }), snap({ recipes: [rec('b', 'Kuchen', 2)] }));
    expect(m.recipes.map((r) => r.id).sort()).toEqual(['a', 'b']);
  });
  it('neuere Änderung gewinnt – egal auf welcher Seite', () => {
    const old = rec('a', 'Suppe', 1);
    const neu = rec('a', 'Kürbissuppe', 5);
    expect(mergeSnapshots(snap({ recipes: [old] }), snap({ recipes: [neu] })).recipes[0].title).toBe('Kürbissuppe');
    expect(mergeSnapshots(snap({ recipes: [neu] }), snap({ recipes: [old] })).recipes[0].title).toBe('Kürbissuppe');
  });
  it('gelöschte Rezepte bleiben gelöscht, außer sie wurden danach geändert', () => {
    const t = { id: 'a', kind: 'recipe' as const, deletedAt: 10 };
    expect(mergeSnapshots(snap({ tombstones: [t] }), snap({ recipes: [rec('a', 'Suppe', 5)] })).recipes).toHaveLength(0);
    expect(mergeSnapshots(snap({ tombstones: [t] }), snap({ recipes: [rec('a', 'Suppe', 20)] })).recipes).toHaveLength(1);
  });
  it('legt gleichnamige Kategorien zusammen und passt Rezepte an', () => {
    const m = mergeSnapshots(
      snap({ categories: [{ id: 'x1', name: 'Frühstück', order: 0 }], recipes: [rec('a', 'Oats', 1, { categoryIds: ['x1'] })] }),
      snap({ categories: [{ id: 'y9', name: 'frühstück', order: 0 }], recipes: [rec('b', 'Müsli', 2, { categoryIds: ['y9'] })] }),
      100,
    );
    expect(m.categories.map((c) => c.id)).toEqual(['x1']);
    expect(m.recipes.find((r) => r.id === 'b')!.categoryIds).toEqual(['x1']);
    expect(m.tombstones.some((t) => t.id === 'y9')).toBe(true);
  });
  it('entfernt exakte Duplikate (z. B. Beispielrezepte auf beiden Handys)', () => {
    const m = mergeSnapshots(snap({ recipes: [rec('a', 'Shakshuka', 1)] }), snap({ recipes: [rec('b', 'Shakshuka', 3)] }), 100);
    expect(m.recipes.map((r) => r.id)).toEqual(['a']);
    expect(m.tombstones.map((t) => t.id)).toEqual(['b']);
  });
  it('Löschen entfernt auch inhaltsgleiche Kopien mit anderer ID', async () => {
    const { contentKey } = await import('../src/lib/syncMerge');
    const copy = rec('zzz', 'Shakshuka', 1);
    const t = { id: 'other', kind: 'recipe' as const, deletedAt: 5, key: contentKey(rec('other', 'Shakshuka', 1)) };
    expect(mergeSnapshots(snap({ tombstones: [t] }), snap({ recipes: [copy] })).recipes).toHaveLength(0);
  });
  it('ist in beide Richtungen gleich (beide Geräte kommen zum selben Ergebnis)', () => {
    const A = snap({ recipes: [rec('a', 'Suppe', 3), rec('c', 'Brot', 1)], categories: [{ id: 'k1', name: 'Backen', order: 1, updatedAt: 1 }] });
    const B = snap({ recipes: [rec('a', 'Suppe neu', 4)], tombstones: [{ id: 'c', kind: 'recipe', deletedAt: 2 }] });
    const ab = mergeSnapshots(A, B, 100);
    const ba = mergeSnapshots(B, A, 100);
    expect(ab.recipes).toEqual(ba.recipes);
    expect(ab.categories).toEqual(ba.categories);
    expect(ab.recipes.map((r) => r.title)).toEqual(['Suppe neu']);
  });
});
