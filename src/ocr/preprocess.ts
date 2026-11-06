// Bildvorverarbeitung im Browser (Canvas) für bessere OCR-Ergebnisse:
// Zuschneiden → Skalieren → Graustufen → Dark-Mode invertieren → Kontrast strecken.

export interface CropRect {
  /** Anteile 0–1 relativ zur Bildgröße */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PreprocessOptions {
  crop?: CropRect | null;
  /** Automatisch invertieren, wenn das Bild überwiegend dunkel ist (Dark Mode). */
  autoInvert?: boolean;
  /** Kontrast-Streckung an den Perzentilen. */
  contrast?: boolean;
  /** Ziel-Breite in Pixeln (Tesseract mag ca. 20–40 px Zeilenhöhe). */
  targetWidth?: number;
}

export interface PreprocessResult {
  canvas: HTMLCanvasElement;
  inverted: boolean;
  scale: number;
}

export async function loadBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

export async function preprocessImage(blob: Blob, opts: PreprocessOptions = {}): Promise<PreprocessResult> {
  const { crop, autoInvert = true, contrast = true, targetWidth = 1600 } = opts;
  const bmp = await loadBitmap(blob);
  const sx = crop ? Math.round(crop.x * bmp.width) : 0;
  const sy = crop ? Math.round(crop.y * bmp.height) : 0;
  const sw = crop ? Math.max(1, Math.round(crop.w * bmp.width)) : bmp.width;
  const sh = crop ? Math.max(1, Math.round(crop.h * bmp.height)) : bmp.height;

  // Kleine Bilder hochskalieren, riesige verkleinern; max. ~12 Megapixel
  let scale = Math.min(2.5, Math.max(0.5, targetWidth / sw));
  const maxPixels = 12_000_000;
  if (sw * sh * scale * scale > maxPixels) scale = Math.sqrt(maxPixels / (sw * sh));
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
  bmp.close?.();

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const n = w * h;
  const gray = new Uint8ClampedArray(n);
  const hist = new Uint32Array(256);
  let sum = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    // Luminanz (Rec. 709)
    const g = (0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2]) | 0;
    gray[i] = g;
    sum += g;
  }
  const mean = sum / n;
  const inverted = autoInvert && mean < 110;
  for (let i = 0; i < n; i++) {
    if (inverted) gray[i] = 255 - gray[i];
    hist[gray[i]]++;
  }

  let lo = 0;
  let hi = 255;
  if (contrast) {
    const cut = n * 0.01;
    let acc = 0;
    for (lo = 0; lo < 255 && (acc += hist[lo]) < cut; lo++);
    acc = 0;
    for (hi = 255; hi > 0 && (acc += hist[hi]) < cut; hi--);
    if (hi - lo < 40) {
      lo = 0;
      hi = 255;
    }
  }
  const range = Math.max(1, hi - lo);
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    // linear strecken + leichte Gamma-Korrektur, damit graue Schrift dunkler wird
    const t = Math.min(1, Math.max(0, (v - lo) / range));
    lut[v] = Math.round(Math.pow(t, 1.35) * 255);
  }
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const v = lut[gray[i]];
    d[p] = d[p + 1] = d[p + 2] = v;
    d[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, inverted, scale };
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas leer'))), type, 0.92),
  );
}
