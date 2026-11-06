// Synchronisationstest mit zwei „Handys“ (getrennte Browser-Profile) und einem nachgebildeten
// Google Drive (Anmeldung + Drive-API werden im Browser abgefangen). Aufruf: npm run build && npm run test:sync
import { chromium } from '../scripts/pw.mjs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const dir = dirname(fileURLToPath(import.meta.url));
const PORT = 4193;
const BASE = `http://localhost:${PORT}/`;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: join(dir, '..'), stdio: 'ignore' });
process.on('exit', () => server.kill());
for (let i = 0; i < 50; i++) {
  try {
    await fetch(BASE);
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 200));
  }
}

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${extra ? ' – ' + extra : ''}`);
  if (!ok) failed++;
};

// ---------- Nachgebildetes Google Drive (ein gemeinsames Konto) ----------
const drive = new Map(); // id → { name, body: Buffer, type }
let requests = 0;
function parseMultipart(buf, contentType) {
  const boundary = contentType.match(/boundary=(.+)$/)[1].replace(/^"|"$/g, '');
  const parts = buf.toString('latin1').split(`--${boundary}`).slice(1, -1);
  const out = [];
  for (const p of parts) {
    const idx = p.indexOf('\r\n\r\n');
    const head = p.slice(0, idx);
    const body = Buffer.from(p.slice(idx + 4, p.length - 2), 'latin1');
    out.push({ head, body });
  }
  return out;
}

async function mockGoogle(ctx) {
  await ctx.route('https://accounts.google.com/**', async (route) => {
    const u = new URL(route.request().url());
    const back = `${u.searchParams.get('redirect_uri')}#access_token=tok-${randomUUID()}&token_type=Bearer&expires_in=3600&state=${u.searchParams.get('state')}`;
    await route.fulfill({ status: 302, headers: { location: back } });
  });
  await ctx.route('https://www.googleapis.com/**', async (route) => {
    requests++;
    const req = route.request();
    const u = new URL(req.url());
    const cors = { 'access-control-allow-origin': '*' };
    if (!req.headers()['authorization']?.startsWith('Bearer tok-')) return route.fulfill({ status: 401, headers: cors, body: 'no auth' });
    const m = u.pathname.match(/\/files\/?([^/]*)$/);
    const id = m?.[1];
    if (req.method() === 'GET' && !id) {
      const files = [...drive.entries()].map(([fid, f]) => ({ id: fid, name: f.name }));
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ files }) });
    }
    if (req.method() === 'GET' && id) {
      const f = drive.get(id);
      if (!f) return route.fulfill({ status: 404, headers: cors, body: '' });
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': f.type }, body: f.body });
    }
    if (req.method() === 'POST') {
      // Wie bei Google: nur multipart/related wird angenommen
      if (!/^multipart\/related;\s*boundary=/.test(req.headers()['content-type'] ?? '')) {
        return route.fulfill({ status: 400, headers: cors, body: 'Bad content type, expected multipart/related' });
      }
      if (u.searchParams.get('uploadType') !== 'multipart') return route.fulfill({ status: 400, headers: cors, body: 'uploadType' });
      const parts = parseMultipart(req.postDataBuffer(), req.headers()['content-type']);
      const meta = JSON.parse(parts[0].body.toString('utf8'));
      const typeMatch = parts[1].head.match(/Content-Type:\s*(\S+)/i);
      const nid = randomUUID();
      drive.set(nid, { name: meta.name, body: parts[1].body, type: typeMatch?.[1] ?? 'application/octet-stream' });
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ id: nid, name: meta.name }) });
    }
    if (req.method() === 'PATCH' && id) {
      const f = drive.get(id);
      f.body = req.postDataBuffer();
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ id, name: f.name }) });
    }
    if (req.method() === 'DELETE' && id) {
      drive.delete(id);
      return route.fulfill({ status: 204, headers: cors, body: '' });
    }
    return route.fulfill({ status: 400, headers: cors, body: 'unbekannt' });
  });
  await ctx.addInitScript(() => localStorage.setItem('kochbuch-google-client-id', JSON.stringify('test.apps.googleusercontent.com')));
}

const browser = await chromium.launch();
async function phone(name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mockGoogle(ctx);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(`${name}: ${e.message}`));
  await page.goto(`${BASE}#/mehr`);
  await page.waitForSelector('.more-card');
  return page;
}
const titles = (p) =>
  p.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('kochbuch');
        r.onsuccess = () => {
          const g = r.result.transaction('recipes').objectStore('recipes').getAll();
          g.onsuccess = () => res(g.result.map((x) => x.title).sort());
        };
      }),
  );
async function syncButton(p) {
  await p.goto(`${BASE}#/mehr`);
  await p.getByRole('button', { name: /Jetzt synchronisieren/ }).click();
  await p.waitForFunction(() => /Zuletzt synchronisiert|fehlgeschlagen/.test(document.querySelector('.sync-state')?.textContent ?? ''), null, { timeout: 15000 });
  return p.locator('.sync-state').textContent();
}

// 1) Handy A verbindet sich
const A = await phone('A');
await A.getByRole('button', { name: /Mit Google Drive verbinden/ }).click();
await A.waitForFunction(() => /Zuletzt synchronisiert/.test(document.querySelector('.sync-state')?.textContent ?? ''), null, { timeout: 15000 });
check('A: Anmeldung (Weiterleitung) und erste Synchronisation', true);
check('Drive enthält den Datenstand', [...drive.values()].some((f) => f.name === 'kochbuch-sync.json'));

// 2) Handy B (eigene Beispielrezepte) verbindet sich → keine Duplikate
const B = await phone('B');
await B.getByRole('button', { name: /Mit Google Drive verbinden/ }).click();
await B.waitForFunction(() => /Zuletzt synchronisiert/.test(document.querySelector('.sync-state')?.textContent ?? ''), null, { timeout: 15000 });
const tB = await titles(B);
check('B: Beispielrezepte nicht doppelt', tB.length === 8, `${tB.length} Rezepte`);

// 3) A legt ein Rezept mit Foto an → B bekommt es samt Foto
await A.goto(`${BASE}#/import`);
await A.getByRole('button', { name: /Text einfügen/ }).click();
await A.locator('.paste-box textarea').fill('Testrezept Sync\nZutaten\n200 g Mehl\n2 Eier\nZubereitung\nAlles verrühren und backen.');
await A.getByRole('button', { name: 'Auswerten' }).click();
await A.waitForSelector('.photo-field');
await A.locator('.photo-field ~ input[type=file]:not([capture])').setInputFiles(join(dir, 'fixtures', 'social-post.jpg'));
await A.waitForSelector('.photo-field img');
await A.getByRole('button', { name: /^Verwerfen$|Speichern/ }).last().click();
await A.waitForSelector('.recipe-title');
await syncButton(A);
const imgFiles = [...drive.values()].filter((f) => f.name.startsWith('img-')).length;
check('Foto wurde nach Drive hochgeladen', imgFiles === 1, `${imgFiles} Bilddatei(en)`);
const stB = await syncButton(B);
check('B: neues Rezept angekommen', (await titles(B)).includes('Testrezept Sync'), stB);
await B.goto(`${BASE}#/rezepte`);
await B.getByRole('button', { name: /Testrezept Sync/ }).click();
await B.waitForSelector('.recipe-title');
check('B: Foto angekommen', (await B.locator('.recipe-photo img').count()) === 1);

// 4) B ändert das Rezept, A übernimmt die Änderung
await B.getByRole('button', { name: 'Bearbeiten' }).click();
await B.locator('.input-title').fill('Testrezept Sync (geändert)');
await B.getByRole('button', { name: /^Speichern$/ }).click();
await B.waitForSelector('.recipe-title');
await syncButton(B);
await syncButton(A);
check('A: Änderung von B übernommen', (await titles(A)).includes('Testrezept Sync (geändert)'));

// 5) A löscht ein Beispielrezept → auch auf B weg (und kommt nicht zurück)
await A.goto(`${BASE}#/rezepte`);
await A.getByRole('button', { name: /Shakshuka/ }).click();
await A.getByRole('button', { name: 'Löschen' }).click();
await A.locator('dialog .btn-danger').click();
await A.waitForTimeout(300);
await syncButton(A);
await syncButton(B);
await syncButton(A);
check('Löschen wird übertragen', !(await titles(B)).includes('Shakshuka') && !(await titles(A)).includes('Shakshuka'));

// 6) Automatische Synchronisation nach einer Änderung (ohne Knopf)
await B.goto(`${BASE}#/inhalt`);
await B.getByRole('button', { name: 'Bearbeiten' }).click();
await B.locator('.toc-add input').fill('Suppen');
await B.locator('.toc-add button[type=submit]').click();
await B.waitForTimeout(6000); // automatische Synchronisation nach ca. 4 s
await syncButton(A);
const catsA = await A.evaluate(
  () =>
    new Promise((res) => {
      const r = indexedDB.open('kochbuch');
      r.onsuccess = () => {
        const g = r.result.transaction('categories').objectStore('categories').getAll();
        g.onsuccess = () => res(g.result.map((x) => x.name));
      };
    }),
);
check('Automatisch: neue Kategorie von B ist auf A', catsA.includes('Suppen'), catsA.join(', '));

// 7) Abgelaufene Anmeldung → Hinweis statt Fehler
await A.evaluate(() => localStorage.removeItem('kochbuch-google-token'));
await A.evaluate(() => localStorage.setItem('kochbuch-sync', JSON.stringify({ ...JSON.parse(localStorage.getItem('kochbuch-sync')), lastSilentLogin: Date.now() })));
await A.goto(`${BASE}#/mehr`);
await A.reload();
await A.waitForSelector('.sync-state');
check('Abgelaufene Anmeldung wird erklärt', /abgelaufen/.test(await A.locator('.sync-state').textContent()));
await A.evaluate(() => localStorage.setItem('kochbuch-sync', JSON.stringify({ ...JSON.parse(localStorage.getItem('kochbuch-sync')), lastSilentLogin: 0 })));
await A.reload(); // stille Neu-Anmeldung beim Start
await A.waitForTimeout(2500);
await A.goto(`${BASE}#/mehr`);
await A.waitForSelector('.sync-state');
check('Stille Neu-Anmeldung beim App-Start', /Zuletzt synchronisiert/.test(await A.locator('.sync-state').textContent()), await A.locator('.sync-state').textContent());

check('Keine JS-Fehler', !A.errors.length && !B.errors.length, [...A.errors, ...B.errors].join('; '));
console.log(`(${requests} Anfragen an das nachgebildete Google Drive)`);
await browser.close();
console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failed ? 1 : 0);
