// Erzeugt realistische Rezept-Screenshots (iPhone-Auflösung 1179 × 2556 px) für den OCR-Test.
// node e2e/fixtures/make-fixtures.mjs
import { chromium } from '../../scripts/pw.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3 });
const page = await ctx.newPage();

// 1) App-Layout hell, langes Rezept → drei Screenshots mit Überlappung (wie beim Scrollen)
await page.goto('file://' + join(dir, 'html', 'app-hell.html'));
await page.screenshot({ path: join(dir, 'app-hell-1.png') });
await page.evaluate(() => window.scrollTo(0, 700));
await page.screenshot({ path: join(dir, 'app-hell-2.png') });
await page.evaluate(() => window.scrollTo(0, 1300));
await page.screenshot({ path: join(dir, 'app-hell-3.png') });

// 2) Blog im Dark Mode, zwei Screenshots
await page.goto('file://' + join(dir, 'html', 'blog-dunkel.html'));
await page.screenshot({ path: join(dir, 'blog-dunkel-1.png') });
await page.evaluate(() => window.scrollTo(0, 600));
await page.screenshot({ path: join(dir, 'blog-dunkel-2.png') });

// 3) „Hold-out“-Fälle, an denen die Heuristik NICHT optimiert wurde:
//    Social-Media-Post (JPEG, kleine graue Schrift, Menge rechts) und Foto einer Buchseite (schräg, unscharf)
await page.goto('file://' + join(dir, 'html', 'social-post.html'));
await page.screenshot({ path: join(dir, 'social-post.jpg'), type: 'jpeg', quality: 55 });
await page.goto('file://' + join(dir, 'html', 'kochbuch-foto.html'));
await page.screenshot({ path: join(dir, 'kochbuch-foto.jpg'), type: 'jpeg', quality: 70 });

await browser.close();
console.log('Fixtures erzeugt');
