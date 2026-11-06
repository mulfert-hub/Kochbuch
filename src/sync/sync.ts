// Synchronisation über ein privates GitHub-Repository (gemeinsam genutzter Token).
// Ablauf: Stand aus GitHub laden → mit diesem Gerät zusammenführen → lokal speichern →
// fehlende Bilder hoch-/herunterladen → neuen Stand nach GitHub schreiben.
// Speichert ein anderes Handy gleichzeitig, meldet GitHub einen Konflikt: dann neu laden und erneut zusammenführen.
import { useSyncExternalStore } from 'react';
import { db, getTagInfo, onLocalChange, withoutChangeEvents } from '../db/db';
import { mergeSnapshots, usedImageIds, type Snapshot } from '../lib/syncMerge';
import { AuthError, blobToBase64, ConflictError, GitHubClient, parseRepo, textToBase64 } from './github';

const DATA_FILE = 'kochbuch.json';
const IMG_DIR = 'bilder';
const SETTINGS_KEY = 'kochbuch-sync-github';

interface SyncSettings {
  enabled: boolean;
  repo: string;
  token: string;
  lastSync: number | null;
}

export interface SyncStatus {
  enabled: boolean;
  repo: string;
  running: boolean;
  lastSync: number | null;
  message: string | null;
  error: boolean;
}

function readSettings(): SyncSettings {
  const empty: SyncSettings = { enabled: false, repo: '', token: '', lastSync: null };
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return empty;
  }
}
function writeSettings(patch: Partial<SyncSettings>) {
  const s = { ...readSettings(), ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignorieren */
  }
  return s;
}

// ---------- Status für die Oberfläche ----------
let status: SyncStatus = computeStatus(null, false);
const listeners = new Set<() => void>();

function computeStatus(message: string | null, error: boolean, running = false): SyncStatus {
  const s = readSettings();
  return { enabled: s.enabled, repo: s.repo, running, lastSync: s.lastSync, message, error };
}
function setStatus(message: string | null, error = false, running = false) {
  status = computeStatus(message, error, running);
  listeners.forEach((l) => l());
}
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
  );
}

function client(s = readSettings()): GitHubClient | null {
  const r = parseRepo(s.repo);
  return r && s.token ? new GitHubClient(s.token, r.owner, r.repo) : null;
}

// ---------- Datenstand ----------
interface DataFile extends Snapshot {
  format: 'kochbuch-sync';
  version: 1;
  updatedAt: number;
}

async function localSnapshot(): Promise<Snapshot> {
  const [recipes, categories, tombstones, shopping, tagInfo] = await Promise.all([
    db.recipes.toArray(),
    db.categories.toArray(),
    db.tombstones.toArray(),
    db.shopping.toArray(),
    getTagInfo(),
  ]);
  return { recipes, categories, tombstones, shopping, tagInfo };
}

/** Lokale Tabellen auf den zusammengeführten Stand bringen */
async function applyLocally(merged: Snapshot): Promise<Snapshot> {
  return withoutChangeEvents(() =>
    db.transaction('rw', [db.recipes, db.categories, db.tombstones, db.images, db.shopping, db.settings], async () => {
      // Erneut lesen und zusammenführen, falls während des Downloads lokal etwas geändert wurde
      const final = mergeSnapshots(await localSnapshot(), merged);
      const replace = async <T extends { id: string }>(table: typeof db.recipes | typeof db.categories | typeof db.shopping, rows: T[]) => {
        const keep = new Set(rows.map((r) => r.id));
        const old = (await table.toCollection().primaryKeys()) as string[];
        await table.bulkDelete(old.filter((id) => !keep.has(id)));
        await (table as unknown as { bulkPut: (r: T[]) => Promise<unknown> }).bulkPut(rows);
      };
      await replace(db.recipes, final.recipes);
      await replace(db.categories, final.categories);
      await replace(db.shopping, final.shopping ?? []);
      await db.tombstones.bulkPut(final.tombstones);
      await db.settings.put({ key: 'tagInfo', value: final.tagInfo ?? {} });
      // Bilder gelöschter Rezepte aufräumen
      const used = usedImageIds(final.recipes);
      const imgIds = (await db.images.toCollection().primaryKeys()) as string[];
      await db.images.bulkDelete(imgIds.filter((id) => !used.has(id)));
      return final;
    }),
  );
}

let running: Promise<void> | null = null;
let again = false;

/** Jetzt synchronisieren. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = doSync().finally(() => {
    running = null;
    if (again) {
      again = false;
      void syncNow();
    }
  });
  return running;
}

async function doSync(): Promise<void> {
  const settings = readSettings();
  const gh = client(settings);
  if (!settings.enabled || !gh) return;
  if (!navigator.onLine) {
    setStatus('Offline – wird abgeglichen, sobald wieder Internet da ist.');
    return;
  }
  setStatus('Gleiche ab …', false, true);
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        await syncOnce(gh);
        break;
      } catch (e) {
        // Anderes Handy hat gleichzeitig gespeichert → neu laden und erneut zusammenführen
        if (e instanceof ConflictError && attempt < 3) continue;
        throw e;
      }
    }
    writeSettings({ lastSync: Date.now() });
    setStatus(null);
  } catch (e) {
    console.error(e);
    if (e instanceof AuthError) setStatus(`${e.message} Bitte unter „Mehr → Synchronisation“ einen neuen Token eintragen.`, true);
    else if (e instanceof ConflictError) setStatus('Das andere Handy speichert gerade – neuer Versuch in Kürze.', true);
    else setStatus(`Abgleich fehlgeschlagen: ${(e as Error).message}`, true);
  }
}

async function syncOnce(gh: GitHubClient): Promise<void> {
  const remoteFile = await gh.readText(DATA_FILE);
  let remote: Snapshot = { recipes: [], categories: [], tombstones: [], shopping: [] };
  if (remoteFile) {
    const json = JSON.parse(remoteFile.text) as DataFile;
    if (json.format === 'kochbuch-sync')
      remote = { recipes: json.recipes ?? [], categories: json.categories ?? [], tombstones: json.tombstones ?? [], shopping: json.shopping ?? [], tagInfo: json.tagInfo ?? {} };
  }

  const final = await applyLocally(mergeSnapshots(await localSnapshot(), remote));
  const used = usedImageIds(final.recipes);
  const remoteImgs = new Map((await gh.list(IMG_DIR)).map((f) => [f.path.slice(IMG_DIR.length + 1).replace(/\.\w+$/, ''), f]));

  // Fehlende Bilder herunterladen
  const localImgs = new Set((await db.images.toCollection().primaryKeys()) as string[]);
  const owner = new Map<string, string>();
  for (const r of final.recipes) {
    for (const id of r.imageIds) owner.set(id, r.id);
    if (r.photoId) owner.set(r.photoId, r.id);
  }
  for (const id of used) {
    if (localImgs.has(id) || !remoteImgs.has(id)) continue;
    const blob = await gh.readBlob(remoteImgs.get(id)!.path);
    const typed = blob.type.startsWith('image/') ? blob : new Blob([blob], { type: 'image/jpeg' });
    await withoutChangeEvents(() => db.images.put({ id, recipeId: owner.get(id) ?? null, blob: typed, type: typed.type, createdAt: Date.now() }));
  }
  // Neue Bilder hochladen (vor dem Datenstand, damit das andere Handy sie sicher findet)
  for (const id of used) {
    if (remoteImgs.has(id)) continue;
    const img = await db.images.get(id);
    if (img) await gh.write(`${IMG_DIR}/${id}.jpg`, await blobToBase64(img.blob), 'Bild hinzugefügt');
  }
  // Datenstand speichern – nur wenn sich etwas geändert hat (spart Commits)
  const payload: DataFile = { format: 'kochbuch-sync', version: 1, updatedAt: Date.now(), ...final };
  const changed = !remoteFile || stableJson({ ...remote, updatedAt: 0 }) !== stableJson({ ...final, updatedAt: 0 });
  if (changed) await gh.write(DATA_FILE, textToBase64(JSON.stringify(payload)), 'Kochbuch abgeglichen', remoteFile?.sha);
  // Nicht mehr benötigte Bilder löschen
  for (const [id, f] of remoteImgs) if (!used.has(id)) await gh.remove(f.path, f.sha, 'Bild entfernt').catch(() => {});
}

/** Vergleichbare Darstellung (Reihenfolge der Einträge spielt keine Rolle) */
function stableJson(s: Snapshot & { updatedAt: number }): string {
  const byId = <T extends { id: string }>(l: T[] = []) => [...l].sort((a, b) => (a.id < b.id ? -1 : 1));
  const info = Object.entries(s.tagInfo ?? {}).sort(([a], [b]) => (a < b ? -1 : 1));
  return JSON.stringify([byId(s.recipes), byId(s.categories), byId(s.tombstones), byId(s.shopping), info]);
}

// ---------- Einrichten ----------
export async function connect(repoInput: string, token: string): Promise<void> {
  const r = parseRepo(repoInput);
  if (!r) throw new Error('Bitte das Repository als „benutzer/name“ angeben.');
  const gh = new GitHubClient(token.trim(), r.owner, r.repo);
  const info = await gh.checkRepo();
  if (!info.private) throw new Error('Das Repository ist öffentlich – dann könnte jeder eure Rezepte sehen. Bitte in GitHub auf „Private“ stellen.');
  if (!info.canWrite) throw new Error('Der Token darf in dieses Repository nicht schreiben (Berechtigung „Contents: Read and write“ nötig).');
  writeSettings({ enabled: true, repo: `${r.owner}/${r.repo}`, token: token.trim() });
  startAutomatic();
  await syncNow();
}

export function disconnect() {
  writeSettings({ enabled: false, token: '', lastSync: null });
  setStatus(null);
}

// ---------- Automatik ----------
let timer: number | undefined;
let automaticStarted = false;
function schedule(delay = 3000) {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void syncNow(), delay);
}

function startAutomatic() {
  if (automaticStarted) return;
  automaticStarted = true;
  onLocalChange(() => schedule(3000));
  window.addEventListener('online', () => schedule(1000));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(300);
  });
  // Regelmäßig nachsehen: auf der Einkaufsliste alle 30 s, sonst alle 3 Minuten
  let ticks = 0;
  window.setInterval(() => {
    if (document.visibilityState !== 'visible' || !readSettings().enabled) return;
    ticks++;
    if (window.location.hash.startsWith('#/einkauf') || ticks % 6 === 0) void syncNow();
  }, 30_000);
}

/** Beim App-Start aufrufen. */
export function initSync() {
  // Einstellungen der früheren Google-Drive-Variante aufräumen
  try {
    for (const k of ['kochbuch-sync', 'kochbuch-google-token', 'kochbuch-google-state', 'kochbuch-google-client-id']) localStorage.removeItem(k);
  } catch {
    /* ignorieren */
  }
  if (!readSettings().enabled) return;
  startAutomatic();
  schedule(800);
}
