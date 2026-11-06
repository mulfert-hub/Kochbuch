// Erzeugt PNG-Icons aus public/icons/icon.svg (einmalig ausführen: node scripts/make-icons.mjs)
import { chromium } from './pw.mjs';
import { readFileSync } from 'node:fs';
const svg = readFileSync('public/icons/icon.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
async function render(size, file, { maskable = false } = {}) {
  await page.setViewportSize({ width: size, height: size });
  const inner = maskable
    ? `<div style="width:${size}px;height:${size}px;background:#e4573d;display:grid;place-items:center"><div style="width:${size * 0.8}px;height:${size * 0.8}px">${svg.replace('rx="112"', 'rx="0"')}</div></div>`
    : svg;
  await page.setContent(`<html><body style="margin:0;background:transparent">${inner}</body></html><style>svg{width:100%;height:100%;display:block}</style>`);
  await page.screenshot({ path: file, omitBackground: !maskable, clip: { x: 0, y: 0, width: size, height: size } });
}
await render(192, 'public/icons/icon-192.png');
await render(512, 'public/icons/icon-512.png');
await render(512, 'public/icons/icon-maskable-512.png', { maskable: true });
// iOS: ohne Transparenz, iOS rundet selbst ab
await page.setViewportSize({ width: 180, height: 180 });
await page.setContent(`<html><body style="margin:0">${svg.replace('rx="112"', 'rx="0"')}</body><style>svg{width:180px;height:180px;display:block}</style></html>`);
await page.screenshot({ path: 'public/icons/apple-touch-icon.png', clip: { x: 0, y: 0, width: 180, height: 180 } });
await browser.close();
console.log('Icons erzeugt');
