// Rezept-Erkennung mit Claude (Bild → strukturierte Rezeptdaten).
// Der API-Schlüssel gehört euch, liegt nur auf dem jeweiligen Handy und wird direkt an Anthropic geschickt.
import Anthropic from '@anthropic-ai/sdk';
import * as z from 'zod/v4';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { Category, Ingredient, RecipeDraft } from '../types';
import { lookupUnit, UNITS } from '../lib/units';
import { uid } from '../lib/id';

const KEY_STORAGE = 'kochbuch-anthropic-key';
const MODEL_STORAGE = 'kochbuch-claude-model';

export const CLAUDE_MODELS = [
  { id: 'claude-opus-5-5', label: 'Genau (Claude Opus 5.5)', hint: 'ca. 3–6 Cent pro Rezept' },
  { id: 'claude-haiku-5-5', label: 'Günstig (Claude Haiku 5.5)', hint: 'unter 1 Cent, etwas weniger zuverlässig' },
] as const;
export type ClaudeModel = (typeof CLAUDE_MODELS)[number]['id'];

export function getApiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}
export function setApiKey(key: string) {
  try {
    if (key.trim()) localStorage.setItem(KEY_STORAGE, key.trim());
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* ignorieren */
  }
}
export function getModel(): ClaudeModel {
  try {
    const m = localStorage.getItem(MODEL_STORAGE);
    if (m && CLAUDE_MODELS.some((x) => x.id === m)) return m as ClaudeModel;
  } catch {
    /* ignorieren */
  }
  return 'claude-opus-5-5';
}
export function setModel(m: ClaudeModel) {
  try {
    localStorage.setItem(MODEL_STORAGE, m);
  } catch {
    /* ignorieren */
  }
}
/** Ist ein Schlüssel eingetragen? Dann wird immer Claude benutzt. */
export function claudeConfigured(): boolean {
  return !!getApiKey();
}

function client(apiKey = getApiKey()) {
  // Direkter Aufruf aus dem Browser ist hier gewollt: eigener Schlüssel, eigenes Gerät, kein Server dazwischen.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
}

// ---------- Antwortformat ----------
const IngredientSchema = z.object({
  group: z.string().nullable().describe('Zwischenüberschrift wie „Für den Teig“, sonst null'),
  quantity: z.number().nullable().describe('Menge als Zahl (½ = 0.5), null wenn keine Menge angegeben'),
  quantity_max: z.number().nullable().describe('Obergrenze bei Spannen wie „2–3“, sonst null'),
  unit: z.string().describe('Einheit in Kurzform aus der Liste, leer bei Stückzahl'),
  name: z.string().describe('Zutat ohne Menge und Einheit, z. B. „rote Linsen“'),
  note: z.string().nullable().describe('Zusatz wie „fein gehackt“ oder „zimmerwarm“, sonst null'),
});

const RecipeSchema = z.object({
  is_recipe: z.boolean().describe('false, wenn auf den Bildern kein Rezept zu sehen ist'),
  title: z.string().describe('Rezeptname genau so, wie er im Bild steht; leerer Text, wenn kein Name erkennbar ist (nichts erfinden)'),
  servings: z.number().nullable(),
  servings_label: z.string().nullable().describe('z. B. „Portionen“, „Personen“, „Stück“'),
  time_minutes: z.number().nullable().describe('Gesamtzeit in Minuten, falls angegeben'),
  ingredients: z.array(IngredientSchema),
  steps: z.array(z.string()).describe('Zubereitungsschritte in der Reihenfolge, je Schritt ein vollständiger Text'),
  notes: z.string().nullable().describe('Tipps oder Hinweise aus dem Rezept, sonst null'),
  category: z.string().nullable().describe('passende Kategorie aus der Liste oder null'),
});
export type ClaudeRecipe = z.infer<typeof RecipeSchema>;

const SYSTEM = `Du liest Rezepte aus Screenshots und Fotos (Rezept-Apps, Webseiten, Chat-Antworten, Social Media, Kochbücher) und gibst sie strukturiert zurück.
Regeln:
- Übernimm nur, was im Bild steht. Erfinde keine Mengen, Zutaten oder Schritte. Unleserliches lieber weglassen.
- Ignoriere Bedienelemente, Statusleisten, Werbung, Kommentare, Hashtags und Benutzernamen.
- Gehören mehrere Bilder zu einem Rezept (überlappende Screenshots), füge sie zu einem Rezept zusammen, ohne Doppelungen.
- Mengen als Zahl: „½“ = 0.5, „1 ½“ = 1.5, „2–3“ = quantity 2 und quantity_max 3.
- Einheiten als Kurzform, möglichst aus dieser Liste: ${UNITS.map((u) => u.key).join(', ')}. Bei Stückzahlen („2 Eier“) bleibt die Einheit leer.
- Antworte auf Deutsch. Übersetze fremdsprachige Rezepte ins Deutsche.`;

export class ClaudeError extends Error {
  constructor(
    message: string,
    public kind: 'auth' | 'rate' | 'refusal' | 'not-recipe' | 'network' | 'other',
  ) {
    super(message);
  }
}

/** Bild für Claude vorbereiten: optional zuschneiden, lange Seite ≤ 2576 px, JPEG */
async function encodeImage(blob: Blob, crop?: { x: number; y: number; w: number; h: number } | null): Promise<string> {
  const bmp = await createImageBitmap(blob);
  const sx = crop ? Math.round(crop.x * bmp.width) : 0;
  const sy = crop ? Math.round(crop.y * bmp.height) : 0;
  const sw = crop ? Math.round(crop.w * bmp.width) : bmp.width;
  const sh = crop ? Math.round(crop.h * bmp.height) : bmp.height;
  const scale = Math.min(1, 2576 / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

/** Liest ein Rezept aus einem oder mehreren Bildern. */
export async function recognizeWithClaude(
  images: { blob: Blob; crop?: { x: number; y: number; w: number; h: number } | null }[],
  categories: Category[],
): Promise<RecipeDraft> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const img of images) {
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await encodeImage(img.blob, img.crop) } });
  }
  content.push({
    type: 'text',
    text: `${images.length > 1 ? `Diese ${images.length} Bilder gehören zu einem Rezept.` : 'Lies das Rezept aus diesem Bild.'} Kategorien zur Auswahl: ${categories.map((c) => c.name).join(', ') || '(keine)'}.`,
  });

  return request(content, categories);
}

async function request(content: Anthropic.Beta.BetaContentBlockParam[], categories: Category[]): Promise<RecipeDraft> {
  const model = getModel();
  let res;
  try {
    res = await client().beta.messages.parse({
      model,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: 'user', content }],
      output_config: { effort: model === 'claude-opus-5-5' ? 'medium' : 'low', format: betaZodOutputFormat(RecipeSchema) },
      // Falls Claude eine Anfrage fälschlich ablehnt, versucht Anthropic sie automatisch mit einem passenden Ersatzmodell
      ...(model === 'claude-opus-5-5' ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
      throw new ClaudeError('Der API-Schlüssel ist ungültig oder hat keine Berechtigung.', 'auth');
    if (e instanceof Anthropic.RateLimitError) throw new ClaudeError('Zu viele Anfragen – bitte kurz warten und erneut versuchen.', 'rate');
    if (e instanceof Anthropic.APIConnectionError) throw new ClaudeError('Keine Verbindung zu Claude.', 'network');
    if (e instanceof Anthropic.APIError) throw new ClaudeError(`Claude-Fehler (${e.status}): ${e.message}`, 'other');
    throw e;
  }
  if (res.stop_reason === 'refusal') throw new ClaudeError('Claude hat die Anfrage abgelehnt.', 'refusal');
  const r = res.parsed_output;
  if (!r) throw new ClaudeError('Claude hat keine verwertbare Antwort geliefert.', 'other');
  if (!r.is_recipe) throw new ClaudeError('Auf dem Bild wurde kein Rezept gefunden.', 'not-recipe');
  return toDraft(r, categories);
}

export function toDraft(r: ClaudeRecipe, categories: Category[]): RecipeDraft {
  const ingredients: Ingredient[] = r.ingredients
    .filter((i) => i.name.trim())
    .map((i) => ({
      id: uid(),
      quantity: i.quantity,
      quantityMax: i.quantity_max != null && i.quantity != null && i.quantity_max > i.quantity ? i.quantity_max : null,
      unit: i.unit ? (lookupUnit(i.unit)?.key ?? i.unit) : '',
      name: i.name.trim(),
      note: i.note?.trim() || undefined,
      group: i.group?.trim() || undefined,
    }));
  const cat = r.category ? categories.find((c) => c.name.toLowerCase() === r.category!.toLowerCase()) : undefined;
  return {
    title: r.title.trim(),
    servings: r.servings && r.servings > 0 ? r.servings : null,
    servingsLabel: r.servings_label ?? 'Portionen',
    timeMinutes: r.time_minutes && r.time_minutes > 0 ? Math.round(r.time_minutes) : null,
    ingredients,
    steps: r.steps.map((s) => s.trim()).filter(Boolean),
    notes: r.notes?.trim() || undefined,
    categoryIds: cat ? [cat.id] : [],
    ocrText: '',
    source: 'claude',
  };
}

/** Liest ein Rezept aus eingefügtem Text. */
export async function recognizeTextWithClaude(text: string, categories: Category[]): Promise<RecipeDraft> {
  return request(
    [{ type: 'text', text: `Strukturiere dieses Rezept. Kategorien zur Auswahl: ${categories.map((c) => c.name).join(', ') || '(keine)'}.\n\n${text}` }],
    categories,
  );
}

/** Schlüssel prüfen (kleine, günstige Anfrage) */
export async function testApiKey(key: string): Promise<'ok' | 'invalid' | 'error'> {
  try {
    await client(key).models.retrieve(getModel());
    return 'ok';
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return 'invalid';
    return 'error';
  }
}
