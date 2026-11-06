// Test der Claude-Erkennung mit nachgebildeter Anthropic-API (kein echter Schlüssel nötig).
// Aufruf: npm run build && npm run test:claude
import { chromium } from '../scripts/pw.mjs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const PORT = 4194;
const BASE = `http://localhost:${PORT}/`;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: join(dir, '..'), stdio: 'ignore' });
process.on('exit', () => server.kill());
for (let i = 0; i < 50; i++) {
  try { await fetch(BASE); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
}
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' – ' + extra : ''}`);
  if (!ok) failed++;
};

const RECIPE = {
  is_recipe: true, title: 'Hirse-Apfel-Brei', servings: 1, servings_label: 'Portion', time_minutes: 20,
  ingredients: [
    { group: null, quantity: 30, quantity_max: null, unit: 'g', name: 'Hirse', note: null },
    { group: null, quantity: 0.5, quantity_max: null, unit: '', name: 'kleiner Apfel', note: null },
    { group: null, quantity: 120, quantity_max: null, unit: 'ml', name: 'Wasser', note: null },
    { group: null, quantity: 1, quantity_max: null, unit: 'Teelöffel', name: 'Rapsöl', note: null },
  ],
  steps: ['Hirse mit Wasser ca. 10–15 Minuten weich köcheln.', 'Apfel schälen, fein reiben und die letzten 5 Minuten mitköcheln lassen.'],
  notes: 'Bei säuerlichem Apfel etwas Birne ergänzen.', category: 'Frühstück',
};
let mode = 'ok';
const seen = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.route('https://api.anthropic.com/**', async (route) => {
  const req = route.request();
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  const h = await req.allHeaders();
  const key = h['x-api-key'] ?? (h['authorization'] ?? '').replace(/^Bearer\s+/i, '');
  if (key !== 'sk-ant-test') return route.fulfill({ status: 401, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }) });
  if (req.url().includes('/v1/models/')) return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'claude-opus-5-5', type: 'model' }) });
  const body = JSON.parse(req.postData());
  seen.push({ body, headers: h });
  if (mode === 'rate') return route.fulfill({ status: 429, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }) });
  const out = mode === 'norecipe' ? { ...RECIPE, is_recipe: false, ingredients: [], steps: [] } : mode === 'notitle' ? { ...RECIPE, title: '' } : RECIPE;
  return route.fulfill({
    status: 200,
    headers: { ...cors, 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'msg_test', type: 'message', role: 'assistant', model: body.model, stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 5000, output_tokens: 400 }, content: [{ type: 'text', text: JSON.stringify(out) }] }),
  });
});
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));

// Ohne Schlüssel: Hinweis statt Erkennung
await p.goto(`${BASE}#/import`);
check('Ohne Schlüssel: Hinweis auf der Importseite', (await p.locator('.notice').textContent()).includes('API-Schlüssel'));
await p.setInputFiles('input[type=file][multiple]', [join(dir, 'fixtures', 'echt-chatgpt.jpg')]);
await p.getByRole('button', { name: /Rezept erkennen/ }).click();
await p.waitForSelector('.error');
check('Ohne Schlüssel: keine Anfrage, klare Meldung', seen.length === 0 && (await p.locator('.error').textContent()).includes('API-Schlüssel'));
await p.evaluate(() => location.reload());

// Schlüssel eintragen (falscher wird abgelehnt)
await p.goto(`${BASE}#/mehr`);
await p.locator('input[placeholder="sk-ant-…"]').fill('sk-ant-falsch');
await p.getByRole('button', { name: 'Speichern' }).first().click();
await p.waitForTimeout(800);
check('Falscher Schlüssel wird abgelehnt', (await p.locator('.toast').textContent()).includes('abgelehnt'));
await p.locator('input[placeholder="sk-ant-…"]').fill('sk-ant-test');
await p.getByRole('button', { name: 'Speichern' }).first().click();
await p.waitForSelector('text=Aktiv.');
check('Richtiger Schlüssel wird gespeichert', true);

// Import mit Claude
await p.goto(`${BASE}#/import`);
await p.setInputFiles('input[type=file][multiple]', [join(dir, 'fixtures', 'echt-chatgpt.jpg')]);
await p.getByRole('button', { name: /Rezept erkennen/ }).click();
await p.waitForSelector('.editor', { timeout: 30000 });
const req = seen[0];
check('Anfrage an Claude Opus 5.5 mit Bild und strukturierter Ausgabe', req.body.model === 'claude-opus-5-5' && req.body.messages[0].content[0].type === 'image' && req.body.output_config?.format?.type === 'json_schema');
check('Direkter Browserzugriff + Ersatzmodell-Header', req.headers['anthropic-dangerous-direct-browser-access'] === 'true' && (req.headers['anthropic-beta'] ?? '').includes('server-side-fallback-2026-07-01') && req.body.fallbacks === 'default');
check('Titel übernommen', (await p.locator('.input-title').inputValue()) === 'Hirse-Apfel-Brei');
const rows = await p.locator('.ing-row').evaluateAll((rs) => rs.map((r) => [...r.querySelectorAll('input')].map((i) => i.value).join('|')));
check('Zutaten übernommen, Einheit normalisiert (Teelöffel → TL)', rows.join(' / ') === '30|g|Hirse / 0,5||kleiner Apfel / 120|ml|Wasser / 1|TL|Rapsöl', rows.join(' / '));
check('Schritte übernommen', (await p.locator('.step-row textarea').count()) === 2);
check('Kategorie vorgeschlagen', (await p.locator('.chip[aria-pressed="true"]').allTextContents()).some((t) => t.includes('Frühstück')));
check('Hinweis „Von Claude erkannt“', (await p.locator('.confidence').textContent()).includes('Claude'));
await p.getByRole('button', { name: /Speichern/ }).last().click();
await p.waitForSelector('.recipe-title');
check('Rezept gespeichert', (await p.locator('.recipe-title').textContent()) === 'Hirse-Apfel-Brei');

// Text einfügen → Claude (ohne Rezeptnamen → leerer Titel mit Hinweis)
mode = 'notitle';
await p.goto(`${BASE}#/import`);
await p.getByRole('button', { name: /Text einfügen/ }).click();
await p.locator('.paste-box textarea').fill('30 g Hirse, ½ Apfel, 120 ml Wasser. Hirse mit Wasser köcheln, Apfel reiben und mitköcheln.');
await p.getByRole('button', { name: 'Auswerten' }).click();
await p.waitForSelector('.editor', { timeout: 30000 });
const last = seen[seen.length - 1];
check('Text einfügen: Text geht an Claude (ohne Bild)', last.body.messages[0].content.every((c) => c.type === 'text') && last.body.messages[0].content[0].text.includes('Hirse'));
check('Kein Titel im Text → Feld leer + Hinweis', (await p.locator('.input-title').inputValue()) === '' && (await p.locator('.confidence').textContent()).includes('kein Rezeptname'));
mode = 'ok';

// Fehlerfälle
for (const [m, expect] of [['rate', 'Zu viele Anfragen'], ['norecipe', 'kein Rezept']]) {
  mode = m;
  await p.goto(`${BASE}#/import`);
  await p.setInputFiles('input[type=file][multiple]', [join(dir, 'fixtures', 'social-post.jpg')]);
  await p.getByRole('button', { name: /Rezept erkennen/ }).click();
  await p.waitForSelector('.error', { timeout: 60000 });
  check(`Fehlermeldung: ${expect}`, (await p.locator('.error').textContent()).includes(expect), await p.locator('.error').textContent());
  await p.evaluate(() => location.reload());
}

// Offline → klare Meldung
mode = 'ok';
const before = seen.length;
await p.goto(`${BASE}#/import`);
await ctx.setOffline(true);
await p.setInputFiles('input[type=file][multiple]', [join(dir, 'fixtures', 'echt-chatgpt.jpg')]);
await p.getByRole('button', { name: /Rezept erkennen/ }).click();
await p.waitForSelector('.error', { timeout: 20000 });
await ctx.setOffline(false);
check('Offline: verständliche Meldung, keine Anfrage', seen.length === before && (await p.locator('.error').textContent()).includes('Internet'));

check('Keine JS-Fehler', errs.length === 0, errs.join('; '));
await browser.close();
console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failed ? 1 : 0);
