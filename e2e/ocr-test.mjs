// OCR-Ende-zu-Ende-Test: lädt Beispiel-Screenshots in die echte App (gebauter Stand, Chromium),
// lässt Tesseract laufen und vergleicht die erkannten Felder mit der Wahrheit.
// Voraussetzung: npm run build.   Aufruf: npm run test:ocr
import { chromium } from '../scripts/pw.mjs';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const truth = JSON.parse(readFileSync(join(dir, 'ground-truth.json'), 'utf8'));
const PORT = 4183;
const BASE = process.env.BASE_PATH ?? '/';
const outDir = join(dir, 'output');
mkdirSync(outDir, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: join(dir, '..'), stdio: 'ignore' });
const stop = () => server.kill();
process.on('exit', stop);
for (let i = 0; i < 50; i++) {
  try {
    await fetch(`http://localhost:${PORT}${BASE}`);
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 200));
  }
}

// --- Vergleichshilfen ---
function lev(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
const sim = (a, b) => (a || b ? 1 - lev(a, b) / Math.max(a.length, b.length) : 1);
const parseQ = (s) => {
  if (!s) return null;
  const t = s.replace(',', '.').trim();
  const m = t.match(/^(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
};

const browser = await chromium.launch();
const report = [];
for (const [name, gt] of Object.entries(truth)) {
  if (process.env.ONLY && !process.env.ONLY.split(',').includes(name)) continue;
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}${BASE}#/import`);
  await page.waitForSelector('.dropzone');
  await page.setInputFiles('input[type=file][accept="image/*"]', gt.files.map((f) => join(dir, 'fixtures', f)));
  const t0 = Date.now();
  await page.getByRole('button', { name: /Text erkennen/ }).click();
  await page.waitForSelector('.editor', { timeout: 180000 });
  const secs = (Date.now() - t0) / 1000;

  const got = await page.evaluate(() => {
    const val = (sel) => document.querySelector(sel)?.value ?? '';
    const fields = [...document.querySelectorAll('.field-row .input')].map((i) => i.value);
    return {
      title: val('.input-title'),
      servings: fields[0],
      time: fields[2],
      ingredients: [...document.querySelectorAll('.ing-row')].map((r) => [...r.querySelectorAll('input')].map((i) => i.value)),
      steps: [...document.querySelectorAll('.step-row textarea')].map((t) => t.value),
      notes: [...document.querySelectorAll('.field textarea')].map((t) => t.value).pop() ?? '',
      ocr: document.querySelector('.ocr-raw textarea')?.value ?? '',
      confidence: document.querySelector('.confidence')?.textContent ?? '',
    };
  });
  await page.screenshot({ path: join(outDir, `${name}-review.png`), fullPage: true });

  // Zutaten vergleichen (paarweise nach bestem Namens-Treffer)
  const ingRows = got.ingredients.map(([q, u, n]) => ({ q: parseQ(q), u, n: n.split(',')[0].trim() }));
  let qtyOk = 0, unitOk = 0, nameOk = 0;
  const ingDetail = gt.ingredients.map(([q, u, n]) => {
    let best = null, bestSim = 0;
    for (const r of ingRows) {
      const s = sim(r.n.toLowerCase(), n.toLowerCase());
      if (s > bestSim) (bestSim = s), (best = r);
    }
    const ok = { q: best && best.q === q, u: best && best.u === u, n: bestSim >= 0.9 };
    if (ok.q) qtyOk++;
    if (ok.u) unitOk++;
    if (ok.n) nameOk++;
    return { erwartet: `${q ?? ''} ${u} ${n}`.trim(), erkannt: best ? `${best.q ?? ''} ${best.u} ${best.n}`.trim() : '–', ok: ok.q && ok.u && ok.n };
  });
  const stepSims = gt.steps.map((s, i) => sim(s, got.steps[i] ?? ''));
  const r = {
    name,
    sekunden: secs,
    titel: { erwartet: gt.title, erkannt: got.title, ok: got.title === gt.title },
    portionen: { erwartet: gt.servings, erkannt: got.servings, ok: Number(got.servings) === gt.servings },
    zeit: { erwartet: gt.timeMinutes, erkannt: got.time, ok: Number(got.time) === gt.timeMinutes },
    zutaten: { anzahlErwartet: gt.ingredients.length, anzahlErkannt: got.ingredients.length, menge: qtyOk, einheit: unitOk, name: nameOk, details: ingDetail },
    schritte: { anzahlErwartet: gt.steps.length, anzahlErkannt: got.steps.length, aehnlichkeit: stepSims.map((s) => Math.round(s * 1000) / 10), erkannt: got.steps },
    notiz: gt.notes ? { erwartet: gt.notes, erkannt: got.notes, aehnlichkeit: Math.round(sim(gt.notes, got.notes) * 1000) / 10 } : undefined,
    hinweis: got.confidence,
    zutatenZeilen: got.ingredients.map((r) => r.join(' | ')),
    rohtext: got.ocr,
  };
  report.push(r);
  await ctx.close();

  console.log(`\n=== ${name} (${secs.toFixed(1)} s) ===`);
  console.log(`Titel     ${r.titel.ok ? '✓' : '✗'}  „${got.title}“`);
  console.log(`Portionen ${r.portionen.ok ? '✓' : '✗'}  ${got.servings}   Zeit ${r.zeit.ok ? '✓' : '✗'} ${got.time}`);
  console.log(`Zutaten   ${got.ingredients.length}/${gt.ingredients.length} Zeilen · Menge ${qtyOk} · Einheit ${unitOk} · Name ${nameOk} korrekt`);
  for (const d of ingDetail) if (!d.ok) console.log(`   ✗ erwartet „${d.erwartet}“ – erkannt „${d.erkannt}“`);
  console.log(`Schritte  ${got.steps.length}/${gt.steps.length} · Ähnlichkeit ${r.schritte.aehnlichkeit.join('% / ')}%`);
  if (r.notiz) console.log(`Notiz     ${r.notiz.aehnlichkeit}%`);
}
await browser.close();
writeFileSync(join(outDir, 'ocr-report.json'), JSON.stringify(report, null, 2));
console.log(`\nBericht: e2e/output/ocr-report.json, Screenshots der Prüfansicht: e2e/output/*-review.png`);
stop();
process.exit(0);
