import { describe, expect, it } from 'vitest';
import { allowedTags, cleanSuggestedTags, describeTags } from '../src/lib/tags';

describe('Tag-Vorschläge', () => {
  const info = { Thea: { desc: 'mild, ohne Alkohol', updatedAt: 1 } };
  const allowed = allowedTags(['Thea', 'Familie', 'Fleisch', 'Oma'], info);
  it('persönliche Tags nur mit Bedeutung, allgemeine immer, Schreibweise wie vorhanden', () => {
    const names = allowed.map((a) => a.name);
    expect(names).toContain('Thea');
    expect(names).toContain('Fleisch');
    expect(names).toContain('vegetarisch');
    expect(names).not.toContain('Familie');
    expect(names).not.toContain('Oma');
  });
  it('bereinigt Vorschläge', () => {
    expect(cleanSuggestedTags(['Vegetarisch', '#thea', 'lecker', 'fleisch', 'Oma', 'schnell', 'Backen', 'vegan'], allowed)).toEqual(['vegetarisch', 'Thea', 'Fleisch', 'schnell', 'Backen']);
  });
  it('Beschreibung für Claude', () => expect(describeTags(allowed)).toContain('Thea (= mild, ohne Alkohol)'));
});

describe('allowedTags mit nur definierter Bedeutung', () => {
  it('erlaubt eigene Tags, die nur unter „Mehr → Tags“ erklärt sind', async () => {
    const { allowedTags } = await import('../src/lib/tags');
    const names = allowedTags([], { Thea: { desc: 'mild', updatedAt: 1 }, Leer: { desc: '', updatedAt: 1 } }).map((t) => t.name);
    expect(names).toContain('Thea');
    expect(names).not.toContain('Leer');
  });
});
