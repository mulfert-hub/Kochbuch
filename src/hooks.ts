import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/db';
import type { Category, Recipe } from './types';

export function useCategories(): Category[] | undefined {
  return useLiveQuery(() => db.categories.orderBy('order').toArray(), []);
}

export function useRecipes(): Recipe[] | undefined {
  return useLiveQuery(() => db.recipes.toArray(), []);
}

/** Reihenfolge im Buch: nach Kategorie (wie im Inhaltsverzeichnis), dann alphabetisch. */
export function bookOrder(recipes: Recipe[], categories: Category[]): Recipe[] {
  const rank = new Map(categories.map((c) => [c.id, c.order]));
  const r = (x: Recipe) => {
    const ranks = x.categoryIds.map((id) => rank.get(id)).filter((n): n is number => n != null);
    return ranks.length ? Math.min(...ranks) : Number.MAX_SAFE_INTEGER;
  };
  return [...recipes].sort((a, b) => r(a) - r(b) || a.title.localeCompare(b.title, 'de'));
}

export function useMediaQuery(q: string): boolean {
  const mq = useMemo(() => window.matchMedia(q), [q]);
  const subscribe = useCallback(
    (cb: () => void) => {
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    [mq],
  );
  return useSyncExternalStore(subscribe, () => mq.matches);
}
