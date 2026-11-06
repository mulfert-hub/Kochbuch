import { describe, expect, it } from 'vitest';
import { joinPages } from '../src/lib/joinPages';

const L = (...t: string[]) => t.map((text) => ({ text }));

describe('joinPages', () => {
  it('entfernt Überlappung inkl. angeschnittener Zeilen und Statusleiste', () => {
    const p1 = L('18:07 87%', 'Titel', 'Zutaten', '250 g Butter', '200 g Zucker', '4 Eier', 'Zubereitung', 'Den Ofen vorheizen und', 'Analtan schneiden Mit Zitr');
    const p2 = L('18:07 87%', '° 200 g Zucker', '4 Eier', 'Zubereitung', 'Den Ofen vorheizen und', 'Spalten schneiden. Mit Zitronensaft', 'Ende.');
    expect(joinPages([p1, p2]).map((l) => l.text)).toEqual([
      'Titel', 'Zutaten', '250 g Butter', '200 g Zucker', '4 Eier', 'Zubereitung', 'Den Ofen vorheizen und', 'Spalten schneiden. Mit Zitronensaft', 'Ende.',
    ]);
  });
  it('ohne Überlappung einfach anhängen', () => {
    expect(joinPages([L('a eins zwei', 'b drei vier'), L('c fünf sechs')]).map((l) => l.text)).toEqual(['a eins zwei', 'b drei vier', 'c fünf sechs']);
  });
});
