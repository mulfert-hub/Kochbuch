// Kopiert Tesseract-Worker, WASM-Kern und deutsche Sprachdaten nach public/tesseract,
// damit die OCR komplett ohne CDN/Cloud aus der eigenen App geladen wird.
import { cpSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = dirname(dirname(new URL(import.meta.url).pathname));
const out = join(root, 'public', 'tesseract');
mkdirSync(join(out, 'lang'), { recursive: true });

const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));

const tjs = pkgDir('tesseract.js');
const core = pkgDir('tesseract.js-core');
const deu = pkgDir('@tesseract.js-data/deu');

cpSync(join(tjs, 'dist', 'worker.min.js'), join(out, 'worker.min.js'));
// Nur die LSTM-Varianten (OEM 1) – die Engine wählt je nach Gerät SIMD/RelaxedSIMD/Basis.
for (const f of [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
]) {
  cpSync(join(core, f), join(out, f));
}
const lang = join(deu, '4.0.0_best_int', 'deu.traineddata.gz');
if (!existsSync(lang)) throw new Error('deu.traineddata.gz nicht gefunden');
cpSync(lang, join(out, 'lang', 'deu.traineddata.gz'));
console.log('Tesseract-Dateien nach public/tesseract kopiert.');
