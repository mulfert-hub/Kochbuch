// Lese-/Schreibfunktionen rund um Rezepte, Kategorien, Bilder und Einkaufsliste.
import { db } from './db';
import type { Category, Ingredient, Recipe, RecipeDraft, ShoppingItem } from '../types';
import { uid } from '../lib/id';
import { mergeIntoList } from '../lib/shopping';
import { parseIngredientLine } from '../lib/ingredientParser';

export const DEFAULT_CATEGORIES = ['Frühstück', 'Vorspeise', 'Hauptgericht', 'Beilage', 'Dessert', 'Backen'];

export async function ensureDefaultCategories(): Promise<void> {
  if ((await db.categories.count()) > 0) return;
  await db.categories.bulkAdd(DEFAULT_CATEGORIES.map((name, order) => ({ id: uid(), name, order })));
}

// ---------- Rezepte ----------

export async function createRecipe(draft: RecipeDraft, images: Blob[] = []): Promise<string> {
  const id = uid();
  const now = Date.now();
  const imageIds: string[] = [];
  await db.transaction('rw', db.recipes, db.images, async () => {
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

export async function deleteRecipe(id: string): Promise<void> {
  await db.transaction('rw', db.recipes, db.images, async () => {
    await db.images.where('recipeId').equals(id).delete();
    await db.recipes.delete(id);
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
  await db.transaction('rw', db.categories, db.recipes, async () => {
    await db.categories.delete(id);
    const affected = await db.recipes.where('categoryIds').equals(id).toArray();
    for (const r of affected) {
      await db.recipes.update(r.id, { categoryIds: r.categoryIds.filter((c) => c !== id) });
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
