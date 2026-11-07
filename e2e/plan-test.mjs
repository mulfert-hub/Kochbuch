// Test: Wochenplan – vom Rezept aus eintragen, im Plan auf einen Tag tippen und Rezept wählen,
// entfernen, Zutaten der Woche auf die Einkaufsliste. Aufruf: npm run build && npm run test:plan
import { chromium } from '../scripts/pw.mjs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const PORT = 4199;
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
const shots = process.env.SHOTS;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));

// Vom Rezept aus: „Zum Wochenplan hinzufügen“ → Tag „Morgen“
await p.goto(`${BASE}#/rezepte`);
await p.waitForSelector('.recipe-row');
await p.getByRole('button', { name: /Kürbissuppe/ }).click();
await p.getByRole('button', { name: /Zum Wochenplan hinzufügen/ }).click();
await p.waitForSelector('.plan-days');
check('Tagesauswahl zeigt 14 Tage ab heute', (await p.locator('.plan-day-pick').count()) === 14 && (await p.locator('.plan-day-pick').first().textContent()).startsWith('Heute'));
if (shots) await p.screenshot({ path: `${shots}/plan-tag-waehlen.png` });
await p.locator('.plan-day-pick').nth(1).click();
check('Bestätigung', (await p.locator('.toast').textContent()).includes('Morgen'));

// Wochenplan über die Navigation
await p.locator('.nav').getByText('Woche').click();
await p.waitForSelector('.plan-days-list');
const tomorrow = new Date(Date.now() + 864e5);
const tomorrowInWeek = (tomorrow.getDay() + 6) % 7 !== 0; // morgen = Montag → nächste Woche
if (!tomorrowInWeek) await p.getByRole('button', { name: 'Nächste Woche' }).click();
check('Rezept steht im Plan bei „Morgen“', (await p.locator('.plan-day', { hasText: 'Morgen' }).locator('.plan-meal-title').textContent()).includes('Kürbissuppe'));
if (!tomorrowInWeek) await p.getByRole('button', { name: 'Vorige Woche' }).click();
check('Heute ist hervorgehoben', (await p.locator('.plan-day.is-today').count()) === 1);
check('Sieben Tage, Montag zuerst', (await p.locator('.plan-day').count()) === 7);

// Im Plan auf „Heute“ tippen → Rezept auswählen
await p.locator('.plan-day.is-today .plan-day-head').click();
await p.waitForSelector('.plan-pick');
await p.getByLabel('Rezept suchen').fill('shak');
check('Suche im Auswahlfenster', (await p.locator('.plan-pick-item').count()) === 1);
await p.getByLabel('Rezept suchen').fill('');
if (shots) await p.screenshot({ path: `${shots}/plan-rezept-waehlen.png` });
await p.locator('.plan-pick-item', { hasText: 'Shakshuka' }).click();
await p.waitForTimeout(200);
check('Shakshuka heute eingeplant', (await p.locator('.plan-day.is-today .plan-meal-title').textContent()).includes('Shakshuka'));
await p.locator('.plan-day.is-today .plan-day-head').click();
check('Schon geplantes Rezept ist markiert', await p.locator('.plan-pick-item.is-planned', { hasText: 'Shakshuka' }).isDisabled());
await p.getByRole('button', { name: 'Schließen' }).click();
if (shots) await p.screenshot({ path: `${shots}/plan-woche.png` });

// Rezept im Plan antippen → Rezeptseite
await p.locator('.plan-day.is-today .plan-meal-title').click();
await p.waitForSelector('.recipe-title');
check('Antippen öffnet das Rezept', (await p.locator('.recipe-title').textContent()) === 'Shakshuka');
await p.goBack();
await p.waitForSelector('.plan-days-list');

// Zutaten auf die Einkaufsliste
await p.getByRole('button', { name: /Zutaten der Woche/ }).click();
await p.getByRole('button', { name: 'Hinzufügen' }).click();
await p.waitForTimeout(300);
const shop = await p.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('kochbuch');
  r.onsuccess = () => { const t = r.result.transaction('shopping').objectStore('shopping').getAll(); t.onsuccess = () => res(t.result.length); };
}));
check('Zutaten auf der Einkaufsliste', shop > 5, `${shop} Einträge`);

// Entfernen
await p.getByRole('button', { name: /Shakshuka aus dem Plan nehmen/ }).click();
await p.waitForTimeout(200);
check('Entfernt', (await p.locator('.plan-day.is-today .plan-meal').count()) === 0);
const tomb = await p.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('kochbuch');
  r.onsuccess = () => { const t = r.result.transaction('tombstones').objectStore('tombstones').getAll(); t.onsuccess = () => res(t.result.filter((x) => x.kind === 'plan').length); };
}));
check('Löschvermerk für den Abgleich', tomb === 1);

// Rezept umbenennen → Titel im Plan zieht mit (für die Familien-App)
const titleInDb = await p.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('kochbuch');
  r.onsuccess = () => { const t = r.result.transaction('plan').objectStore('plan').getAll(); t.onsuccess = () => res(t.result.map((e) => e.title)); };
}));
check('Plan liegt lesbar in IndexedDB „kochbuch“/„plan“', titleInDb.length === 1 && titleInDb[0].includes('Kürbissuppe'), JSON.stringify(titleInDb));

check('Keine JS-Fehler', errs.length === 0, errs.join('; '));
await browser.close();
console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failed ? 1 : 0);
