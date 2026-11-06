// Zerlegt eine Zutatenzeile wie „1 ½ EL Olivenöl, kaltgepresst“ in Menge, Einheit, Name und Notiz.
import type { Ingredient } from '../types';
import { parseLeadingQuantity, QUANTITY_RE } from './quantity';
import { lookupUnit } from './units';
import { uid } from './id';

/** Typische OCR-Verwechslungen am Zeilenanfang korrigieren. */
export function normalizeOcrLine(line: string): string {
  let s = line
    .replace(/[   ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // „%“, „Vz“, „Y%“ … werden häufig für „½“ gelesen (auch hinter einem Aufzählungspunkt)
  s = s.replace(/^((?:[•●*°oe]\s+)?)(?:%|Vz|Y2|V2|Y%|V%|Ye)(?=\s)/, '$1½');
  // Aufzählungszeichen am Anfang entfernen
  s = s.replace(/^(?:[•●○◦▪▫■□·*»>✓✔☐☑°º«-]|[oe]\s(?=[\d½¼¾⅓⅔]))\s*/u, '');
  // „l EL“, „I TL“ → „1 EL“ (kleines L / großes I statt Eins vor einer Einheit)
  s = s.replace(/^[lI|](?=\s+\S)/, (m, offset, str) => {
    const next = str.slice(offset + 1).trim().split(/\s/)[0] ?? '';
    return lookupUnit(next) ? '1' : m;
  });
  // „%“ oder „Vz“ wird häufig für „½“ gelesen
  s = s.replace(/^(?:%|Vz|Y2|V2)(?=\s)/, '½');
  // „1%“ → „1½“, wenn eine Einheit folgt
  s = s.replace(/^(\d+)%(?=\s)/, '$1½');
  // „309g“: das „g“ wurde doppelt gelesen (als 9 und g) → „30 g“
  s = s.replace(/^(\d{2,})9g(?=\s|$)/, '$1 g');
  // O statt 0 in Zahlen: „2O0 g“ → „200 g“
  s = s.replace(/^(\d+)[oO](\d*)/, (_m, a, b) => `${a}0${b}`);
  // „200g“ → „200 g“, „1EL“ → „1 EL“
  s = s.replace(/^(\d+(?:[.,]\d+)?|[½¼¾⅓⅔])([A-Za-zÄÖÜäöü])/, '$1 $2');
  return s;
}

/** Hat die Zeile eine Menge am Anfang? */
export function startsWithQuantity(line: string): boolean {
  return QUANTITY_RE.test(normalizeOcrLine(line));
}

/** Besteht die Zeile nur aus Menge (+ Einheit), z. B. „200 g“ oder „2 EL“? */
export function isPureQuantity(line: string): boolean {
  const s = normalizeOcrLine(line);
  const q = parseLeadingQuantity(s);
  if (!q) return false;
  const rest = s.slice(q.length).trim();
  if (!rest) return true;
  return !!lookupUnit(rest) && !rest.includes(' ');
}

function splitNote(name: string): { name: string; note?: string } {
  let n = name.trim();
  let note: string | undefined;
  const paren = n.match(/\s*\(([^)]*)\)\s*/);
  if (paren) {
    note = paren[1].trim();
    n = (n.slice(0, paren.index) + ' ' + n.slice((paren.index ?? 0) + paren[0].length)).trim();
  }
  const comma = n.indexOf(',');
  if (comma > 0) {
    const extra = n.slice(comma + 1).trim();
    n = n.slice(0, comma).trim();
    note = note ? `${extra}, ${note}` : extra;
  }
  return { name: n.replace(/\s+/g, ' '), note: note || undefined };
}

/** Parst eine Zutatenzeile. Liefert immer eine Zutat (ggf. ohne Menge). */
/** „Mozzarella            1 Kugel“ (Menge rechtsbündig in eigener Spalte) → „1 Kugel Mozzarella“ */
export function reorderColumns(raw: string): string {
  const cols = raw.trim().split(/\s{3,}/);
  if (cols.length === 2 && !startsWithQuantity(cols[0]) && isPureQuantity(cols[1])) return `${cols[1]} ${cols[0]}`;
  return raw;
}

export function parseIngredientLine(raw: string, group?: string): Ingredient {
  const line = normalizeOcrLine(reorderColumns(raw));
  let quantity: number | null = null;
  let quantityMax: number | null = null;
  let unit = '';
  let rest = line;

  const q = parseLeadingQuantity(line);
  if (q) {
    quantity = q.value;
    quantityMax = q.max;
    rest = line.slice(q.length).trim();
    const [first, ...others] = rest.split(' ');
    const u = first ? lookupUnit(first) : undefined;
    if (u) {
      unit = u.key;
      rest = others.join(' ');
    } else if (/^(gehäufte?r?|gestrichene?r?|kleine?r?|große?r?|mittelgroße?r?)$/i.test(first ?? '') && others[0] && lookupUnit(others[0])) {
      // „2 gehäufte EL Mehl“ → Einheit EL, Zusatz als Notiz
      unit = lookupUnit(others[0])!.key;
      rest = others.slice(1).join(' ') + `, ${first}`;
    }
  } else {
    // Menge am Ende: „Mehl 200 g“ oder „Mehl ..... 200 g“
    const m = line.match(/^(.*?[A-Za-zÄÖÜäöüß)])\s*[.…·:]*\s+(\d+(?:[.,]\d+)?|\d+\s*\/\s*\d+|[½¼¾⅓⅔])\s*([A-Za-zÄÖÜäöü.]*)$/);
    if (m) {
      const tail = parseLeadingQuantity(m[2]);
      const u = m[3] ? lookupUnit(m[3]) : undefined;
      if (tail && (u || !m[3])) {
        quantity = tail.value;
        unit = u?.key ?? '';
        rest = m[1];
      }
    }
  }

  // „Salz und Pfeffer“, „etwas Butter“ bleiben ohne Menge
  const { name, note } = splitNote(rest.replace(/^(?:von\s+|der\s+|des\s+)/i, ''));
  return {
    id: uid(),
    quantity,
    quantityMax,
    unit,
    name: name || rest || raw.trim(),
    note,
    group,
  };
}

/** Zutat wieder als Textzeile (für das Bearbeiten in einem Textfeld). */
export function ingredientToLine(i: Ingredient): string {
  const parts: string[] = [];
  if (i.quantity != null) {
    const q = String(i.quantity).replace('.', ',');
    parts.push(i.quantityMax != null ? `${q}-${String(i.quantityMax).replace('.', ',')}` : q);
  }
  if (i.unit) parts.push(i.unit);
  parts.push(i.name);
  let s = parts.join(' ');
  if (i.note) s += `, ${i.note}`;
  return s;
}
