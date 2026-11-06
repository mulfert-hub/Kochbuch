// Spaltenerkennung: Tesseract liest zweispaltige Layouts (Zutaten links, Schritte rechts)
// oft zeilenweise quer über beide Spalten. Anhand der Wortpositionen trennen wir die Spalten.

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface WordBox extends Box {
  text: string;
}
export interface LayoutLine extends Box {
  words: WordBox[];
  confidence: number;
}

function lineFromWords(words: WordBox[], confidence: number): LayoutLine {
  return {
    words,
    confidence,
    x0: Math.min(...words.map((w) => w.x0)),
    x1: Math.max(...words.map((w) => w.x1)),
    y0: Math.min(...words.map((w) => w.y0)),
    y1: Math.max(...words.map((w) => w.y1)),
  };
}

export function lineText(l: LayoutLine): string {
  return l.words.map((w) => w.text).join(' ');
}

/**
 * Findet eine senkrechte Spaltengrenze und ordnet die Zeilen spaltenweise neu:
 * erst alle Zeilen der linken Spalte, dann die der rechten (jeweils innerhalb des Bereichs,
 * in dem beide Spalten nebeneinander stehen).
 */
export function splitColumns(lines: LayoutLine[], pageWidth: number): LayoutLine[] {
  if (lines.length < 6) return lines;
  const charW = (l: LayoutLine) => {
    const chars = l.words.reduce((n, w) => n + w.text.length, 0);
    return chars ? (l.x1 - l.x0) / chars : 10;
  };
  // Kandidaten: große Lücke zwischen zwei Wörtern einer Zeile
  const splits: { i: number; x: number }[] = [];
  lines.forEach((l, i) => {
    const cw = charW(l);
    for (let k = 1; k < l.words.length; k++) {
      const gap = l.words[k].x0 - l.words[k - 1].x1;
      if (gap > Math.max(cw * 2.2, pageWidth * 0.025)) splits.push({ i, x: l.words[k].x0 });
    }
  });
  if (splits.length < 4) return lines;
  // Häufigste Position (±3 % der Breite)
  const tol = pageWidth * 0.03;
  let best = { x: 0, n: 0 };
  for (const s of splits) {
    const n = splits.filter((t) => Math.abs(t.x - s.x) <= tol).length;
    if (n > best.n) best = { x: s.x, n };
  }
  if (best.n < 4 || best.x < pageWidth * 0.2 || best.x > pageWidth * 0.8) return lines;
  const X = best.x - tol;
  const rows = splits.filter((s) => Math.abs(s.x - best.x) <= tol).map((s) => s.i);
  const from = Math.min(...rows);
  // Ende des zweispaltigen Bereichs: bis zur letzten Zeile, die rechts von X beginnt oder eine Lücke an X hat
  let to = Math.max(...rows);
  for (let i = to + 1; i < lines.length; i++) {
    if (lines[i].x0 >= X || lines[i].x1 < X) to = i;
    else break;
  }
  const left: LayoutLine[] = [];
  const right: LayoutLine[] = [];
  for (let i = from; i <= to; i++) {
    const l = lines[i];
    const lw = l.words.filter((w) => w.x0 < X);
    const rw = l.words.filter((w) => w.x0 >= X);
    if (lw.length) left.push(lineFromWords(lw, l.confidence));
    if (rw.length) right.push(lineFromWords(rw, l.confidence));
  }
  const byY = (a: LayoutLine, b: LayoutLine) => a.y0 - b.y0;
  return [...lines.slice(0, from), ...left.sort(byY), ...right.sort(byY), ...lines.slice(to + 1)];
}
