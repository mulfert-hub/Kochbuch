import type { PhotoCredit } from './lib/photoSearch';

// Zentrales Datenmodell der App (gespeichert in IndexedDB).

export interface Ingredient {
  id: string;
  /** Menge als Zahl (z. B. 0.5 für „½“). null = keine Menge („Salz“, „etwas Öl“). */
  quantity: number | null;
  /** Obergrenze bei Spannen wie „2–3 Eier“. */
  quantityMax?: number | null;
  /** Einheit in Kurzform, z. B. „g“, „EL“, „Bund“. Leer = Stückzahl. */
  unit: string;
  name: string;
  /** Zusatz wie „fein gehackt“ oder „(zimmerwarm)“. */
  note?: string;
  /** Optionale Zwischenüberschrift, z. B. „Für den Teig“. */
  group?: string;
}

export interface Recipe {
  id: string;
  title: string;
  /** Anzahl Portionen, auf die sich die Mengen beziehen. */
  servings: number | null;
  /** Bezeichnung der Portionen, z. B. „Portionen“, „Stück“, „Personen“. */
  servingsLabel?: string;
  categoryIds: string[];
  ingredients: Ingredient[];
  steps: string[];
  notes?: string;
  /** Zubereitungszeit in Minuten (optional). */
  timeMinutes?: number | null;
  /** IDs der angehängten Originalbilder (Tabelle images). */
  imageIds: string[];
  /** Foto vom fertigen Gericht (Tabelle images), wird groß im Rezept angezeigt. */
  photoId?: string | null;
  /** Herkunft eines Fotos aus dem Internet (Pflichtangabe bei freien Lizenzen) */
  photoCredit?: PhotoCredit | null;
  /** Roher OCR-Text, falls aus Screenshot importiert. */
  ocrText?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Category {
  id: string;
  name: string;
  order: number;
  updatedAt?: number;
}

export interface StoredImage {
  id: string;
  recipeId: string | null;
  blob: Blob;
  type: string;
  width?: number;
  height?: number;
  createdAt: number;
}

export interface ShoppingSource {
  recipeId: string;
  title: string;
}

export interface ShoppingItem {
  id: string;
  name: string;
  unit: string;
  quantity: number | null;
  checked: boolean;
  sources: ShoppingSource[];
  order: number;
}

/** Entwurf nach dem OCR, noch nicht gespeichert. */
export interface RecipeDraft {
  title: string;
  servings: number | null;
  servingsLabel?: string;
  ingredients: Ingredient[];
  steps: string[];
  notes?: string;
  timeMinutes?: number | null;
  categoryIds: string[];
  ocrText: string;
  /** Foto vom Gericht: Blob = neu/geändert, null = entfernen, undefined = unverändert */
  photo?: Blob | null;
  photoCredit?: PhotoCredit | null;
  /** Titel wurde aus den Zutaten abgeleitet (kein Name im Screenshot erkennbar) */
  titleDerived?: boolean;
  /** Wer das Rezept erkannt hat: Claude oder die lokale Texterkennung */
  source?: 'claude' | 'ocr';
  /** Wie sicher die Heuristik ist (0–1) – nur zur Anzeige. */
  confidence?: number;
}
