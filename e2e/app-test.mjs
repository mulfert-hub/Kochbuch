// Funktionstest der App im echten Browser (gebauter Stand). Aufruf: npm run build && npm run test:app
import { chromium } from '../scripts/pw.mjs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, mkdirSync } from 'node:fs';

const dir = dirname(fileURLToPath(import.meta.url));
const PORT = 4184;
const BASE = `http://localhost:${PORT}`;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: join(dir, '..'), stdio: 'ignore' });
process.on('exit', () => server.kill());
for (let i = 0; i < 50; i++) {
  try { await fetch(BASE); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
}
mkdirSync(join(dir, 'output'), { recursive: true });

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' – ' + extra : ''}`);
  if (!ok) failed++;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${BASE}/#/buch`);
await page.waitForSelector('.cover-title');
check('Titelseite mit Inhaltsverzeichnis', (await page.locator('.cover-toc button').count()) === 8);

// Wischen (Touch-Pointer simulieren)
const swipe = async (fromX, toX) => {
  const box = await page.locator('.book-stage').boundingBox();
  const y = box.y + box.height / 2;
  await page.evaluate(async ({ fromX, toX, y }) => {
    const el = document.querySelector('.book-stage');
    const ev = (type, x) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, isPrimary: true }));
    ev('pointerdown', fromX);
    for (let i = 1; i <= 8; i++) { ev('pointermove', fromX + ((toX - fromX) * i) / 8); await new Promise((r) => setTimeout(r, 16)); }
    ev('pointerup', toX);
  }, { fromX, toX, y });
  await page.waitForTimeout(500);
};
await swipe(330, 60);
check('Wischen nach links blättert vor', /#\/buch\/.+/.test(page.url()));
const firstTitle = await page.locator('.book-page.is-top .recipe-title').textContent();
check('Seite 1 zeigt Rezept', firstTitle === 'Overnight Oats mit Beeren', firstTitle);
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(500);
check('Pfeiltaste rechts', (await page.locator('.book-page.is-top .recipe-title').textContent()) === 'Shakshuka');
await swipe(60, 330);
check('Wischen nach rechts blättert zurück', (await page.locator('.book-page.is-top .recipe-title').textContent()) === 'Overnight Oats mit Beeren');

// Portionen skalieren (Shakshuka: 2 Portionen, 4 Eier)
await page.goto(`${BASE}/#/rezepte`);
await page.getByRole('button', { name: /Shakshuka/ }).click();
await page.waitForSelector('.recipe-title');
const eggs = () => page.locator('.ingredients li', { hasText: 'Eier' }).locator('.ing-amount').textContent();
check('Ausgangsmenge', (await eggs()) === '4', await eggs());
await page.getByRole('button', { name: 'Mehr', exact: true }).click();
await page.getByRole('button', { name: 'Mehr', exact: true }).click();
check('4 Portionen → 8 Eier', (await eggs()) === '8', await eggs());
const tomatoes = await page.locator('.ingredients li', { hasText: 'Chiliflocken' }).locator('.ing-amount').textContent();
check('½ TL × 2 = 1 TL', tomatoes === '1 TL', tomatoes);
await page.getByRole('button', { name: 'Weniger' }).click();
await page.getByRole('button', { name: 'Weniger' }).click();
await page.getByRole('button', { name: 'Weniger' }).click();
check('1 Portion → 2 Eier', (await eggs()) === '2', await eggs());
const chili = await page.locator('.ingredients li', { hasText: 'Chiliflocken' }).locator('.ing-amount').textContent();
check('½ TL ÷ 2 = ¼ TL', chili === '¼ TL', chili);

// Einkaufsliste: zwei Rezepte mit gemeinsamer Zutat (Zwiebel, Olivenöl)
await page.getByRole('button', { name: /Auf die Einkaufsliste/ }).click();
await page.goto(`${BASE}/#/rezepte/`);
await page.getByRole('button', { name: /Ofengemüse/ }).click();
await page.getByRole('button', { name: /Auf die Einkaufsliste/ }).click();
await page.goto(`${BASE}/#/einkauf`);
await page.waitForSelector('.shop-item');
const items = await page.locator('.shop-item').allTextContents();
const oil = items.find((t) => t.startsWith('Olivenöl'));
check('Olivenöl zusammengefasst (1 + 4 EL)', !!oil && oil.includes('5 EL') && items.filter((t) => t.startsWith('Olivenöl')).length === 1, oil);
const zw = items.filter((t) => /Zwiebel/.test(t));
check('Zwiebel: Shakshuka 0,5 + Ofengemüse „rote Zwiebel“ getrennt', zw.length === 2, zw.join(' | '));
await page.locator('.shop-check').first().click();
await page.waitForTimeout(300);
check('Abhaken', (await page.locator('.shop-item.is-checked').count()) === 1);
await page.locator('.shop-add input').fill('2 Zitronen');
await page.locator('.shop-add input').press('Enter');
await page.waitForTimeout(200);
check('Manueller Eintrag', (await page.locator('.shop-item', { hasText: 'Zitronen' }).count()) === 1);

// Suche
await page.goto(`${BASE}/#/rezepte`);
await page.locator('.search input').fill('zimt');
await page.waitForTimeout(200);
const hits = await page.locator('.recipe-row-title').allTextContents();
check('Suche „zimt“ (Titel + Zutat) findet nur Zimtschnecken', hits.length === 1 && hits[0] === 'Zimtschnecken', hits.join(', '));
await page.locator('.search input').fill('kurbis');
await page.waitForTimeout(200);
const k = await page.locator('.recipe-row-title').allTextContents();
check('Suche ohne Umlaut „kurbis“ → Kürbissuppe', k.length === 1 && k[0].startsWith('Kürbissuppe'), k.join(', '));
await page.locator('.search input').fill('Eischnee');
await page.waitForTimeout(200);
const e = await page.locator('.recipe-row-title').allTextContents();
check('Suche in Zubereitungsschritten „Eischnee“ → Mousse', e.length === 1 && e[0] === 'Schokoladenmousse', e.join(', '));
await page.locator('.chips button', { hasText: 'Frühstück' }).click();
await page.locator('.search input').fill('');
await page.waitForTimeout(200);
check('Filter Kategorie Frühstück', (await page.locator('.recipe-row-title').count()) === 2);
await page.locator('.chips button', { hasText: 'Alle' }).click();
await page.locator('.search input').fill('');

// Backup Export
await page.goto(`${BASE}/#/mehr`);
const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Backup exportieren/ }).click()]);
const file = join(dir, 'output', 'backup-test.json');
await download.saveAs(file);
const backup = JSON.parse(readFileSync(file, 'utf8'));
check('Backup enthält 8 Rezepte', backup.recipes.length === 8 && backup.format === 'kochbuch-backup');

// Löschen
await page.goto(`${BASE}/#/rezepte`);
await page.getByRole('button', { name: /Spaghetti/ }).click();
await page.getByRole('button', { name: 'Löschen' }).click();
await page.locator('dialog .btn-danger').click();
await page.waitForTimeout(300);
check('Rezept gelöscht', (await page.locator('.recipe-row-title').count()) === 7);

// Backup Import (zusammenführen)
await page.goto(`${BASE}/#/mehr`);
const chooser = page.waitForEvent('filechooser');
await page.getByRole('button', { name: /Backup importieren/ }).click();
await (await chooser).setFiles(file);
await page.locator('dialog .btn-primary').click(); // Zusammenführen
await page.waitForTimeout(500);
await page.goto(`${BASE}/#/rezepte`);
await page.waitForSelector('.recipe-row-title');
check('Nach Import wieder 8 Rezepte', (await page.locator('.recipe-row-title').count()) === 8);

// Offline: Service Worker aktiv, Seite lädt ohne Netz
await page.goto(`${BASE}/#/buch`);
await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForTimeout(800);
await ctx.setOffline(true);
await page.reload();
await page.waitForSelector('.cover-title', { timeout: 5000 }).catch(() => {});
check('Offline-Start (Service Worker)', (await page.locator('.cover-title').count()) === 1);
await ctx.setOffline(false);

// Manifest
const manifest = await (await fetch(`${BASE}/manifest.webmanifest`)).json();
check('Manifest mit Share Target', manifest.share_target?.method === 'POST' && manifest.icons.length >= 3);

check('Keine JS-Fehler', errors.length === 0, errors.join('; '));
await browser.close();
console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failed ? 1 : 0);
