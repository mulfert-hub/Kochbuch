import { describe, expect, it } from 'vitest';
import { searchQueries, simplifyTitle } from '../src/lib/photoSearch';

describe('Fotosuche: Suchbegriffe', () => {
  it('vereinfacht Titel', () => {
    expect(simplifyTitle('Omas Apfelkuchen vom Blech')).toBe('Apfelkuchen');
    expect(simplifyTitle('Kürbissuppe mit Ingwer und Kokos')).toBe('Kürbissuppe');
  });
  it('Komposita mit Bindestrich', () =>
    expect(searchQueries('Hirse-Apfel-Brei')).toEqual(['Hirse-Apfel-Brei', 'Hirsebrei', 'millet porridge', 'porridge food']));
  it('einzelnes Kompositum', () => expect(searchQueries('Kürbissuppe')).toEqual(['Kürbissuppe', 'pumpkin soup', 'soup food']));
});

import { vi } from 'vitest';
import { findPhotos } from '../src/lib/photoSearch';

describe('Fotosuche: Abruf', () => {
  it('behält Treffer, wenn eine spätere Stufe scheitert', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      const q = new URL(url).searchParams.get('q')!;
      calls.push(q);
      if (q === 'Hirsebrei') return new Response(JSON.stringify({ results: [{ id: 'a', title: 'Hirsebrei', creator: 'X', license: 'by', license_version: '2.0' }] }));
      if (q === 'millet porridge') throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify({ results: [] }));
    });
    const res = await findPhotos('Hirse-Apfel-Brei');
    expect(res.map((r) => [r.id, r.license])).toEqual([['a', 'CC BY 2.0']]);
    expect(calls).toEqual(['Hirse-Apfel-Brei', 'Hirsebrei', 'millet porridge', 'porridge food']);
    vi.unstubAllGlobals();
  });
  it('meldet Fehler nur, wenn gar nichts gefunden wurde', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(findPhotos('Kürbissuppe')).rejects.toThrow();
    vi.unstubAllGlobals();
  });
});
