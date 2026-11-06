// Claude als Küchenhilfe: „Was koche ich heute?“, „Zutat ersetzen“, „Rezept anpassen“.
import * as z from 'zod/v4';
import type { Category, Ingredient, Recipe, RecipeDraft } from '../types';
import { callClaude, IngredientSchema, RecipeSchema, toDraft } from './claudeRecipe';
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
// Immer genau 3 Vorschläge: zuerst passende Rezepte aus dem Buch, fehlende Plätze mit neuen Ideen aufgefüllt.
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
    .describe('0 bis 3 Rezepte aus dem Kochbuch, die wirklich gut passen; bestes zuerst'),
  new_ideas: z
    .array(
      z.object({
        title: z.string().describe('Name des Gerichts'),
        description: z.string().describe('ein Satz, was es ist und warum es passt'),
        missing: z.array(z.string()).describe('Zutaten, die fehlen würden'),
        time_minutes: z.number().nullable(),
      }),
    )
    .describe('neue Rezeptideen außerhalb des Kochbuchs, so viele, dass es zusammen mit from_book genau 3 Vorschläge sind'),
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
    `${BASE} Mache genau 3 Vorschläge. Nimm zuerst Rezepte aus dem Kochbuch der Familie, die wirklich gut zu den vorhandenen Zutaten und Wünschen passen (Tags mit # zählen als Merkmale, z. B. #Thea = für Thea geeignet). Passen weniger als 3 gut, ergänze neue, alltagstaugliche Rezeptideen, die die Wünsche erfüllen und möglichst die vorhandenen Zutaten nutzen. Grundzutaten wie Salz, Pfeffer, Öl, Mehl, Zucker gelten als vorhanden.`,
    [
      {
        type: 'text',
        text: `Das ist da: ${available.trim() || '(keine Angabe)'}\n${wishes.length ? `Wünsche: ${wishes.join(', ')}\n` : ''}\nKochbuch:\n${list || '(noch leer)'}`,
      },
    ],
  );
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const fromBook = out.from_book.flatMap((s) => (byId.has(s.recipe_id) ? [{ ...s, recipe: byId.get(s.recipe_id)! }] : [])).slice(0, 3);
  return { fromBook, ideas: out.new_ideas.slice(0, Math.max(0, 3 - fromBook.length)) };
}

/** Eine Idee zum vollständigen Rezept ausarbeiten lassen */
export async function ideaToRecipe(idea: RecipeIdea, available: string, wishes: string[], categories: Category[]): Promise<RecipeDraft> {
  const out = await callClaude(
    RecipeSchema,
    `${BASE} Schreibe ein vollständiges, alltagstaugliches Rezept mit genauen Mengen, Portionen (Standard 4, falls nicht anders gewünscht), Zeit und klaren Schritten. Setze is_recipe auf true. Kategorien zur Auswahl: ${categories.map((c) => c.name).join(', ')}.`,
    [
      {
        type: 'text',
        text: `Gericht: ${idea.title}\n${idea.description}\nVorhanden: ${available.trim() || '(keine Angabe)'}\n${wishes.length ? `Wünsche: ${wishes.join(', ')}` : ''}`,
      },
    ],
  );
  const draft = toDraft(out, categories);
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
  const out = await callClaude(
    AdaptSchema,
    `${BASE} Passe das Rezept an den Wunsch an. Behalte Charakter, Portionen und Aufbau, ändere nur, was nötig ist. Setze is_recipe auf true und category auf die bisherige Kategorie, falls passend. Kategorien: ${categories.map((c) => c.name).join(', ')}.`,
    [{ type: 'text', text: `${recipeAsText(recipe)}\n\nAnpassung: ${goal}` }],
  );
  const draft = toDraft(out.recipe, categories);
  if (!draft.title) draft.title = `${recipe.title} (${goal})`;
  if (!draft.categoryIds.length) draft.categoryIds = recipe.categoryIds;
  draft.tags = recipe.tags ?? [];
  draft.notes = [draft.notes, `Angepasst aus „${recipe.title}“: ${goal}.`].filter(Boolean).join('\n\n');
  return { draft, changes: out.changes };
}
