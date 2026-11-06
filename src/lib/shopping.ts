// Einkaufsliste: Zutaten zusammenführen, Mengen addieren (mit Einheitenumrechnung).
import type { Ingredient, ShoppingItem, ShoppingSource } from '../types';
import { fromBase, singularize, toBase } from './units';
import { uid } from './id';

/** Vergleichsschlüssel für Zutatennamen: „Zwiebeln (rot)“ ≈ „zwiebel“. */
export function normalizeIngredientName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/,.*$/, '')
    .replace(/^(?:etwas|einige|ein paar|evtl\.?|ggf\.?|frische[rsn]?|frisch)\s+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(singularize)
    .join(' ');
}

function keyOf(name: string, unit: string): string {
  return `${normalizeIngredientName(name)}|${unit}`;
}

export interface AddRequest {
  ingredients: Ingredient[];
  factor: number;
  source: ShoppingSource;
}

/**
 * Fügt Zutaten zu einer bestehenden Liste hinzu. Gibt die komplette neue Liste zurück
 * (Mengen werden intern in g bzw. ml gespeichert und bei der Anzeige umgerechnet).
 */
export function mergeIntoList(list: ShoppingItem[], req: AddRequest): ShoppingItem[] {
  const items = list.map((i) => ({ ...i, sources: [...i.sources] }));
  let order = items.reduce((m, i) => Math.max(m, i.order), 0);
  for (const ing of req.ingredients) {
    if (!ing.name.trim()) continue;
    const scaled = ing.quantity == null ? null : (ing.quantityMax ?? ing.quantity) * req.factor;
    const base = toBase(ing.unit, scaled);
    const key = keyOf(ing.name, base.unit);
    // Nicht abgehakte Einträge bevorzugen, damit Erledigtes nicht „wieder auftaucht“
    const existing =
      items.find((i) => !i.checked && keyOf(i.name, i.unit) === key) ?? items.find((i) => keyOf(i.name, i.unit) === key);
    if (existing) {
      if (existing.checked) {
        existing.checked = false;
        existing.quantity = base.quantity;
      } else if (base.quantity != null) {
        existing.quantity = (existing.quantity ?? 0) + base.quantity;
      }
      if (!existing.sources.some((s) => s.recipeId === req.source.recipeId)) existing.sources.push(req.source);
    } else {
      items.push({
        id: uid(),
        name: ing.name.trim(),
        unit: base.unit,
        quantity: base.quantity,
        checked: false,
        sources: [req.source],
        order: ++order,
      });
    }
  }
  return items;
}

/** Für die Anzeige: 1500 g → 1,5 kg. */
export function displayItem(item: ShoppingItem): { quantity: number | null; unit: string } {
  return fromBase(item.unit, item.quantity);
}
