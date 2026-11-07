import { describe, expect, it } from 'vitest';
import { dayName, weekDays, weekLabel } from '../src/lib/week';
import { mergeSnapshots } from '../src/lib/syncMerge';

const sat = new Date(2026, 10, 7, 12); // Samstag, 7. Nov. 2026

describe('Wochenplan-Daten', () => {
  it('Woche beginnt am Montag', () => {
    expect(weekDays(0, sat)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
    expect(weekDays(1, sat)[0]).toBe('2026-11-09');
  });
  it('Sonntag gehört zur laufenden Woche', () => {
    expect(weekDays(0, new Date(2026, 10, 8))[0]).toBe('2026-11-02');
  });
  it('Tagesnamen', () => {
    expect(dayName('2026-11-07', sat)).toBe('Heute');
    expect(dayName('2026-11-08', sat)).toBe('Morgen');
    expect(dayName('2026-11-04', sat)).toBe('Mittwoch');
    expect(weekLabel(1, sat)).toBe('Nächste Woche');
  });
  it('Abgleich: neuere Version gewinnt, Gelöschtes bleibt weg', () => {
    const e = { id: 'p1', date: '2026-11-07', recipeId: 'r1', title: 'Suppe', order: 0, updatedAt: 1 };
    const merged = mergeSnapshots(
      { recipes: [], categories: [], tombstones: [{ id: 'p2', kind: 'plan', deletedAt: 5 }], plan: [e] },
      { recipes: [], categories: [], tombstones: [], plan: [{ ...e, title: 'Kürbissuppe', updatedAt: 2 }, { ...e, id: 'p2', updatedAt: 3 }] },
    );
    expect(merged.plan).toEqual([{ ...e, title: 'Kürbissuppe', updatedAt: 2 }]);
  });
});
