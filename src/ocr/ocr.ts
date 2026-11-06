// Tesseract.js-Wrapper. Alle Dateien (Worker, WASM, deutsche Sprachdaten) kommen aus /tesseract/
// der eigenen App – es wird nichts aus dem Internet nachgeladen.
import { createWorker, type Worker } from 'tesseract.js';
import type { OcrLine } from '../lib/recipeParser';
import { preprocessImage, type PreprocessOptions } from './preprocess';
import { splitColumns, type LayoutLine } from '../lib/layout';

export type ProgressFn = (progress: number, status: string) => void;

let workerPromise: Promise<Worker> | null = null;
let currentProgress: ProgressFn | null = null;

const STATUS_DE: Record<string, string> = {
  'loading tesseract core': 'Lade Texterkennung …',
  'initializing tesseract': 'Starte Texterkennung …',
  'initialized tesseract': 'Texterkennung bereit',
  'loading language traineddata': 'Lade deutsche Sprachdaten …',
  'loaded language traineddata': 'Sprachdaten geladen',
  'initializing api': 'Initialisiere …',
  'initialized api': 'Bereit',
  'recognizing text': 'Erkenne Text …',
};

function assetUrl(path: string): string {
  return new URL(`${import.meta.env.BASE_URL}tesseract/${path}`, window.location.href).href;
}

export function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const w = await createWorker('deu', 1 /* LSTM */, {
        workerPath: assetUrl('worker.min.js'),
        corePath: assetUrl(''),
        langPath: assetUrl('lang'),
        gzip: true,
        workerBlobURL: false,
        logger: (m) => currentProgress?.(m.progress ?? 0, STATUS_DE[m.status] ?? m.status),
      });
      await w.setParameters({
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      });
      return w;
    })();
    workerPromise.catch(() => {
      workerPromise = null;
    });
  }
  return workerPromise;
}

/** Lädt die OCR-Dateien vorab, damit sie offline verfügbar sind. */
export async function warmUpOcr(): Promise<void> {
  await getWorker();
}

export interface OcrResult {
  lines: OcrLine[];
  text: string;
  confidence: number;
  /** Vorverarbeitetes Bild (für die Vorschau „So sieht die Texterkennung das Bild“). */
  processed: HTMLCanvasElement;
}

export async function recognizeImage(blob: Blob, opts: PreprocessOptions = {}, onProgress?: ProgressFn): Promise<OcrResult> {
  onProgress?.(0, 'Bereite Bild vor …');
  const { canvas } = await preprocessImage(blob, opts);
  const worker = await getWorker();
  currentProgress = onProgress ?? null;
  try {
    const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
    const layout: LayoutLine[] = [];
    for (const block of data.blocks ?? []) {
      for (const para of block.paragraphs) {
        for (const line of para.lines) {
          const words = line.words.filter((w) => w.text.trim()).map((w) => ({ text: w.text, ...w.bbox }));
          if (words.length) layout.push({ words, confidence: line.confidence, ...line.bbox });
        }
      }
    }
    // Zweispaltige Layouts entwirren, dann von oben nach unten lesen
    const raw = splitColumns(layout, canvas.width).map((l) => {
      // Schriftgröße: Median der Worthöhen ist robuster als die Box der ganzen Zeile
      const hs = l.words.map((w) => w.y1 - w.y0).sort((a, b) => a - b);
      // Große Lücken als „   “ erhalten (wichtig für „Zutat ……… Menge“-Layouts)
      let text = l.words[0].text;
      const cw = (l.x1 - l.x0) / Math.max(1, l.words.reduce((n, w) => n + w.text.length, 0));
      for (let k = 1; k < l.words.length; k++) {
        const gap = l.words[k].x0 - l.words[k - 1].x1;
        text += (gap > cw * 2.5 ? '     ' : ' ') + l.words[k].text;
      }
      return { text, height: hs[Math.floor(hs.length / 2)], top: l.y0, bottom: l.y1, confidence: l.confidence };
    });
    // Absätze über den vertikalen Abstand erkennen (Tesseract fasst Absätze oft zusammen)
    const pitches = raw.slice(1).map((l, i) => l.top - raw[i].top).filter((d) => d > 0).sort((a, b) => a - b);
    const pitch = pitches.length ? pitches[Math.floor(pitches.length / 2)] : 0;
    const lines: OcrLine[] = raw.map((l, i) => {
      const prev = raw[i - 1];
      const gap = prev ? l.top - prev.top : Infinity;
      return {
        text: l.text,
        height: l.height,
        confidence: l.confidence,
        paragraphStart: !prev || gap < 0 || (pitch > 0 && gap > pitch * 1.35) || gap > (prev.bottom - prev.top) * 2.2,
      };
    });
    if (!lines.length && data.text) {
      for (const t of data.text.split('\n')) if (t.trim()) lines.push({ text: t });
    }
    onProgress?.(1, 'Fertig');
    return { lines, text: data.text, confidence: data.confidence, processed: canvas };
  } finally {
    currentProgress = null;
  }
}

export { joinPages } from '../lib/joinPages';
