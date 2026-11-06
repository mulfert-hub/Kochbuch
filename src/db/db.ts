import Dexie, { type EntityTable } from 'dexie';
import type { Category, Recipe, ShoppingItem, StoredImage } from '../types';

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
};

db.version(1).stores({
  recipes: 'id, title, *categoryIds, updatedAt, createdAt',
  categories: 'id, order',
  images: 'id, recipeId',
  shopping: 'id, order, checked',
  settings: 'key',
});

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const s = await db.settings.get(key);
  return (s?.value as T) ?? fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}
