// Export/Import aller Daten als eine JSON-Datei (Bilder als Base64-Data-URLs).
import { addTombstones, db } from './db';
import type { Category, Recipe, ShoppingItem, StoredImage } from '../types';

const FORMAT = 'kochbuch-backup';
const VERSION = 1;

interface BackupImage {
  id: string;
  recipeId: string | null;
  type: string;
  data: string; // data:-URL
  createdAt: number;
}

export interface BackupFile {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  recipes: Recipe[];
  categories: Category[];
  images: BackupImage[];
  shopping: ShoppingItem[];
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  return res.blob();
}

export async function createBackup(): Promise<Blob> {
  const [recipes, categories, images, shopping] = await Promise.all([
    db.recipes.toArray(),
    db.categories.toArray(),
    db.images.toArray(),
    db.shopping.toArray(),
  ]);
  const imgs: BackupImage[] = [];
  for (const i of images) {
    imgs.push({ id: i.id, recipeId: i.recipeId, type: i.type, createdAt: i.createdAt, data: await blobToDataUrl(i.blob) });
  }
  const file: BackupFile = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    recipes,
    categories,
    images: imgs,
    shopping,
  };
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

export function backupFileName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `kochbuch-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

export async function downloadBackup(): Promise<void> {
  const blob = await createBackup();
  const name = backupFileName();
  const file = new File([blob], name, { type: 'application/json' });
  // Auf dem Handy: Teilen-Dialog (z. B. „In Dateien sichern“), sonst normaler Download
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Kochbuch-Backup' });
      return;
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export interface ImportResult {
  recipes: number;
  images: number;
  categories: number;
  skipped: number;
}

/**
 * Spielt ein Backup ein.
 * mode „merge“: vorhandene Daten bleiben, gleiche IDs werden durch das Backup ersetzt.
 * mode „replace“: alles wird gelöscht und durch das Backup ersetzt.
 */
export async function restoreBackup(file: File, mode: 'merge' | 'replace'): Promise<ImportResult> {
  const text = await file.text();
  let data: BackupFile;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Die Datei ist kein gültiges JSON.');
  }
  if (data.format !== FORMAT || !Array.isArray(data.recipes)) {
    throw new Error('Das ist keine Kochbuch-Backup-Datei.');
  }
  if (data.version > VERSION) throw new Error('Das Backup stammt aus einer neueren App-Version.');

  const images: StoredImage[] = [];
  let skipped = 0;
  for (const i of data.images ?? []) {
    try {
      images.push({ id: i.id, recipeId: i.recipeId, type: i.type, createdAt: i.createdAt, blob: await dataUrlToBlob(i.data) });
    } catch {
      skipped++;
    }
  }

  await db.transaction('rw', [db.recipes, db.categories, db.images, db.shopping, db.tombstones], async () => {
    if (mode === 'replace') {
      const keep = new Set(data.recipes.map((r) => r.id));
      const keepCats = new Set((data.categories ?? []).map((c) => c.id));
      const ids = (await db.recipes.toCollection().primaryKeys()) as string[];
      const catIds = (await db.categories.toCollection().primaryKeys()) as string[];
      await addTombstones('recipe', ids.filter((id) => !keep.has(id)));
      await addTombstones('category', catIds.filter((id) => !keepCats.has(id)));
      await db.tombstones.bulkDelete([...keep, ...keepCats]);
      await Promise.all([db.recipes.clear(), db.categories.clear(), db.images.clear(), db.shopping.clear()]);
    }
    if (mode === 'merge') {
      // Kategorien mit gleichem Namen zusammenführen statt doppelt anlegen
      const existing = await db.categories.toArray();
      const remap = new Map<string, string>();
      let order = existing.reduce((m, c) => Math.max(m, c.order), -1);
      for (const c of data.categories ?? []) {
        const same = existing.find((e) => e.id === c.id || e.name.toLowerCase() === c.name.toLowerCase());
        if (same) remap.set(c.id, same.id);
        else await db.categories.put({ ...c, order: ++order });
      }
      for (const r of data.recipes) r.categoryIds = r.categoryIds.map((id) => remap.get(id) ?? id);
    } else {
      await db.categories.bulkPut(data.categories ?? []);
    }
    await db.recipes.bulkPut(data.recipes);
    await db.images.bulkPut(images);
    if (data.shopping?.length) await db.shopping.bulkPut(data.shopping);
  });

  return { recipes: data.recipes.length, images: images.length, categories: data.categories?.length ?? 0, skipped };
}
