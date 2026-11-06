// Mengen parsen, skalieren und in deutscher Schreibweise formatieren.
import { isMetric, unitLabel } from './units';

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 1 / 2,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 1 / 4,
  '¾': 3 / 4,
  '⅕': 1 / 5,
  '⅖': 2 / 5,
  '⅗': 3 / 5,
  '⅘': 4 / 5,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
};
const FRAC_CHARS = Object.keys(UNICODE_FRACTIONS).join('');

// Eine einzelne Zahl: „1 1/2“, „1½“, „½“, „1/2“, „1,5“, „1.5“, „200“
const NUM = `(?:\\d+\\s+\\d+\\s*[/⁄]\\s*\\d+|\\d+\\s*[${FRAC_CHARS}]|[${FRAC_CHARS}]|\\d+\\s*[/⁄]\\s*\\d+|\\d+(?:[.,]\\d+)?)`;
// Mit optionaler Spanne: „2-3“, „2 – 3“, „2 bis 3“
export const QUANTITY_RE = new RegExp(`^(?:ca\\.?\\s*|etwa\\s+|circa\\s+)?(${NUM})(?:\\s*(?:-|–|—|bis)\\s*(${NUM}))?`, 'i');

/** Wandelt einen einzelnen Zahl-Ausdruck in eine Zahl um. */
export function parseNumber(raw: string): number | null {
  const s = raw.trim().replace(/⁄/g, '/');
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/))) {
    const d = Number(m[3]);
    return d ? Number(m[1]) + Number(m[2]) / d : null;
  }
  if ((m = s.match(new RegExp(`^(\\d+)\\s*([${FRAC_CHARS}])$`)))) return Number(m[1]) + UNICODE_FRACTIONS[m[2]];
  if (UNICODE_FRACTIONS[s] != null) return UNICODE_FRACTIONS[s];
  if ((m = s.match(/^(\d+)\s*\/\s*(\d+)$/))) {
    const d = Number(m[2]);
    return d ? Number(m[1]) / d : null;
  }
  if (/^\d+([.,]\d+)?$/.test(s)) {
    // „1.000“ als Tausender wäre bei Rezepten selten; „1.5“ ist eher eine Dezimalzahl.
    return Number(s.replace(',', '.'));
  }
  return null;
}

export interface ParsedQuantity {
  value: number;
  max: number | null;
  /** Länge des erkannten Texts am Anfang. */
  length: number;
}

/** Erkennt eine Menge am Anfang eines Strings. */
export function parseLeadingQuantity(text: string): ParsedQuantity | null {
  const m = text.match(QUANTITY_RE);
  if (!m) return null;
  const value = parseNumber(m[1]);
  if (value == null) return null;
  const max = m[2] ? parseNumber(m[2]) : null;
  return { value, max: max != null && max > value ? max : null, length: m[0].length };
}

// ---------- Formatieren ----------

/** Zahl mit Komma, ohne überflüssige Nullen. */
export function formatDecimalDE(n: number, maxDecimals = 2): string {
  const f = Math.pow(10, maxDecimals);
  const rounded = Math.round(n * f) / f;
  let s = rounded.toFixed(maxDecimals);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('.', ',');
}

const NICE_FRACTIONS: [number, string][] = [
  [0, ''],
  [1 / 8, '⅛'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [1 / 2, '½'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
  [1, ''],
];

/** Metrische Mengen sinnvoll runden (g, ml …). */
function roundMetric(n: number, unit: string): number {
  if (unit === 'kg' || unit === 'l') {
    return n < 2 ? Math.round(n * 20) / 20 : Math.round(n * 10) / 10;
  }
  if (unit === 'cm') return Math.round(n * 2) / 2;
  if (n < 1) return Math.round(n * 10) / 10;
  if (n < 10) return Math.round(n * 2) / 2;
  if (n < 50) return Math.round(n);
  if (n < 250) return Math.round(n / 5) * 5;
  if (n < 1000) return Math.round(n / 10) * 10;
  return Math.round(n / 50) * 50;
}

/** Nicht-metrische Mengen (EL, Stück, Bund …) als Bruch darstellen. */
function formatFraction(n: number): string {
  if (n >= 10) return formatDecimalDE(Math.round(n * 2) / 2, 1);
  const whole = Math.floor(n);
  const rest = n - whole;
  let best = NICE_FRACTIONS[0];
  for (const f of NICE_FRACTIONS) {
    if (Math.abs(f[0] - rest) < Math.abs(best[0] - rest)) best = f;
  }
  // Nur ⅛ erlauben, wenn sonst gar nichts übrig bliebe.
  if (best[1] === '⅛' && whole > 0) best = rest < 1 / 16 ? NICE_FRACTIONS[0] : NICE_FRACTIONS[2];
  if (best[0] === 1) return String(whole + 1);
  if (whole === 0 && best[0] === 0) return n > 0 ? '⅛' : '0';
  return whole === 0 ? best[1] : `${whole}${best[1]}`;
}

/** Formatiert eine Menge passend zur Einheit („1½“, „250“, „1,25“). */
export function formatQuantity(n: number, unit: string): string {
  if (isMetric(unit)) {
    const r = roundMetric(n, unit);
    return formatDecimalDE(r === 0 ? n : r, r < 1 || unit === 'kg' || unit === 'l' ? 2 : 1);
  }
  return formatFraction(n);
}

/** Vollständige Mengenangabe inkl. Spanne und Einheit, z. B. „2–3 EL“ oder „250 g“. */
export function formatAmount(quantity: number | null, max: number | null | undefined, unit: string, factor = 1): string {
  if (quantity == null) return unit ? unitLabel(unit, 1) : '';
  const q = quantity * factor;
  const qm = max != null ? max * factor : null;
  let s = formatQuantity(q, unit);
  if (qm != null) s += `–${formatQuantity(qm, unit)}`;
  const label = unitLabel(unit, qm ?? q);
  return label ? `${s} ${label}` : s;
}
