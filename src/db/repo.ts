// Lese-/Schreibfunktionen rund um Rezepte, Kategorien, Bilder und Einkaufsliste.
import { addTombstones, db, tombstoneRecipes } from './db';
import type { Category, Ingredient, Recipe, RecipeDraft, ShoppingItem } from '../types';
import { uid } from '../lib/id';
import type { PhotoCredit } from '../lib/photoSearch';
import { mergeIntoList } from '../lib/shopping';
import { parseIngredientLine } from '../lib/ingredientParser';

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const DEFAULT_CATEGORIES = ['Frühstück', 'Vorspeise', 'Hauptgericht', 'Beilage', 'Dessert', 'Backen'];

export async function ensureDefaultCategories(): Promise<void> {
  if ((await db.categories.count()) > 0) return;
  // Feste IDs, damit zwei Geräte beim Synchronisieren dieselben Standard-Kategorien haben
  await db.categories.bulkAdd(DEFAULT_CATEGORIES.map((name, order) => ({ id: `cat-${slug(name)}`, name, order })));
}

// ---------- Rezepte ----------

export async function createRecipe(draft: RecipeDraft, images: Blob[] = []): Promise<string> {
  const id = uid();
  const now = Date.now();
  const imageIds: string[] = [];
  let photoId: string | null = null;
  await db.transaction('rw', db.recipes, db.images, async () => {
    if (draft.photo) {
      photoId = uid();
      await db.images.add({ id: photoId, recipeId: id, blob: draft.photo, type: draft.photo.type || 'image/jpeg', createdAt: now });
    }
    for (const blob of images) {
      const imgId = uid();
      imageIds.push(imgId);
      await db.images.add({ id: imgId, recipeId: id, blob, type: blob.type || 'image/png', createdAt: now });
    }
    await db.recipes.add({
      id,
      title: draft.title.trim() || 'Ohne Titel',
      servings: draft.servings,
      servingsLabel: draft.servingsLabel,
      categoryIds: draft.categoryIds,
      ingredients: cleanIngredients(draft.ingredients),
      steps: draft.steps.map((s) => s.trim()).filter(Boolean),
      notes: draft.notes?.trim() || undefined,
      timeMinutes: draft.timeMinutes ?? null,
      imageIds,
      photoId,
      photoCredit: draft.photo ? (draft.photoCredit ?? null) : null,
      ocrText: draft.ocrText || undefined,
      createdAt: now,
      updatedAt: now,
    });
  });
  return id;
}

function cleanIngredients(list: Ingredient[]): Ingredient[] {
  return list.filter((i) => i.name.trim()).map((i) => ({ ...i, name: i.name.trim(), note: i.note?.trim() || undefined }));
}

export async function updateRecipe(id: string, patch: Partial<Recipe>): Promise<void> {
  const clean = { ...patch };
  if (clean.ingredients) clean.ingredients = cleanIngredients(clean.ingredients);
  if (clean.steps) clean.steps = clean.steps.map((s) => s.trim()).filter(Boolean);
  await db.recipes.update(id, { ...clean, updatedAt: Date.now() });
}

/** Foto vom Gericht setzen (Blob) oder entfernen (null). */
export async function setRecipePhoto(id: string, photo: Blob | null, credit: PhotoCredit | null = null): Promise<void> {
  const r = await db.recipes.get(id);
  if (!r) return;
  await db.transaction('rw', db.recipes, db.images, async () => {
    if (r.photoId) await db.images.delete(r.photoId);
    let photoId: string | null = null;
    if (photo) {
      photoId = uid();
      await db.images.add({ id: photoId, recipeId: id, blob: photo, type: photo.type || 'image/jpeg', createdAt: Date.now() });
    }
    await db.recipes.update(id, { photoId, photoCredit: photo ? credit : null, updatedAt: Date.now() });
  });
}

export async function deleteRecipe(id: string): Promise<void> {
  await db.transaction('rw', db.recipes, db.images, db.tombstones, async () => {
    const r = await db.recipes.get(id);
    await db.images.where('recipeId').equals(id).delete();
    await db.recipes.delete(id);
    if (r) await tombstoneRecipes([r]);
  });
}

export async function addImagesToRecipe(id: string, blobs: Blob[]): Promise<void> {
  const r = await db.recipes.get(id);
  if (!r) return;
  const ids: string[] = [];
  for (const blob of blobs) {
    const imgId = uid();
    ids.push(imgId);
    await db.images.add({ id: imgId, recipeId: id, blob, type: blob.type, createdAt: Date.now() });
  }
  await updateRecipe(id, { imageIds: [...r.imageIds, ...ids] });
}

export async function removeImage(recipeId: string, imageId: string): Promise<void> {
  const r = await db.recipes.get(recipeId);
  await db.images.delete(imageId);
  if (r) await updateRecipe(recipeId, { imageIds: r.imageIds.filter((i) => i !== imageId) });
}

// ---------- Kategorien ----------

export async function addCategory(name: string): Promise<Category> {
  const max = (await db.categories.orderBy('order').last())?.order ?? -1;
  const c = { id: uid(), name: name.trim(), order: max + 1 };
  await db.categories.add(c);
  return c;
}

export async function renameCategory(id: string, name: string): Promise<void> {
  await db.categories.update(id, { name: name.trim() });
}

export async function deleteCategory(id: string): Promise<void> {
  await db.transaction('rw', db.categories, db.recipes, db.tombstones, async () => {
    await db.categories.delete(id);
    await addTombstones('category', [id]);
    const affected = await db.recipes.where('categoryIds').equals(id).toArray();
    for (const r of affected) {
      await db.recipes.update(r.id, { categoryIds: r.categoryIds.filter((c) => c !== id), updatedAt: Date.now() });
    }
  });
}

export async function moveCategory(id: string, dir: -1 | 1): Promise<void> {
  const cats = await db.categories.orderBy('order').toArray();
  const i = cats.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= cats.length) return;
  [cats[i], cats[j]] = [cats[j], cats[i]];
  await db.transaction('rw', db.categories, async () => {
    for (let k = 0; k < cats.length; k++) await db.categories.update(cats[k].id, { order: k });
  });
}

// ---------- Einkaufsliste ----------

export async function addToShopping(recipe: Recipe, servings: number | null): Promise<number> {
  const factor = recipe.servings && servings ? servings / recipe.servings : 1;
  const before = await db.shopping.toArray();
  const after = mergeIntoList(before, {
    ingredients: recipe.ingredients,
    factor,
    source: { recipeId: recipe.id, title: recipe.title },
  });
  await db.shopping.bulkPut(after);
  return recipe.ingredients.length;
}

export async function toggleShopping(item: ShoppingItem): Promise<void> {
  await db.shopping.update(item.id, { checked: !item.checked });
}

export async function addManualShopping(text: string): Promise<void> {
  const before = await db.shopping.toArray();
  const after = mergeIntoList(before, {
    ingredients: [parseIngredientLine(text)],
    factor: 1,
    source: { recipeId: 'manuell', title: 'Manuell' },
  });
  await db.shopping.bulkPut(after);
}
