import Dexie, { type EntityTable } from 'dexie';
import type { Category, Recipe, ShoppingItem, StoredImage } from '../types';
import { contentKey } from '../lib/syncMerge';

/** Merkzettel für gelöschte Einträge, damit die Synchronisation sie nicht wieder herstellt */
export interface Tombstone {
  id: string;
  kind: 'recipe' | 'category' | 'shopping';
  deletedAt: number;
  key?: string;
}

export interface Setting {
  key: string;
  value: unknown;
}

export const db = new Dexie('kochbuch') as Dexie & {
  recipes: EntityTable<Recipe, 'id'>;
  categories: EntityTable<Category, 'id'>;
  images: EntityTable<StoredImage, 'id'>;
  shopping: EntityTable<ShoppingItem, 'id'>;
  settings: EntityTable<Setting, 'key'>;
  tombstones: EntityTable<Tombstone, 'id'>;
};

db.version(1).stores({
  recipes: 'id, title, *categoryIds, updatedAt, createdAt',
  categories: 'id, order',
  images: 'id, recipeId',
  shopping: 'id, order, checked',
  settings: 'key',
});

db.version(2).stores({
  tombstones: 'id, kind',
});

// ---------- Änderungen melden (für die automatische Synchronisation) ----------
type Listener = () => void;
const changeListeners = new Set<Listener>();
let muted = 0;

/** Wird während die Synchronisation selbst schreibt aufgerufen, damit sie sich nicht selbst auslöst */
export async function withoutChangeEvents<T>(fn: () => Promise<T>): Promise<T> {
  muted++;
  try {
    return await fn();
  } finally {
    muted--;
  }
}

export function onLocalChange(fn: Listener): () => void {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
}

function notify() {
  if (muted) return;
  // erst nach Abschluss der Transaktion melden
  setTimeout(() => changeListeners.forEach((l) => l()), 0);
}

for (const table of [db.recipes, db.categories, db.images, db.tombstones, db.shopping, db.settings] as const) {
  table.hook('creating', notify);
  table.hook('updating', () => {
    notify();
    return undefined;
  });
  table.hook('deleting', notify);
}

// Kategorien und Einkaufsliste bekommen einen Änderungszeitpunkt (für „neuere Änderung gewinnt“).
// Nur bei echten Änderungen – ein unverändertes Speichern darf den Zeitpunkt nicht verschieben.
for (const table of [db.categories, db.shopping] as const) {
  (table as typeof db.categories).hook('creating', (_key, obj) => {
    if (!muted && obj.updatedAt == null) obj.updatedAt = Date.now();
  });
  (table as typeof db.categories).hook('updating', (mods) =>
    muted || 'updatedAt' in mods || Object.keys(mods).length === 0 ? undefined : { updatedAt: Date.now() },
  );
}

/** Gelöschte Einträge vormerken */
export async function addTombstones(kind: Tombstone['kind'], ids: string[], keys?: Map<string, string>): Promise<void> {
  const now = Date.now();
  await db.tombstones.bulkPut(ids.map((id) => ({ id, kind, deletedAt: now, key: keys?.get(id) })));
}

/** Löschvermerke für Rezepte inkl. Inhaltsschlüssel */
export async function tombstoneRecipes(recipes: Recipe[]): Promise<void> {
  await addTombstones(
    'recipe',
    recipes.map((r) => r.id),
    new Map(recipes.map((r) => [r.id, contentKey(r)])),
  );
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const s = await db.settings.get(key);
  return (s?.value as T) ?? fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

// ---------- Tag-Bedeutungen („Thea“ = „mild, ohne Alkohol“) – werden synchronisiert ----------
import type { TagInfoMap } from '../lib/tags';
export async function getTagInfo(): Promise<TagInfoMap> {
  return (await getSetting<TagInfoMap>('tagInfo', {})) ?? {};
}
export async function setTagMeaning(tag: string, desc: string): Promise<void> {
  const info = await getTagInfo();
  info[tag] = { desc: desc.trim(), updatedAt: Date.now() };
  await setSetting('tagInfo', info);
}
