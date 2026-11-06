// Test: Kochmodus, Timer, Einkaufsliste nach Abteilungen, „Was koche ich heute?“, Zutat ersetzen, Rezept anpassen.
// Claude wird nachgebildet. Aufruf: npm run build && npm run test:features
import { chromium } from '../scripts/pw.mjs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const PORT = 4195;
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
await ctx.addInitScript(() => localStorage.setItem('kochbuch-anthropic-key', 'sk-ant-test'));
await ctx.route('https://api.anthropic.com/**', async (route) => {
  const req = route.request();
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  const body = JSON.parse(req.postData());
  const props = Object.keys(body.output_config.format.schema.properties);
  const text = body.messages[0].content.map((c) => c.text ?? '').join('\n');
  seen.push({ props, text });
  let out;
  if (props.includes('from_book')) {
    const id = text.match(/\[([^\]]+)\] Shakshuka/)[1];
    const id2 = text.match(/\[([^\]]+)\] Ofengemüse/)[1];
    const id3 = text.match(/\[([^\]]+)\] Overnight/)[1];
    const id4 = text.match(/\[([^\]]+)\] Kürbissuppe/)[1];
    out = {
      from_book: [
        { recipe_id: id, reason: 'Eier und Paprika sind da.', missing: ['1 Dose stückige Tomaten', 'Petersilie'], tip: null },
        { recipe_id: 'gibt-es-nicht', reason: 'x', missing: [], tip: null },
        { recipe_id: id2, reason: 'Paprika und Kartoffeln.', missing: [], tip: null },
        { recipe_id: id3, reason: 'Für Thea.', missing: [], tip: null },
        { recipe_id: id4, reason: 'Zwiebeln sind da.', missing: ['Kürbis'], tip: null },
        { recipe_id: id, reason: 'doppelt', missing: [], tip: null },
      ],
      new_ideas: [
        { title: 'Kartoffel-Paprika-Pfanne', description: 'Schnell und mild, passt für Thea.', missing: [], time_minutes: 25 },
        { title: 'Paprika-Frittata', description: 'Resteverwertung mit Eiern.', missing: ['Feta'], time_minutes: 20 },
        { title: 'Gemüse-Omelett', description: 'Klassiker.', missing: [], time_minutes: 15 },
        { title: 'Zu viel', description: 'sollte abgeschnitten werden', missing: [], time_minutes: null },
      ],
    };
  } else if (props.includes('is_recipe') && text.startsWith('Gericht:')) {
    out = { is_recipe: true, title: 'Kartoffel-Paprika-Pfanne', servings: 4, servings_label: 'Portionen', time_minutes: 25, ingredients: [{ group: null, quantity: 600, quantity_max: null, unit: 'g', name: 'Kartoffeln', note: null }, { group: null, quantity: 2, quantity_max: null, unit: '', name: 'Paprikaschoten', note: null }], steps: ['Kartoffeln würfeln und 15 Minuten braten.', 'Paprika zugeben und 10 Minuten mitbraten.'], notes: null, category: 'Hauptgericht', tags: ['vegetarisch', 'schnell'] };
  } else if (props.includes('options')) {
    out = { options: [{ replacement: { group: null, quantity: 1, quantity_max: null, unit: '', name: 'Apfel', note: 'fein gerieben' }, explanation: 'Etwas säuerlicher, passt gut.', step_hint: 'Mit dem Brei köcheln.' }], warning: null };
  } else if (props.includes('changes')) {
    out = {
      recipe: { is_recipe: true, title: 'Shakshuka (vegan)', servings: 2, servings_label: 'Portionen', time_minutes: 30, ingredients: [{ group: null, quantity: 200, quantity_max: null, unit: 'g', name: 'Seidentofu', note: null }, { group: null, quantity: 1, quantity_max: null, unit: 'Dose', name: 'stückige Tomaten', note: null }], steps: ['Tomaten 10 Minuten einköcheln.', 'Tofu zerbröseln und 5 Minuten ziehen lassen.'], notes: null, category: 'Frühstück', tags: ['vegan'] },
      changes: ['Eier durch Seidentofu ersetzt'],
    };
  }
  return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ id: 'msg', type: 'message', role: 'assistant', model: body.model, stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: JSON.stringify(out) }] }) });
});
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`${BASE}#/rezepte`);
await p.waitForSelector('.recipe-row');

// ---------- Kochmodus + Timer ----------
await p.getByRole('button', { name: /Kürbissuppe/ }).click();
await p.waitForSelector('.recipe-title');
check('Timer-Knopf in der Schrittliste („20 Minuten“)', (await p.locator('.steps .timer-chip').allTextContents()).some((t) => t.includes('20 Min.')));
await p.getByRole('button', { name: /Jetzt kochen/ }).click();
await p.waitForSelector('.cook');
check('Kochmodus öffnet mit Zutaten', (await p.locator('.cook-body h1').textContent()) === 'Zutaten' && (await p.locator('.cook-ings li').count()) === 9);
await p.getByRole('button', { name: /Los geht/ }).click();
await p.getByRole('button', { name: /Weiter/ }).click();
check('Schritt 2 mit passenden Zutaten und Mengen', (await p.locator('.cook-ing-chip').allTextContents()).join(' | ').includes('2 EL Olivenöl'), (await p.locator('.cook-ing-chip').allTextContents()).join(' | '));
await p.getByRole('button', { name: /Weiter/ }).click();
const chip = p.locator('.cook-body .timer-chip').first();
check('Schritt 3 bietet 20-Minuten-Timer', (await chip.textContent()).includes('20 Min.'));
await chip.click();
await p.waitForSelector('.timer');
check('Timer läuft (Leiste sichtbar)', /1[89]:\d\d|20:00/.test(await p.locator('.timer-time').textContent()), await p.locator('.timer-time').textContent());
// Timer auf fast abgelaufen setzen → „Fertig!“
await p.evaluate(() => {
  const t = JSON.parse(localStorage.getItem('kochbuch-timers'));
  t[0].endsAt = Date.now() + 1000;
  localStorage.setItem('kochbuch-timers', JSON.stringify(t));
});
await p.reload();
await p.waitForSelector('.timer.is-done', { timeout: 5000 }).catch(() => {});
check('Timer übersteht Neuladen und meldet „Fertig!“', (await p.locator('.timer.is-done').count()) === 1);
const box = await p.getByRole('button', { name: 'Alarm beenden' }).boundingBox();
check('Timer-Leiste passt auf den Bildschirm (auch bei langem Namen)', box.x + box.width <= 390, JSON.stringify(box));
await p.getByRole('button', { name: 'Alarm beenden' }).click();
check('Alarm beenden', (await p.locator('.timer').count()) === 0);
const wake = await p.evaluate(() => 'wakeLock' in navigator);
check('Bildschirm-Sperre wird verhindert (Wake Lock verfügbar)', wake);

// ---------- Einkaufsliste nach Abteilungen ----------
await p.goto(`${BASE}#/einkauf`);
for (const t of ['1 l Milch', '2 Zwiebeln', '500 g Mehl', '1 Packung Spülmittel', '200 g Hackfleisch']) {
  await p.locator('.shop-add input').fill(t);
  await p.locator('.shop-add input').press('Enter');
  await p.waitForTimeout(120);
}
const groups = await p.locator('.shop-aisle-title').allTextContents();
check('Gruppiert in Laufreihenfolge', groups.join(' > ') === 'Obst & Gemüse > Kühlregal & Milchprodukte > Fleisch & Fisch > Backen & Süßes > Sonstiges', groups.join(' > '));
await p.locator('.shop-item', { hasText: 'Spülmittel' }).getByRole('button', { name: /Abteilung/ }).click();
await p.getByRole('button', { name: 'Getränke' }).click();
await p.waitForTimeout(200);
check('Abteilung von Hand ändern', (await p.locator('.shop-aisle', { hasText: 'Spülmittel' }).locator('.shop-aisle-title').textContent()) === 'Getränke');
await p.locator('.shop-add input').fill('Spülmittel');
await p.locator('.shop-add input').press('Enter');

// ---------- Tags ----------
await p.goto(`${BASE}#/rezepte`);
await p.getByRole('button', { name: /Overnight Oats/ }).click();
await p.getByRole('button', { name: 'Bearbeiten' }).click();
await p.locator('input[aria-label="Neuer Tag"]').fill('Thea');
await p.locator('input[aria-label="Neuer Tag"]').press('Enter');
await p.locator('.tag-offer', { hasText: 'Familie' }).click();
await p.getByRole('button', { name: /^Speichern$/ }).click();
await p.waitForSelector('.recipe-tags');
check('Tags am Rezept', (await p.locator('.recipe-tags .tag-pill').allTextContents()).join(' ') === '#Thea #Familie');
await p.locator('.tag-pill', { hasText: 'Thea' }).click();
await p.waitForSelector('.tag-filter');
check('Tag antippen filtert die Rezeptliste', (await p.locator('.recipe-row-title').allTextContents()).join(',') === 'Overnight Oats mit Beeren');
await p.locator('.tag-filter .chip', { hasText: 'Thea' }).click();
await p.locator('.search input').fill('thea');
await p.waitForTimeout(200);
check('Suche findet Tags', (await p.locator('.recipe-row-title').allTextContents()).join(',') === 'Overnight Oats mit Beeren');
await p.locator('.search input').fill('');

// ---------- Was koche ich heute? ----------
await p.goto(`${BASE}#/buch`);
await p.getByRole('button', { name: /Was koche ich heute/ }).first().click();
await p.waitForSelector('.today');
await p.locator('.today textarea').fill('Eier, Paprika, Zwiebeln');
await p.getByRole('button', { name: 'schnell' }).click();
await p.getByRole('button', { name: '#Thea' }).click();
await p.getByRole('button', { name: /Vorschläge holen/ }).click();
await p.waitForSelector('.today-card');
const req = seen.find((s) => s.props.includes('from_book'));
check('Anfrage enthält Vorräte, Wünsche, Tags und das Kochbuch', req.text.includes('Eier, Paprika') && req.text.includes('schnell') && req.text.includes('#Thea') && req.text.includes('Zimtschnecken'));
const badges = await p.locator('.today-badge').allTextContents();
check('Alle passenden aus dem Buch (4, ohne Doppelte/Unbekannte) + genau 3 neue Ideen', badges.filter((b) => b === 'Aus eurem Buch').length === 4 && badges.filter((b) => b === 'Neue Idee').length === 3, badges.join(','));
check('Buch-Vorschlag zuerst, unbekannte IDs verworfen', (await p.locator('.today-card strong').first().textContent()) === 'Shakshuka');
await p.getByRole('button', { name: /Fehlendes einkaufen/ }).first().click();
await p.waitForTimeout(300);
await p.goto(`${BASE}#/einkauf`);
await p.waitForSelector('.shop-name');
check('Fehlendes auf der Einkaufsliste', (await p.locator('.shop-name').allTextContents()).some((t) => t.includes('Tomaten')), (await p.locator('.shop-name').allTextContents()).join(', '));

// Idee ausarbeiten → Prüfbildschirm → speichern
await p.goto(`${BASE}#/heute`);
await p.getByRole('button', { name: '#Thea' }).click();
await p.getByRole('button', { name: /Vorschläge holen/ }).click();
await p.waitForSelector('.today-card.is-idea');
await p.locator('.today-card.is-idea').first().getByRole('button', { name: /Rezept ausarbeiten/ }).click();
await p.waitForSelector('.editor');
check('Idee als Rezept im Prüfbildschirm', (await p.locator('.input-title').inputValue()) === 'Kartoffel-Paprika-Pfanne' && (await p.locator('.ing-row').count()) === 2);
check('Hinweis „noch nicht ausprobiert“', (await p.locator('.confidence').textContent()).includes('noch nicht ausprobiert'));
check('Gewählter Tag übernommen', (await p.locator('.tag-chip[aria-pressed="true"]').allTextContents()).some((t) => t.includes('Thea')));
await p.getByRole('button', { name: /Speichern/ }).last().click();
await p.waitForSelector('.recipe-title');
check('Neues Rezept im Buch, mit Tag und Notiz', (await p.locator('.recipe-title').textContent()) === 'Kartoffel-Paprika-Pfanne' && (await p.locator('.recipe-tags').textContent()).includes('Thea') && (await p.locator('.recipe-notes').textContent()).includes('noch nicht ausprobiert'));

// ---------- Zutat ersetzen ----------
await p.goto(`${BASE}#/rezepte`);
await p.getByRole('button', { name: /Overnight Oats/ }).click();
await p.getByRole('button', { name: /Zutat ersetzen/ }).click();
await p.locator('.sheet .chip', { hasText: 'Beeren' }).click();
await p.locator('.sheet input').fill('nur Apfel da');
await p.getByRole('button', { name: /Ersatz vorschlagen/ }).click();
await p.waitForSelector('.assist-card');
await p.getByRole('button', { name: /Im Rezept ersetzen/ }).click();
await p.waitForTimeout(400);
const ings = await p.locator('.ingredients li').allTextContents();
check('Zutat im Rezept ersetzt', ings.some((t) => t.includes('Apfel')) && !ings.some((t) => t.includes('Beeren')), ings.join(' | '));
check('Hinweis in den Notizen', (await p.locator('.recipe-notes').textContent()).includes('Statt 1 Handvoll Beeren'));

// ---------- Rezept anpassen ----------
await p.goto(`${BASE}#/rezepte`);
await p.getByRole('button', { name: /Shakshuka/ }).click();
await p.getByRole('button', { name: /Rezept anpassen/ }).click();
await p.locator('.sheet .chip', { hasText: /^vegan$/ }).click();
await p.waitForSelector('.assist-changes');
await p.getByRole('button', { name: /Als Variante speichern/ }).click();
await p.waitForSelector('.recipe-title');
await p.waitForTimeout(300);
check('Variante gespeichert und geöffnet', (await p.locator('.recipe-title').textContent()) === 'Shakshuka (vegan)');
check('Variante mit Herkunftshinweis', (await p.locator('.recipe-notes').textContent()).includes('Angepasst aus „Shakshuka“'));
await p.goto(`${BASE}#/rezepte`);
const titles = await p.locator('.recipe-row-title').allTextContents();
check('Original bleibt erhalten', titles.includes('Shakshuka') && titles.includes('Shakshuka (vegan)'));

check('Keine JS-Fehler', errs.length === 0, errs.join('; '));
await browser.close();
console.log(failed ? `\n${failed} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(failed ? 1 : 0);
