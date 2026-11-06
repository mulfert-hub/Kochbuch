// Test: Sprachsteuerung im Kochmodus, Einkaufsliste per Sprache, Rezept per Link (inkl. Teilen).
// Spracherkennung und Claude werden nachgebildet. Aufruf: npm run build && npm run test:voice
import { chromium } from '../scripts/pw.mjs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const PORT = 4198;
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

const seen = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => {
  localStorage.setItem('kochbuch-anthropic-key', 'sk-ant-test');
  // Nachgebildete Spracherkennung: window.__say('weiter') liefert einen erkannten Satz
  window.__spoken = [];
  window.__active = new Set();
  class FakeRecognition {
    constructor() { this.continuous = false; this.onresult = null; this.onend = null; this.onerror = null; }
    start() { window.__active.add(this); }
    stop() { window.__active.delete(this); this.onend?.(); }
    abort() { window.__active.delete(this); this.onend?.(); }
  }
  window.webkitSpeechRecognition = FakeRecognition;
  window.SpeechRecognition = FakeRecognition;
  window.__say = (text) => {
    for (const r of [...window.__active]) {
      const res = [[{ transcript: text }]];
      res[0].isFinal = true;
      r.onresult?.({ results: res, resultIndex: 0 });
      if (!r.continuous) { window.__active.delete(r); r.onend?.(); }
    }
  };
  // Vorlesen nachbilden: gesprochene Texte merken
  window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); setTimeout(() => u.onend?.(), 10); };
  window.speechSynthesis.cancel = () => {};
});
await ctx.route('https://api.anthropic.com/**', async (route) => {
  const req = route.request();
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  const body = JSON.parse(req.postData());
  seen.push(body);
  const out = { is_recipe: true, title: 'Bananenbrot', servings: 12, servings_label: 'Scheiben', time_minutes: 70, ingredients: [{ group: null, quantity: 3, quantity_max: null, unit: '', name: 'reife Bananen', note: null }, { group: null, quantity: 250, quantity_max: null, unit: 'g', name: 'Mehl', note: null }], steps: ['Bananen zerdrücken.', '60 Minuten backen.'], notes: null, category: 'Backen' };
  return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: body.model, stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'server_tool_use', id: 'srv1', name: 'web_fetch', input: { url: 'https://example.org/bananenbrot' } }, { type: 'text', text: JSON.stringify(out) }] }) });
});
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const say = async (t) => { await p.evaluate((x) => window.__say(x), t); await p.waitForTimeout(250); };

// ---------- Kochmodus mit Sprache ----------
await p.goto(`${BASE}#/rezepte`);
await p.waitForSelector('.recipe-row');
await p.getByRole('button', { name: /Kürbissuppe/ }).click();
await p.getByRole('button', { name: /Jetzt kochen/ }).click();
await p.getByRole('button', { name: 'Sprachsteuerung an' }).click();
await p.waitForSelector('.cook-voice');
check('Mikrofon an: Hinweis und Zutaten werden vorgelesen', (await p.evaluate(() => window.__spoken[0])).startsWith('Zutaten: 1 kg Hokkaido-Kürbis'));
await say('weiter');
check('„weiter“ → Schritt 1, wird vorgelesen', (await p.locator('.cook-step-no').textContent()) === '1' && (await p.evaluate(() => window.__spoken.at(-1))).startsWith('Schritt 1.'));
await say('nächster Schritt');
await say('weiter');
check('Schritt 3 erreicht', (await p.locator('.cook-step-no').textContent()) === '3');
await say('zurück');
check('„zurück“ → Schritt 2', (await p.locator('.cook-step-no').textContent()) === '2');
await say('weiter');
await say('Timer starten');
await p.waitForSelector('.timer');
check('„Timer starten“ nimmt die Zeit aus dem Schritt (20 Min.)', /^(19|20):\d\d$/.test(await p.locator('.timer-time').textContent()) && (await p.evaluate(() => window.__spoken.at(-1))) === 'Timer 20 Minuten gestartet.');
await say('Stell einen Timer auf fünf Minuten');
check('„Timer fünf Minuten“ → zweiter Timer', (await p.locator('.timer').count()) === 2 && (await p.locator('.timer-time').allTextContents()).some((t) => /^[45]:\d\d$/.test(t)));
await say('Das Wetter ist schön');
check('Unverständliches wird angezeigt, nichts passiert', (await p.locator('.cook-heard').textContent()).includes('nicht verstanden') && (await p.locator('.cook-step-no').textContent()) === '3');
await say('lies vor');
check('„vorlesen“ liest den aktuellen Schritt', (await p.evaluate(() => window.__spoken.at(-1))).startsWith('Schritt 3.'));
await p.getByRole('button', { name: 'Sprachsteuerung aus' }).click();
check('Mikrofon aus', (await p.locator('.cook-voice').count()) === 0 && (await p.evaluate(() => window.__active.size)) === 0);
while ((await p.getByRole('button', { name: 'Timer abbrechen' }).count()) > 0) await p.getByRole('button', { name: 'Timer abbrechen' }).first().click();

// ---------- Einkaufsliste per Sprache ----------
await p.goto(`${BASE}#/einkauf`);
await p.getByRole('button', { name: 'Per Sprache hinzufügen' }).click();
await p.waitForSelector('.voice-hint');
await say('Milch, zwei Zitronen und ein Stück Butter');
await p.waitForTimeout(400);
const names = await p.locator('.shop-name').allTextContents();
const amounts = await p.locator('.shop-amount').allTextContents();
check('Drei Einträge aus einem Satz', ['Milch', 'Zitronen', 'Butter'].every((n) => names.includes(n)), names.join(', '));
check('Mengen erkannt (2 Zitronen, 1 Stück Butter)', amounts.includes('2') && amounts.some((a) => a.includes('1 Stück')), amounts.join(', '));

// ---------- Rezept per Link ----------
await p.goto(`${BASE}#/import`);
await p.locator('.link-box input').fill('Schau mal: https://example.org/bananenbrot?x=1.');
await p.getByRole('button', { name: /Laden/ }).click();
await p.waitForSelector('.editor', { timeout: 20000 });
const req = seen.at(-1);
check('Claude bekommt den Link und das Web-Fetch-Werkzeug', req.messages[0].content[0].text.includes('https://example.org/bananenbrot?x=1') && req.tools?.[0]?.type === 'web_fetch_20260209');
check('Rezept im Prüfbildschirm', (await p.locator('.input-title').inputValue()) === 'Bananenbrot');
await p.getByRole('button', { name: /Speichern/ }).last().click();
await p.waitForSelector('.recipe-title');
check('Quelle am Rezept verlinkt', (await p.locator('.recipe-source a').textContent()) === 'example.org' && (await p.locator('.recipe-source a').getAttribute('href')) === 'https://example.org/bananenbrot?x=1');

// ---------- Teilen aus dem Browser (Share Target) ----------
await p.goto(`${BASE}#/buch`);
await p.evaluate(() => navigator.serviceWorker.ready);
await p.reload();
await p.evaluate(() => navigator.serviceWorker.ready);
// Wie Android: Formular per POST an ./share-target senden → Service Worker leitet in den Import weiter
await Promise.all([
  p.waitForURL(/#\/import/, { timeout: 10000 }).catch(() => {}),
  p.evaluate(() => {
    const f = document.createElement('form');
    f.method = 'POST';
    f.enctype = 'multipart/form-data';
    f.action = './share-target';
    for (const [k, v] of [['title', 'Leckeres Rezept'], ['text', 'Leckeres Rezept https://example.org/curry']]) {
      const i = document.createElement('input');
      i.name = k;
      i.value = v;
      f.appendChild(i);
    }
    document.body.appendChild(f);
    f.submit();
  }),
]);
await p.waitForSelector('.link-box input');
check('Geteilter Link landet im Import-Feld', (await p.locator('.link-box input').inputValue()) === 'https://example.org/curry', decodeURIComponent(p.url()));

check('Keine JS-Fehler', errs.length === 0, errs.join('; '));
await browser.close();
console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failed ? 1 : 0);
