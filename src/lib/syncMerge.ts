// Zusammenführen zweier Datenstände (dieses Gerät + Google Drive).
// Regeln: pro Rezept/Kategorie gewinnt die neuere Änderung; Gelöschtes bleibt gelöscht, wenn die
// Löschung neuer ist als die letzte Änderung; gleiche Kategorien (Name) und exakt doppelte Rezepte
// (z. B. Beispielrezepte auf beiden Handys) werden zusammengelegt. Reine Funktion, damit testbar.
import type { Category, Recipe, ShoppingItem } from '../types';
import type { TagInfoMap } from './tags';
import { fold } from './search';

export interface SyncTombstone {
  id: string;
  kind: 'recipe' | 'category' | 'shopping';
  deletedAt: number;
  /** Inhaltsschlüssel gelöschter Rezepte: entfernt auch inhaltsgleiche Kopien auf anderen Geräten */
  key?: string;
}

export interface Snapshot {
  recipes: Recipe[];
  categories: Category[];
  tombstones: SyncTombstone[];
  /** Einkaufsliste (ältere Datenstände ohne Liste: undefined) */
  shopping?: ShoppingItem[];
  /** Bedeutungen von Tags */
  tagInfo?: TagInfoMap;
}

function newer<T extends { updatedAt?: number }>(a: T | undefined, b: T | undefined): T | undefined {
  if (!a) return b;
  if (!b) return a;
  return (b.updatedAt ?? 0) > (a.updatedAt ?? 0) ? b : a;
}

export function contentKey(r: Recipe): string {
  return [fold(r.title.trim()), r.ingredients.map((i) => `${i.quantity}${i.unit}${fold(i.name)}`).join(','), r.steps.map((s) => fold(s)).join('|')].join('#');
}

export function mergeSnapshots(a: Snapshot, b: Snapshot, now = Date.now()): Snapshot {
  // 1) Löschvermerke vereinigen (spätester gewinnt)
  const tomb = new Map<string, SyncTombstone>();
  for (const t of [...a.tombstones, ...b.tombstones]) {
    const prev = tomb.get(t.id);
    if (!prev || t.deletedAt > prev.deletedAt) tomb.set(t.id, t);
  }
  const deletedKeys = new Map<string, number>();
  for (const t of tomb.values()) if (t.key) deletedKeys.set(t.key, Math.max(deletedKeys.get(t.key) ?? 0, t.deletedAt));
  const deleted = (id: string, updatedAt = 0) => {
    const t = tomb.get(id);
    return !!t && t.deletedAt >= updatedAt;
  };
  const deletedByContent = (r: Recipe) => {
    const at = deletedKeys.get(contentKey(r));
    return at != null && at >= r.updatedAt;
  };

  // 2) Kategorien: neuere Version gewinnt, Gelöschtes raus
  const catMap = new Map<string, Category>();
  for (const c of [...a.categories, ...b.categories]) catMap.set(c.id, newer(catMap.get(c.id), c)!);
  let categories = [...catMap.values()].filter((c) => !deleted(c.id, c.updatedAt));

  // Gleichnamige Kategorien zusammenlegen (deterministisch: kleinste ID bleibt)
  const remap = new Map<string, string>();
  const byName = new Map<string, Category>();
  for (const c of [...categories].sort((x, y) => (x.id < y.id ? -1 : 1))) {
    const key = fold(c.name.trim());
    const keep = byName.get(key);
    if (keep) {
      remap.set(c.id, keep.id);
      tomb.set(c.id, { id: c.id, kind: 'category', deletedAt: Math.max(now, c.updatedAt ?? 0) });
    } else byName.set(key, c);
  }
  categories = [...byName.values()].sort((x, y) => x.order - y.order || x.name.localeCompare(y.name, 'de'));
  const catIds = new Set(categories.map((c) => c.id));

  // 3) Rezepte: neuere Version gewinnt, Gelöschtes raus, Kategorie-IDs bereinigen
  const recMap = new Map<string, Recipe>();
  for (const r of [...a.recipes, ...b.recipes]) recMap.set(r.id, newer(recMap.get(r.id), r)!);
  let recipes = [...recMap.values()]
    .filter((r) => !deleted(r.id, r.updatedAt) && !deletedByContent(r))
    .map((r) => {
      const ids = [...new Set(r.categoryIds.map((id) => remap.get(id) ?? id))].filter((id) => catIds.has(id));
      return ids.length === r.categoryIds.length && ids.every((id, i) => id === r.categoryIds[i]) ? r : { ...r, categoryIds: ids };
    });

  // Exakte Duplikate zusammenlegen: ältestes Rezept bleibt
  const seen = new Map<string, Recipe>();
  for (const r of [...recipes].sort((x, y) => x.createdAt - y.createdAt || (x.id < y.id ? -1 : 1))) {
    const k = contentKey(r);
    if (seen.has(k)) tomb.set(r.id, { id: r.id, kind: 'recipe', deletedAt: Math.max(now, r.updatedAt) });
    else seen.set(k, r);
  }
  recipes = [...seen.values()];

  // 4) Einkaufsliste: pro Eintrag neuere Version gewinnt, Gelöschtes raus
  const shopMap = new Map<string, ShoppingItem>();
  for (const i of [...(a.shopping ?? []), ...(b.shopping ?? [])]) shopMap.set(i.id, newer(shopMap.get(i.id), i)!);
  const shopping = [...shopMap.values()].filter((i) => !deleted(i.id, i.updatedAt)).sort((x, y) => x.order - y.order || (x.id < y.id ? -1 : 1));

  // 5) Tag-Bedeutungen: pro Tag neuere gewinnt
  const tagInfo: TagInfoMap = { ...(a.tagInfo ?? {}) };
  for (const [k, v] of Object.entries(b.tagInfo ?? {})) if (!tagInfo[k] || v.updatedAt > tagInfo[k].updatedAt) tagInfo[k] = v;

  return { recipes, categories, tombstones: [...tomb.values()], shopping, tagInfo };
}

/** Alle Bild-IDs, die von Rezepten benutzt werden */
export function usedImageIds(recipes: Recipe[]): Set<string> {
  const s = new Set<string>();
  for (const r of recipes) {
    for (const id of r.imageIds) s.add(id);
    if (r.photoId) s.add(r.photoId);
  }
  return s;
}
