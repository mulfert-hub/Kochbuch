// Claude als Küchenhilfe: „Was koche ich heute?“, „Zutat ersetzen“, „Rezept anpassen“.
import * as z from 'zod/v4';
import type { Category, Ingredient, Recipe, RecipeDraft } from '../types';
import { callClaude, IngredientSchema, RecipeSchema, tagContext, toDraft } from './claudeRecipe';
import { cleanSuggestedTags, GENERAL_TAGS } from '../lib/tags';
import { ingredientToLine } from '../lib/ingredientParser';
import { lookupUnit } from '../lib/units';

function recipeAsText(r: Recipe): string {
  return [
    `Titel: ${r.title}`,
    r.servings ? `Portionen: ${r.servings} ${r.servingsLabel ?? ''}` : '',
    'Zutaten:',
    ...r.ingredients.map((i) => `- ${i.group ? `[${i.group}] ` : ''}${ingredientToLine(i)}`),
    'Zubereitung:',
    ...r.steps.map((s, k) => `${k + 1}. ${s}`),
    r.notes ? `Notizen: ${r.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

const BASE = `Du hilfst einer Familie beim Kochen. Antworte auf Deutsch, praktisch und kurz. Nutze Einheiten wie im Rezept (g, ml, EL, TL, Stück …).`;

// ---------- Was koche ich heute? ----------
// Alle passenden Rezepte aus dem Buch plus immer 3 neue Ideen.
const TodaySchema = z.object({
  from_book: z
    .array(
      z.object({
        recipe_id: z.string().describe('ID eines Rezepts aus der Liste'),
        reason: z.string().describe('ein Satz, warum es passt'),
        missing: z.array(z.string()).describe('Zutaten, die fehlen und besorgt werden müssten (kurz, z. B. „200 ml Sahne“)'),
        tip: z.string().nullable().describe('optionaler Tipp, z. B. wie man eine fehlende Zutat ersetzt'),
      }),
    )
    .describe('alle Rezepte aus dem Kochbuch, die gut zu Zutaten und Wünschen passen (auch keins, wenn nichts passt); bestes zuerst'),
  new_ideas: z
    .array(
      z.object({
        title: z.string().describe('Name des Gerichts'),
        description: z.string().describe('ein Satz, was es ist und warum es passt'),
        missing: z.array(z.string()).describe('Zutaten, die fehlen würden'),
        time_minutes: z.number().nullable(),
      }),
    )
    .describe('genau 3 neue Rezeptideen, die nicht im Kochbuch stehen'),
});
export type BookSuggestion = z.infer<typeof TodaySchema>['from_book'][number] & { recipe: Recipe };
export type RecipeIdea = z.infer<typeof TodaySchema>['new_ideas'][number];

export async function whatToCook(
  available: string,
  wishes: string[],
  recipes: Recipe[],
): Promise<{ fromBook: BookSuggestion[]; ideas: RecipeIdea[] }> {
  const list = recipes
    .map(
      (r) =>
        `[${r.id}] ${r.title}${r.timeMinutes ? ` (${r.timeMinutes} Min.)` : ''}${(r.tags ?? []).length ? ` #${r.tags!.join(' #')}` : ''}: ${r.ingredients.map((i) => i.name).join(', ')}`,
    )
    .join('\n');
  const out = await callClaude(
    TodaySchema,
    `${BASE} Nenne alle Rezepte aus dem Kochbuch der Familie, die gut zu den vorhandenen Zutaten und Wünschen passen (Tags mit # zählen als Merkmale, z. B. #Thea = für Thea geeignet). Schlage außerdem genau 3 neue, alltagstaugliche Rezeptideen vor, die nicht im Kochbuch stehen, die Wünsche erfüllen und möglichst die vorhandenen Zutaten nutzen. Grundzutaten wie Salz, Pfeffer, Öl, Mehl, Zucker gelten als vorhanden.`,
    [
      {
        type: 'text',
        text: `Das ist da: ${available.trim() || '(keine Angabe)'}\n${wishes.length ? `Wünsche: ${wishes.join(', ')}\n` : ''}\nKochbuch:\n${list || '(noch leer)'}`,
      },
    ],
  );
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const fromBook = out.from_book.flatMap((s) => (byId.has(s.recipe_id) && !seen.has(s.recipe_id) && seen.add(s.recipe_id) ? [{ ...s, recipe: byId.get(s.recipe_id)! }] : []));
  return { fromBook, ideas: out.new_ideas.slice(0, 3) };
}

/** Eine Idee zum vollständigen Rezept ausarbeiten lassen */
export async function ideaToRecipe(idea: RecipeIdea, available: string, wishes: string[], categories: Category[]): Promise<RecipeDraft> {
  const tags = await tagContext();
  const out = await callClaude(
    RecipeSchema,
    `${BASE} Schreibe ein vollständiges, alltagstaugliches Rezept mit genauen Mengen, Portionen (Standard 4, falls nicht anders gewünscht), Zeit und klaren Schritten. Setze is_recipe auf true. Kategorien zur Auswahl: ${categories.map((c) => c.name).join(', ')}.`,
    [
      {
        type: 'text',
        text: `Gericht: ${idea.title}\n${idea.description}\nVorhanden: ${available.trim() || '(keine Angabe)'}\n${wishes.length ? `Wünsche: ${wishes.join(', ')}` : ''}\n${tags.text}`,
      },
    ],
  );
  const draft = toDraft(out, categories, tags.allowed);
  if (!draft.title) draft.title = idea.title;
  draft.source = 'idea';
  draft.notes = [draft.notes, 'Von Claude vorgeschlagen – noch nicht ausprobiert.'].filter(Boolean).join('\n\n');
  return draft;
}

// ---------- Zutat ersetzen ----------
const SubstituteSchema = z.object({
  options: z
    .array(
      z.object({
        replacement: IngredientSchema.describe('die Ersatzzutat mit passender Menge für dieses Rezept'),
        explanation: z.string().describe('kurz: wie es schmeckt/funktioniert'),
        step_hint: z.string().nullable().describe('was sich an der Zubereitung ändert, sonst null'),
      }),
    )
    .describe('1 bis 3 Möglichkeiten, beste zuerst'),
  warning: z.string().nullable().describe('Hinweis, falls Ersetzen schwierig ist (z. B. beim Backen), sonst null'),
});
export type SubstituteOption = z.infer<typeof SubstituteSchema>['options'][number];

export async function substitute(recipe: Recipe, ingredient: Ingredient, wish: string) {
  return callClaude(SubstituteSchema, `${BASE} Schlage Ersatz für eine Zutat vor, passend zu genau diesem Rezept und der Menge.`, [
    {
      type: 'text',
      text: `${recipeAsText(recipe)}\n\nZu ersetzen: ${ingredientToLine(ingredient)}${wish.trim() ? `\nWunsch: ${wish.trim()}` : ''}`,
    },
  ]);
}

/** Ersatz ins Rezept übernehmen (Zutat ersetzen + Hinweis in den Notizen) */
export function applySubstitute(recipe: Recipe, ingredient: Ingredient, o: SubstituteOption): Partial<Recipe> {
  const r = o.replacement;
  const repl: Ingredient = {
    ...ingredient,
    quantity: r.quantity,
    quantityMax: r.quantity_max,
    unit: r.unit ? (lookupUnit(r.unit)?.key ?? r.unit) : '',
    name: r.name,
    note: r.note ?? undefined,
  };
  const hint = `Statt ${ingredientToLine(ingredient)}: ${ingredientToLine(repl)}. ${o.explanation}${o.step_hint ? ` ${o.step_hint}` : ''}`;
  return {
    ingredients: recipe.ingredients.map((i) => (i.id === ingredient.id ? repl : i)),
    notes: [recipe.notes, hint].filter(Boolean).join('\n\n'),
  };
}

// ---------- Rezept anpassen ----------
export const ADAPT_PRESETS = ['vegetarisch', 'vegan', 'glutenfrei', 'laktosefrei', 'kindgerecht (mild, ohne Alkohol)', 'schneller', 'kalorienärmer'];

const AdaptSchema = z.object({
  recipe: RecipeSchema.describe('das vollständige angepasste Rezept; title mit Zusatz in Klammern, z. B. „Linsencurry (vegan)“'),
  changes: z.array(z.string()).describe('die wichtigsten Änderungen in kurzen Stichpunkten'),
});

export async function adaptRecipe(recipe: Recipe, goal: string, categories: Category[]): Promise<{ draft: RecipeDraft; changes: string[] }> {
  const tags = await tagContext();
  const out = await callClaude(
    AdaptSchema,
    `${BASE} Passe das Rezept an den Wunsch an. Behalte Charakter, Portionen und Aufbau, ändere nur, was nötig ist. Setze is_recipe auf true und category auf die bisherige Kategorie, falls passend. Kategorien: ${categories.map((c) => c.name).join(', ')}.`,
    [{ type: 'text', text: `${recipeAsText(recipe)}\n\nAnpassung: ${goal}\n${tags.text}` }],
  );
  const draft = toDraft(out.recipe, categories, tags.allowed);
  if (!draft.title) draft.title = `${recipe.title} (${goal})`;
  if (!draft.categoryIds.length) draft.categoryIds = recipe.categoryIds;
  // Claudes Vorschläge (z. B. „vegan“ statt „Fleisch“) + eigene Tags des Originals, die nicht zur festen Liste gehören
  const general = new Set(GENERAL_TAGS.map((t) => t.toLowerCase()));
  draft.tags = [...new Set([...(draft.tags ?? []), ...(recipe.tags ?? []).filter((t) => !general.has(t.toLowerCase()))])];
  draft.notes = [draft.notes, `Angepasst aus „${recipe.title}“: ${goal}.`].filter(Boolean).join('\n\n');
  return { draft, changes: out.changes };
}

// ---------- Tags für bestehende Rezepte vorschlagen ----------
const TagBatchSchema = z.object({
  results: z.array(z.object({ recipe_id: z.string(), tags: z.array(z.string()).describe('3 bis 5 Tags aus der Liste') })),
});

/** Schlägt für jedes Rezept Tags vor (nur neue, die es noch nicht hat). Arbeitet in Paketen à 40 Rezepte. */
export async function suggestTagsForRecipes(recipes: Recipe[], onProgress?: (done: number) => void): Promise<Map<string, string[]>> {
  const ctx = await tagContext();
  const result = new Map<string, string[]>();
  for (let i = 0; i < recipes.length; i += 40) {
    const chunk = recipes.slice(i, i + 40);
    const list = chunk
      .map((r) => `[${r.id}] ${r.title}${r.timeMinutes ? ` (${r.timeMinutes} Min.)` : ''}: ${r.ingredients.map((x) => x.name).join(', ')}${r.tags?.length ? ` – hat schon: ${r.tags.join(', ')}` : ''}`)
      .join('\n');
    const out = await callClaude(TagBatchSchema, `${BASE} Vergib für jedes Rezept 3 bis 5 passende Tags.`, [{ type: 'text', text: `${ctx.text}\n\nRezepte:\n${list}` }]);
    for (const r of out.results) {
      const recipe = chunk.find((x) => x.id === r.recipe_id);
      if (!recipe) continue;
      const fresh = cleanSuggestedTags(r.tags, ctx.allowed).filter((t) => !(recipe.tags ?? []).some((h) => h.toLowerCase() === t.toLowerCase()));
      if (fresh.length) result.set(recipe.id, fresh);
    }
    onProgress?.(Math.min(recipes.length, i + 40));
  }
  return result;
}
