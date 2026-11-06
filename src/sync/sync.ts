// Synchronisation über Google Drive (gemeinsames Konto, versteckter App-Ordner).
// Ablauf: Stand aus Drive laden → mit diesem Gerät zusammenführen → lokal speichern →
// fehlende Bilder hoch-/herunterladen → neuen Stand nach Drive schreiben.
import { useSyncExternalStore } from 'react';
import { db, onLocalChange, withoutChangeEvents } from '../db/db';
import { mergeSnapshots, usedImageIds, type Snapshot } from '../lib/syncMerge';
import { AuthError, DriveClient, type DriveFile } from './drive';
import { clearToken, getClientId, getToken, handleRedirect, startLogin } from './googleAuth';

const DATA_FILE = 'kochbuch-sync.json';
const IMG_PREFIX = 'img-';
const SETTINGS_KEY = 'kochbuch-sync';

interface SyncSettings {
  enabled: boolean;
  lastSync: number | null;
  lastSilentLogin: number | null;
}

export interface SyncStatus {
  enabled: boolean;
  configured: boolean;
  signedIn: boolean;
  running: boolean;
  lastSync: number | null;
  message: string | null;
  error: boolean;
}

function readSettings(): SyncSettings {
  try {
    return { enabled: false, lastSync: null, lastSilentLogin: null, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return { enabled: false, lastSync: null, lastSilentLogin: null };
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
  return { enabled: s.enabled, configured: !!getClientId(), signedIn: !!getToken(), running, lastSync: s.lastSync, message, error };
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

// ---------- Datenstand ----------
interface RemoteFile extends Snapshot {
  format: 'kochbuch-sync';
  version: 1;
  updatedAt: number;
}

async function localSnapshot(): Promise<Snapshot> {
  const [recipes, categories, tombstones] = await Promise.all([db.recipes.toArray(), db.categories.toArray(), db.tombstones.toArray()]);
  return { recipes, categories, tombstones };
}

/** Lokale Tabellen auf den zusammengeführten Stand bringen */
async function applyLocally(merged: Snapshot): Promise<Snapshot> {
  return withoutChangeEvents(() =>
    db.transaction('rw', [db.recipes, db.categories, db.tombstones, db.images], async () => {
      // Erneut lesen und zusammenführen, falls während des Downloads lokal etwas geändert wurde
      const final = mergeSnapshots(await localSnapshot(), merged);
      const keepR = new Set(final.recipes.map((r) => r.id));
      const keepC = new Set(final.categories.map((c) => c.id));
      const oldR = (await db.recipes.toCollection().primaryKeys()) as string[];
      const oldC = (await db.categories.toCollection().primaryKeys()) as string[];
      await db.recipes.bulkDelete(oldR.filter((id) => !keepR.has(id)));
      await db.categories.bulkDelete(oldC.filter((id) => !keepC.has(id)));
      await db.recipes.bulkPut(final.recipes);
      await db.categories.bulkPut(final.categories);
      await db.tombstones.bulkPut(final.tombstones);
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

/** Jetzt synchronisieren. interactive = vom Nutzer angestoßen (darf zur Anmeldung weiterleiten). */
export function syncNow(interactive = false): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = doSync(interactive).finally(() => {
    running = null;
    if (again) {
      again = false;
      void syncNow(false);
    }
  });
  return running;
}

async function doSync(interactive: boolean): Promise<void> {
  const settings = readSettings();
  if (!settings.enabled || !getClientId()) return;
  if (!navigator.onLine) {
    setStatus('Offline – wird synchronisiert, sobald wieder Internet da ist.');
    return;
  }
  const token = getToken();
  if (!token) {
    if (interactive) startLogin(false);
    else setStatus('Anmeldung bei Google abgelaufen. Tippe auf „Jetzt synchronisieren“.', true);
    return;
  }
  setStatus('Synchronisiere …', false, true);
  const drive = new DriveClient(token);
  try {
    const files = await drive.list();
    const byName = new Map<string, DriveFile>(files.map((f) => [f.name, f]));
    const dataFile = byName.get(DATA_FILE);
    let remote: Snapshot = { recipes: [], categories: [], tombstones: [] };
    if (dataFile) {
      const json = (await (await drive.download(dataFile.id)).json()) as RemoteFile;
      if (json.format === 'kochbuch-sync') remote = { recipes: json.recipes ?? [], categories: json.categories ?? [], tombstones: json.tombstones ?? [] };
    }

    const merged = mergeSnapshots(await localSnapshot(), remote);
    const final = await applyLocally(merged);
    const used = usedImageIds(final.recipes);

    // Fehlende Bilder herunterladen
    const localImgs = new Set((await db.images.toCollection().primaryKeys()) as string[]);
    const owner = new Map<string, string>();
    for (const r of final.recipes) {
      for (const id of r.imageIds) owner.set(id, r.id);
      if (r.photoId) owner.set(r.photoId, r.id);
    }
    for (const id of used) {
      if (localImgs.has(id)) continue;
      const f = byName.get(IMG_PREFIX + id);
      if (!f) continue;
      const blob = await (await drive.download(f.id)).blob();
      await withoutChangeEvents(() =>
        db.images.put({ id, recipeId: owner.get(id) ?? null, blob, type: blob.type || 'image/jpeg', createdAt: Date.now() }),
      );
    }
    // Neue Bilder hochladen
    for (const id of used) {
      if (byName.has(IMG_PREFIX + id)) continue;
      const img = await db.images.get(id);
      if (img) await drive.upload(IMG_PREFIX + id, img.blob);
    }
    // Stand speichern
    const payload: RemoteFile = { format: 'kochbuch-sync', version: 1, updatedAt: Date.now(), ...final };
    await drive.upload(DATA_FILE, new Blob([JSON.stringify(payload)], { type: 'application/json' }), dataFile?.id);
    // Nicht mehr benötigte Bilder in Drive löschen
    for (const f of files) {
      if (f.name.startsWith(IMG_PREFIX) && !used.has(f.name.slice(IMG_PREFIX.length))) await drive.remove(f.id).catch(() => {});
    }
    writeSettings({ lastSync: Date.now() });
    setStatus(null);
  } catch (e) {
    if (e instanceof AuthError) {
      clearToken();
      if (interactive) startLogin(false);
      else setStatus('Anmeldung bei Google abgelaufen. Tippe auf „Jetzt synchronisieren“.', true);
      return;
    }
    console.error(e);
    setStatus(`Synchronisation fehlgeschlagen: ${(e as Error).message}`, true);
  }
}

// ---------- Ein-/Ausschalten ----------
export function enableSync() {
  writeSettings({ enabled: true });
  setStatus(null);
  if (getToken()) void syncNow(true);
  else startLogin(false);
}

export function disableSync() {
  writeSettings({ enabled: false, lastSync: null });
  clearToken();
  setStatus(null);
}

// ---------- Automatik ----------
let timer: number | undefined;
function schedule(delay = 3000) {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void syncNow(false), delay);
}

/** Beim App-Start aufrufen (vor dem ersten Rendern). */
export function initSync() {
  const r = handleRedirect();
  const s = readSettings();
  if (r.kind === 'error') {
    if (r.silent) setStatus('Bitte einmal bei Google anmelden: „Jetzt synchronisieren“ tippen.', true);
    else if (r.error !== 'access_denied') setStatus(`Google-Anmeldung fehlgeschlagen (${r.error}).`, true);
    else setStatus('Google-Anmeldung abgebrochen.', true);
  }
  if (!s.enabled) {
    setStatus(status.message, status.error);
    return;
  }
  onLocalChange(() => schedule(4000));
  window.addEventListener('online', () => schedule(1000));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(500);
  });
  if (getToken()) {
    schedule(r.kind === 'ok' ? 100 : 800);
  } else if (r.kind !== 'error' && navigator.onLine && getClientId()) {
    // Token abgelaufen: höchstens alle 20 Minuten still erneuern (ohne Rückfrage bei Google)
    const last = s.lastSilentLogin ?? 0;
    if (Date.now() - last > 20 * 60_000) {
      writeSettings({ lastSilentLogin: Date.now() });
      startLogin(true);
    } else setStatus('Anmeldung bei Google abgelaufen. Tippe auf „Jetzt synchronisieren“.', true);
  }
}
