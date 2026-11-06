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
const TodaySchema = z.object({
  suggestions: z
    .array(
      z.object({
        recipe_id: z.string().describe('ID eines Rezepts aus der Liste'),
        reason: z.string().describe('ein Satz, warum es passt'),
        missing: z.array(z.string()).describe('Zutaten, die fehlen und besorgt werden müssten (kurz, z. B. „200 ml Sahne“)'),
        tip: z.string().nullable().describe('optionaler Tipp, z. B. wie man eine fehlende Zutat ersetzt'),
      }),
    )
    .describe('bis zu 5 Rezepte, bestes zuerst; nur Rezepte aus der Liste'),
  note: z.string().nullable().describe('kurzer Hinweis, falls nichts gut passt'),
});
export type TodaySuggestion = z.infer<typeof TodaySchema>['suggestions'][number] & { recipe: Recipe };

export async function whatToCook(available: string, wishes: string[], recipes: Recipe[]): Promise<{ suggestions: TodaySuggestion[]; note: string | null }> {
  const list = recipes
    .map((r) => `[${r.id}] ${r.title}${r.timeMinutes ? ` (${r.timeMinutes} Min.)` : ''}: ${r.ingredients.map((i) => i.name).join(', ')}`)
    .join('\n');
  const out = await callClaude(
    TodaySchema,
    `${BASE} Wähle aus dem Kochbuch der Familie passende Rezepte. Bevorzuge Rezepte, für die fast alles da ist. Grundzutaten wie Salz, Pfeffer, Öl, Mehl, Zucker gelten als vorhanden.`,
    [
      {
        type: 'text',
        text: `Das ist da: ${available.trim() || '(keine Angabe – schlage einfach passende Rezepte vor)'}\n${wishes.length ? `Wünsche: ${wishes.join(', ')}\n` : ''}\nKochbuch:\n${list}`,
      },
    ],
  );
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const suggestions = out.suggestions.flatMap((s) => (byId.has(s.recipe_id) ? [{ ...s, recipe: byId.get(s.recipe_id)! }] : []));
  return { suggestions, note: out.note };
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
  draft.notes = [draft.notes, `Angepasst aus „${recipe.title}“: ${goal}.`].filter(Boolean).join('\n\n');
  return { draft, changes: out.changes };
}
