// Einfache, schnelle Volltextsuche über Titel, Zutaten und Schritte (läuft komplett lokal).
import type { Recipe } from '../types';

/** Kleinschreibung, Umlaute vereinheitlichen, damit „kase“ auch „Käse“ findet. */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export function searchRecipes(recipes: Recipe[], query: string, categoryId?: string | null): Recipe[] {
  let list = categoryId ? recipes.filter((r) => r.categoryIds.includes(categoryId)) : recipes;
  const tokens = fold(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [...list].sort((a, b) => a.title.localeCompare(b.title, 'de'));

  const scored: { r: Recipe; score: number }[] = [];
  for (const r of list) {
    const title = fold(r.title);
    const ings = fold(r.ingredients.map((i) => `${i.name} ${i.note ?? ''}`).join(' '));
    const steps = fold(r.steps.join(' ') + ' ' + (r.notes ?? ''));
    let score = 0;
    let all = true;
    for (const t of tokens) {
      const s = (title.includes(t) ? 10 : 0) + (ings.includes(t) ? 4 : 0) + (steps.includes(t) ? 1 : 0);
      if (!s) {
        all = false;
        break;
      }
      score += s + (title.startsWith(t) ? 5 : 0);
    }
    if (all) scored.push({ r, score });
  }
  list = scored.sort((a, b) => b.score - a.score || a.r.title.localeCompare(b.r.title, 'de')).map((x) => x.r);
  return list;
}

/** Fundstelle für die Vorschau in der Trefferliste („… mit Zimt und …“). */
export function snippet(r: Recipe, query: string): string | null {
  const tokens = fold(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  if (tokens.every((t) => fold(r.title).includes(t))) return null;
  for (const i of r.ingredients) {
    if (tokens.some((t) => fold(i.name).includes(t))) return `Zutat: ${i.name}`;
  }
  for (const s of r.steps) {
    const f = fold(s);
    const t = tokens.find((t) => f.includes(t));
    if (t) {
      const pos = f.indexOf(t);
      const start = Math.max(0, pos - 30);
      return (start > 0 ? '…' : '') + s.slice(start, pos + 60).trim() + '…';
    }
  }
  return null;
}
