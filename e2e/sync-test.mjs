// Synchronisationstest mit zwei „Handys“ (getrennte Browser-Profile) und einem nachgebildeten
// privaten GitHub-Repository (die GitHub-API wird im Browser abgefangen). Aufruf: npm run build && npm run test:sync
import { chromium } from '../scripts/pw.mjs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// ---------- Nachgebildetes GitHub (privates Daten-Repository) ----------
const files = new Map(); // path → { sha, body: Buffer }
let shaCounter = 0;
let requests = 0;
let forceConflict = 0; // nächste n Schreibzugriffe auf kochbuch.json mit 409 beantworten
let repoPrivate = true;
const commits = [];

async function mockGitHub(ctx) {
  await ctx.route('https://api.github.com/**', async (route) => {
    requests++;
    const req = route.request();
    const h = await req.allHeaders();
    const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'ETag, X-RateLimit-Remaining' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (h['authorization'] !== 'Bearer github_pat_TESTTOKEN_1234567890') return route.fulfill({ status: 401, headers: cors, body: '{"message":"Bad credentials"}' });
    const u = new URL(req.url());
    const json = (status, body) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (u.pathname === '/repos/familie/kochbuch-daten') return json(200, { private: repoPrivate, permissions: { push: true } });
    const m = u.pathname.match(/^\/repos\/familie\/kochbuch-daten\/contents\/(.+)$/);
    if (!m) return json(404, { message: 'Not Found' });
    const path = decodeURIComponent(m[1]);
    if (req.method() === 'GET') {
      const f = files.get(path);
      if (f) {
        if ((h['accept'] ?? '').includes('raw')) return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/octet-stream' }, body: f.body });
        const big = f.body.length > 1024 * 1024;
        return json(200, { type: 'file', path, sha: f.sha, encoding: big ? 'none' : 'base64', content: big ? '' : f.body.toString('base64').replace(/(.{60})/g, '$1\n') });
      }
      const inDir = [...files.entries()].filter(([p]) => p.startsWith(path + '/'));
      if (inDir.length) return json(200, inDir.map(([p, f]) => ({ type: 'file', path: p, sha: f.sha })));
      return json(404, { message: 'Not Found' });
    }
    const body = JSON.parse(req.postData() ?? '{}');
    const existing = files.get(path);
    if (req.method() === 'PUT') {
      if (path === 'kochbuch.json' && forceConflict > 0) {
        forceConflict--;
        return json(409, { message: 'is at abc but expected def' });
      }
      if (existing && !body.sha) return json(422, { message: '"sha" wasn\'t supplied.' });
      if (existing && body.sha !== existing.sha) return json(409, { message: 'conflict' });
      if (!existing && body.sha) return json(409, { message: 'conflict' });
      const sha = `sha${++shaCounter}`;
      files.set(path, { sha, body: Buffer.from(body.content, 'base64') });
      commits.push(`${body.message}: ${path}`);
      return json(existing ? 200 : 201, { content: { path, sha } });
    }
    if (req.method() === 'DELETE') {
      if (!existing || existing.sha !== body.sha) return json(409, { message: 'conflict' });
      files.delete(path);
      return json(200, {});
    }
    return json(400, { message: 'unbekannt' });
  });
}

const browser = await chromium.launch();
async function phone(name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await mockGitHub(ctx);
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
  await p.getByRole('button', { name: /Jetzt abgleichen/ }).click();
  await p.waitForTimeout(200);
  await p.waitForFunction(() => /Zuletzt abgeglichen|fehlgeschlagen|ungültig/.test(document.querySelector('.sync-state')?.textContent ?? ''), null, { timeout: 15000 });
  return p.locator('.sync-state').textContent();
}

async function connect(p, token = 'github_pat_TESTTOKEN_1234567890') {
  await p.goto(`${BASE}#/mehr`);
  await p.locator('input[placeholder="benutzer/kochbuch-daten"]').fill('familie/kochbuch-daten');
  await p.locator('input[placeholder="github_pat_…"]').fill(token);
  await p.getByRole('button', { name: /Verbinden/ }).click();
}

// 0) Schutz: öffentliches Repository und falscher Token werden abgelehnt
const A = await phone('A');
repoPrivate = false;
await connect(A);
await A.waitForSelector('.sync-setup .sync-state.is-error');
check('Öffentliches Repository wird abgelehnt', (await A.locator('.sync-setup .sync-state').textContent()).includes('öffentlich'));
repoPrivate = true;
await connect(A, 'github_pat_FALSCH_123456789012345');
await A.waitForFunction(() => /ungültig/.test(document.querySelector('.sync-setup .sync-state')?.textContent ?? ''), null, { timeout: 10000 });
check('Falscher Token wird abgelehnt', true);

// 1) Handy A verbindet sich
await connect(A);
await A.waitForFunction(() => /Zuletzt abgeglichen/.test(document.querySelector('.sync-state')?.textContent ?? ''), null, { timeout: 15000 });
check('A: verbunden und erster Abgleich', files.has('kochbuch.json'));
check('Token wird nicht angezeigt', !(await A.content()).includes('TESTTOKEN'));

// 2) Handy B (eigene Beispielrezepte) verbindet sich → keine Duplikate
const B = await phone('B');
await connect(B);
await B.waitForFunction(() => /Zuletzt abgeglichen/.test(document.querySelector('.sync-state')?.textContent ?? ''), null, { timeout: 15000 });
const tB = await titles(B);
check('B: Beispielrezepte nicht doppelt', tB.length === 8, `${tB.length} Rezepte`);

// 3) A legt ein Rezept mit Foto an → B bekommt es samt Foto
await A.goto(`${BASE}#/import`);
await A.getByRole('button', { name: /Von Hand anlegen/ }).click();
await A.waitForSelector('.photo-field');
await A.locator('.input-title').fill('Testrezept Sync');
await A.locator('.step-row textarea').first().fill('Alles verrühren und backen.');
await A.locator('.photo-field ~ input[type=file]:not([capture])').setInputFiles(join(dir, 'fixtures', 'social-post.jpg'));
await A.waitForSelector('.photo-field img');
await A.getByRole('button', { name: /^Verwerfen$|Speichern/ }).last().click();
await A.waitForSelector('.recipe-title');
await syncButton(A);
const imgFiles = [...files.keys()].filter((p) => p.startsWith('bilder/')).length;
check('Foto wurde ins Repository hochgeladen', imgFiles === 1, `${imgFiles} Bilddatei(en)`);
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

// 7) Einkaufsliste: A setzt etwas drauf, B hakt ab, A löscht einen Eintrag
const shop = (p) =>
  p.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('kochbuch');
        r.onsuccess = () => {
          const g = r.result.transaction('shopping').objectStore('shopping').getAll();
          g.onsuccess = () => res(g.result.map((x) => `${x.name}${x.checked ? '✓' : ''}`).sort());
        };
      }),
  );
for (const t of ['2 Zitronen', '1 l Milch', 'Brot']) {
  await A.goto(`${BASE}#/einkauf`);
  await A.locator('.shop-add input').fill(t);
  await A.locator('.shop-add input').press('Enter');
  await A.waitForTimeout(150);
}
await syncButton(A);
await syncButton(B);
check('B: Einkaufsliste von A angekommen', (await shop(B)).join(',') === 'Brot,Milch,Zitronen', (await shop(B)).join(','));
await B.goto(`${BASE}#/einkauf`);
await B.locator('.shop-item', { hasText: 'Milch' }).locator('.shop-check').click();
await B.waitForTimeout(200);
await A.goto(`${BASE}#/einkauf`);
await A.locator('.shop-item', { hasText: 'Brot' }).getByRole('button', { name: /löschen/ }).click();
await A.waitForTimeout(200);
await syncButton(B);
// Gleichzeitig: A speichert, während B gerade geschrieben hat → Konflikt, A führt neu zusammen
forceConflict = 1;
await syncButton(A);
await syncButton(B);
check('Abhaken (B) und Löschen (A) beide übernommen – trotz Konflikt', (await shop(A)).join(',') === 'Milch✓,Zitronen' && (await shop(B)).join(',') === 'Milch✓,Zitronen', `A: ${(await shop(A)).join(',')} | B: ${(await shop(B)).join(',')}`);

// 8) Automatischer Abgleich auf der Einkaufsliste (alle 30 s, ohne Knopf)
await B.goto(`${BASE}#/einkauf`);
await A.goto(`${BASE}#/einkauf`);
await A.locator('.shop-add input').fill('Butter');
await A.locator('.shop-add input').press('Enter');
await B.waitForFunction(() => document.body.textContent.includes('Butter'), null, { timeout: 45000 }).catch(() => {});
check('B sieht „Butter“ automatisch (innerhalb von ~30 s)', (await shop(B)).includes('Butter'));

check('Keine JS-Fehler', !A.errors.length && !B.errors.length, [...A.errors, ...B.errors].join('; '));
console.log(`(${requests} Anfragen, ${commits.length} Commits im nachgebildeten GitHub)`);
await browser.close();
console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failed ? 1 : 0);
