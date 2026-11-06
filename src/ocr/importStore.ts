// Zwischenspeicher für den Import-Ablauf (Bilder auswählen → OCR → prüfen → speichern).
import { useSyncExternalStore } from 'react';
import type { RecipeDraft } from '../types';
import type { CropRect } from './preprocess';
import { parseRecipe, type OcrLine } from '../lib/recipeParser';
import { uid } from '../lib/id';

export interface PendingImage {
  id: string;
  file: File;
  url: string;
  crop: CropRect | null;
}

export interface DraftEntry {
  id: string;
  draft: RecipeDraft;
  imageIds: string[];
  savedRecipeId?: string;
}

export interface ImportState {
  images: PendingImage[];
  mode: 'single' | 'each';
  running: boolean;
  progress: number;
  status: string;
  drafts: DraftEntry[];
  current: number;
  error?: string;
}

let state: ImportState = { images: [], mode: 'single', running: false, progress: 0, status: '', drafts: [], current: 0 };
const listeners = new Set<() => void>();

function setState(patch: Partial<ImportState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useImport(): ImportState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

export function getImport() {
  return state;
}

export function addFiles(files: File[]) {
  const imgs = files
    .filter((f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|heic|gif|bmp)$/i.test(f.name))
    .map((file) => ({ id: uid(), file, url: URL.createObjectURL(file), crop: null }));
  if (!imgs.length) return 0;
  setState({ images: [...state.images, ...imgs], error: undefined });
  return imgs.length;
}

export function removeImage(id: string) {
  const img = state.images.find((i) => i.id === id);
  if (img) URL.revokeObjectURL(img.url);
  setState({ images: state.images.filter((i) => i.id !== id) });
}

export function moveImage(id: string, dir: -1 | 1) {
  const i = state.images.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= state.images.length) return;
  const n = [...state.images];
  [n[i], n[j]] = [n[j], n[i]];
  setState({ images: n });
}

export function setCrop(id: string, crop: CropRect | null) {
  setState({ images: state.images.map((i) => (i.id === id ? { ...i, crop } : i)) });
}

export function setMode(mode: ImportState['mode']) {
  setState({ mode });
}

export function setDraft(index: number, draft: RecipeDraft) {
  setState({ drafts: state.drafts.map((d, i) => (i === index ? { ...d, draft } : d)) });
}

export function setCurrent(i: number) {
  setState({ current: i });
}

export function markSaved(index: number, recipeId: string) {
  setState({ drafts: state.drafts.map((d, i) => (i === index ? { ...d, savedRecipeId: recipeId } : d)) });
}

export function startManual(draft: RecipeDraft) {
  setState({ drafts: [{ id: uid(), draft, imageIds: [] }], current: 0 });
}

export function reset() {
  for (const i of state.images) URL.revokeObjectURL(i.url);
  state = { images: [], mode: state.mode, running: false, progress: 0, status: '', drafts: [], current: 0 };
  listeners.forEach((l) => l());
}

/** Führt die OCR für alle Bilder aus und erzeugt Rezeptentwürfe. */
export async function runOcr(): Promise<boolean> {
  const imgs = state.images;
  if (!imgs.length || state.running) return false;
  setState({ running: true, progress: 0, status: 'Starte …', error: undefined });
  // Mit API-Schlüssel liest Claude das Rezept, ohne Schlüssel die Texterkennung auf dem Gerät
  const ai = await import('../ai/claudeRecipe');
  if (ai.claudeConfigured()) {
    if (!navigator.onLine) {
      setState({ running: false, error: 'Keine Internetverbindung. Claude braucht Internet – bitte später erneut versuchen.' });
      return false;
    }
    try {
      const { db } = await import('../db/db');
      const categories = await db.categories.orderBy('order').toArray();
      const groups = state.mode === 'single' || imgs.length === 1 ? [imgs] : imgs.map((i) => [i]);
      const drafts: DraftEntry[] = [];
      for (let k = 0; k < groups.length; k++) {
        setState({
          progress: (k + 0.3) / groups.length,
          status: groups.length > 1 ? `Claude liest Rezept ${k + 1} von ${groups.length} …` : 'Claude liest das Rezept …',
        });
        const draft = await ai.recognizeWithClaude(groups[k].map((i) => ({ blob: i.file, crop: i.crop })), categories);
        drafts.push({ id: uid(), draft, imageIds: groups[k].map((i) => i.id) });
      }
      setState({ drafts, current: 0, running: false, progress: 1, status: 'Fertig' });
      return true;
    } catch (e) {
      console.error(e);
      setState({ running: false, error: e instanceof ai.ClaudeError ? e.message : 'Die Erkennung mit Claude ist fehlgeschlagen.' });
      return false;
    }
  }
  try {
    const { joinPages, recognizeImage } = await import('./ocr');
    const pages: { img: PendingImage; lines: OcrLine[] }[] = [];
    for (let k = 0; k < imgs.length; k++) {
      const img = imgs[k];
      const res = await recognizeImage(img.file, { crop: img.crop }, (p, status) => {
        setState({ progress: (k + Math.min(1, p)) / imgs.length, status: `Bild ${k + 1} von ${imgs.length}: ${status}` });
      });
      pages.push({ img, lines: res.lines });
    }
    let drafts: DraftEntry[];
    if (state.mode === 'single' || imgs.length === 1) {
      const lines = joinPages(pages.map((p) => p.lines));
      drafts = [{ id: uid(), draft: parseRecipe(lines), imageIds: imgs.map((i) => i.id) }];
    } else {
      drafts = pages.map((p) => ({ id: uid(), draft: parseRecipe(p.lines), imageIds: [p.img.id] }));
    }
    setState({ drafts, current: 0, running: false, progress: 1, status: 'Fertig' });
    return true;
  } catch (e) {
    console.error(e);
    setState({
      running: false,
      error: 'Die Texterkennung ist fehlgeschlagen. Bitte prüfe, ob die App vollständig geladen wurde (einmal online öffnen), und versuche es erneut.',
    });
    return false;
  }
}
