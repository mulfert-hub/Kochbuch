// Welche Zutaten werden in einem Zubereitungsschritt erwähnt? (für den Kochmodus)
import type { Ingredient } from '../types';
import { fold } from './search';

const PART_SUFFIXES = ['schote', 'schoten', 'zehe', 'zehen', 'stange', 'stangen', 'knolle', 'knollen', 'blatt', 'blatter', 'zweig', 'zweige', 'wurfel', 'scheibe', 'scheiben', 'filet', 'filets', 'stuck', 'stucke'];

/** Zutaten, die in einem Schritt erwähnt werden („Zwiebel und Knoblauch schälen“) */
export function ingredientsInStep(step: string, ingredients: Ingredient[]): Ingredient[] {
  const all = fold(step).split(/[^a-z0-9ß]+/);
  const words = all.filter((w) => w.length >= 3);
  const short = all.filter((w) => w.length === 2); // „Öl“, „Ei“
  return ingredients.filter((i) => {
    const nameWords = fold(i.name.replace(/\(.*?\)/g, '')).split(/[^a-z0-9ß]+/).filter((w) => w.length >= 4);
    return nameWords.some((nw) => {
      const stem = nw.slice(0, Math.max(4, nw.length - 2)); // „zwiebeln“ ≈ „zwiebel“
      // „Paprika“ ≈ „Paprikaschote“, „Knoblauch“ ≈ „Knoblauchzehen“ – aber nicht „Kürbis“ ≈ „Kürbiskerne“
      const partOf = (w: string) => w.length >= 5 && nw.startsWith(w) && PART_SUFFIXES.includes(nw.slice(w.length));
      return words.some((w) => (w.startsWith(stem) && w.length <= nw.length + 3) || (w.length >= 5 && nw.endsWith(w)) || partOf(w)) || short.some((w) => nw.endsWith(w) && w !== 'en' && w !== 'er');
    });
  });
}
