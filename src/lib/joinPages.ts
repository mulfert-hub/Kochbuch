// Mehrere Screenshots eines Rezepts zu einem Text zusammenfügen.
// Beim Scrollen überlappen sich Screenshots; zudem sind Rand-Zeilen oft angeschnitten
// (OCR liefert dort Zeichensalat). Wir suchen die längste übereinstimmende Zeilenfolge
// zwischen dem Ende des bisherigen Texts und dem Anfang des nächsten Bildes.
import { isNavBar, type OcrLine } from './recipeParser';

export const normLine = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function similar(a: string, b: string): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const m = a.length, n = b.length;
  if (Math.abs(m - n) > Math.max(m, n) * 0.25) return false;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n] / Math.max(m, n) <= 0.2;
}

/** Zeilen, die auf jedem Bild an derselben Kante stehen (Statusleiste oben, Tab-Leiste unten) */
function chromeLines(pages: OcrLine[][]): Set<string> {
  if (pages.length < 2) return new Set();
  const out = new Set<string>();
  for (const pick of [(p: OcrLine[]) => p.slice(0, 2), (p: OcrLine[]) => p.slice(-2)]) {
    const sets = pages.map((p) => new Set(pick(p).map((l) => normLine(l.text))));
    for (const t of sets[0]) if (t.length > 1 && sets.every((s) => s.has(t))) out.add(t);
  }
  return out;
}

export function joinPages(input: OcrLine[][]): OcrLine[] {
  const chrome = chromeLines(input);
  const pages = input.map((p) => p.filter((l) => !chrome.has(normLine(l.text)) && !isNavBar(l.text)));
  let out: OcrLine[] = [];
  for (const page of pages) {
    if (!out.length) {
      out = [...page];
      continue;
    }
    // a = angeschnittene Zeilen am Ende von out, b = angeschnittene Zeilen am Anfang der Seite
    let best = { k: 0, a: 0, b: 0 };
    const A = out.map((l) => normLine(l.text));
    const B = page.map((l) => normLine(l.text));
    for (let a = 0; a <= 2; a++) {
      for (let b = 0; b <= 2; b++) {
        const maxK = Math.min(A.length - a, B.length - b);
        for (let k = maxK; k > best.k; k--) {
          let ok = true;
          let mismatches = 0;
          for (let i = 0; i < k && ok; i++) {
            if (!similar(A[A.length - a - k + i], B[b + i])) {
              mismatches++;
              if (mismatches > Math.floor(k / 6)) ok = false;
            }
          }
          if (ok) {
            best = { k, a, b };
            break;
          }
        }
      }
    }
    if (best.k >= 2 || (best.k === 1 && B[best.b].length > 6)) {
      // Im Überlappungsbereich die sicherer erkannte Fassung behalten
      // (Randzeilen sind oft angeschnitten oder von Leisten verdeckt)
      const start = out.length - best.a - best.k;
      const merged = out.slice(start, start + best.k).map((l, i) => {
        const p = page[best.b + i];
        if (normLine(l.text) === normLine(p.text)) return l;
        return (p.confidence ?? 0) > (l.confidence ?? 0) ? { ...p, paragraphStart: l.paragraphStart } : l;
      });
      out = [...out.slice(0, start), ...merged, ...page.slice(best.b + best.k)];
    } else {
      const rest = page.map((l, i) => (i === 0 ? { ...l, paragraphStart: true } : l));
      out = [...out, ...rest];
    }
  }
  return out;
}
