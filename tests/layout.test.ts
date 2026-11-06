import { describe, expect, it } from 'vitest';
import { lineText, splitColumns, type LayoutLine } from '../src/lib/layout';

// Baut eine Zeile aus [x, Wort]-Paaren (Wortbreite = 10 px pro Zeichen)
const line = (y: number, ...ws: [number, string][]): LayoutLine => {
  const words = ws.map(([x, text]) => ({ text, x0: x, x1: x + text.length * 10, y0: y, y1: y + 20 }));
  return { words, confidence: 90, x0: words[0].x0, x1: words[words.length - 1].x1, y0: y, y1: y + 20 };
};

describe('splitColumns', () => {
  it('trennt Zutaten- und Schrittspalte', () => {
    const lines = [
      line(0, [0, 'Titel']),
      line(30, [0, '4'], [20, 'Rouladen'], [400, 'Die'], [440, 'Rouladen']),
      line(60, [0, '2'], [20, 'EL'], [50, 'Senf'], [400, 'klopfen.'], [490, 'Mit']),
      line(90, [0, '4'], [20, 'Scheiben'], [400, 'Bacon'], [460, 'belegen.']),
      line(120, [0, '2'], [20, 'Gurken'], [400, 'Butterschmalz']),
      line(150, [0, '1'], [20, 'Möhre']),
      line(180, [400, 'erhitzen.']),
    ];
    expect(splitColumns(lines, 1000).map(lineText)).toEqual([
      'Titel', '4 Rouladen', '2 EL Senf', '4 Scheiben', '2 Gurken', '1 Möhre',
      'Die Rouladen', 'klopfen. Mit', 'Bacon belegen.', 'Butterschmalz', 'erhitzen.',
    ]);
  });
  it('lässt einspaltigen Text unverändert', () => {
    const lines = Array.from({ length: 8 }, (_, i) => line(i * 30, [0, 'Ein'], [40, 'normaler'], [130, 'Satz']));
    expect(splitColumns(lines, 1000)).toBe(lines);
  });
});
