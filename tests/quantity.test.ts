import { describe, expect, it } from 'vitest';
import { formatAmount, formatQuantity, parseLeadingQuantity, parseNumber } from '../src/lib/quantity';

describe('parseNumber', () => {
  it.each([
    ['1', 1], ['1,5', 1.5], ['1.5', 1.5], ['1/2', 0.5], ['1 1/2', 1.5], ['½', 0.5], ['1½', 1.5], ['1 ½', 1.5], ['¾', 0.75],
  ])('%s → %s', (s, n) => expect(parseNumber(s)).toBeCloseTo(n));
});

describe('parseLeadingQuantity', () => {
  it('Spanne', () => expect(parseLeadingQuantity('2-3 Eier')).toMatchObject({ value: 2, max: 3 }));
  it('Spanne mit bis', () => expect(parseLeadingQuantity('2 bis 3 EL')).toMatchObject({ value: 2, max: 3 }));
  it('ca.', () => expect(parseLeadingQuantity('ca. 200 g Mehl')).toMatchObject({ value: 200 }));
  it('keine Menge', () => expect(parseLeadingQuantity('Salz')).toBeNull());
});

describe('formatQuantity', () => {
  it('Brüche bei EL', () => {
    expect(formatQuantity(1.5, 'EL')).toBe('1½');
    expect(formatQuantity(0.75, 'TL')).toBe('¾');
    expect(formatQuantity(0.33, 'TL')).toBe('⅓');
    expect(formatQuantity(2, '')).toBe('2');
    expect(formatQuantity(0.98, '')).toBe('1');
  });
  it('Dezimal bei g/ml mit Rundung', () => {
    expect(formatQuantity(333.33, 'g')).toBe('330');
    expect(formatQuantity(187.5, 'g')).toBe('190');
    expect(formatQuantity(12.5, 'g')).toBe('13');
    expect(formatQuantity(7.5, 'g')).toBe('7,5');
    expect(formatQuantity(1.25, 'kg')).toBe('1,25');
    expect(formatQuantity(0.375, 'l')).toBe('0,4');
  });
  it('formatAmount mit Plural', () => {
    expect(formatAmount(1, null, 'Zehe', 2)).toBe('2 Zehen');
    expect(formatAmount(2, 3, '', 1)).toBe('2–3');
    expect(formatAmount(200, null, 'g', 1.5)).toBe('300 g');
    expect(formatAmount(null, null, '', 2)).toBe('');
  });
});
