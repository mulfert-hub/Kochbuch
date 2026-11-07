// Auswahl-Fenster für den Wochenplan: Rezept für einen Tag wählen, oder Tag für ein Rezept wählen.
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { addToPlan } from '../db/repo';
import { useCategories, useRecipes } from '../hooks';
import { searchRecipes } from '../lib/search';
import { addDays, dayKey, dayName, shortDate } from '../lib/week';
import type { Recipe } from '../types';
import { Sheet } from './AssistSheets';
import { Icon } from './Icon';
import { toast } from './ui';

/** Im Wochenplan auf einen Tag getippt: Rezepte zur Auswahl */
export function PickRecipeSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const recipes = useRecipes();
  const categories = useCategories();
  const planned = useLiveQuery(() => db.plan.where('date').equals(date).toArray(), [date]);
  const [query, setQuery] = useState('');
  const list = useMemo(() => {
    const found = searchRecipes(recipes ?? [], query);
    return query.trim() ? found : [...found].sort((a, b) => a.title.localeCompare(b.title, 'de'));
  }, [recipes, query]);
  const catName = (r: Recipe) => r.categoryIds.map((id) => categories?.find((c) => c.id === id)?.name).filter(Boolean).join(' · ');
  const isPlanned = (r: Recipe) => planned?.some((e) => e.recipeId === r.id);

  return (
    <Sheet title={`${dayName(date)}, ${shortDate(date)}`} onClose={onClose}>
      <label className="search plan-search">
        <Icon name="search" />
        <input
          className="input"
          type="search"
          placeholder="Rezept suchen …"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Rezept suchen"
        />
      </label>
      {recipes && recipes.length === 0 && <p className="muted">Noch keine Rezepte im Kochbuch.</p>}
      <ul className="plan-pick">
        {list.map((r) => (
          <li key={r.id}>
            <button
              className={`plan-pick-item${isPlanned(r) ? ' is-planned' : ''}`}
              disabled={isPlanned(r)}
              onClick={async () => {
                await addToPlan(r, date);
                toast(`${r.title || 'Rezept'} für ${dayName(date)} eingeplant`);
                onClose();
              }}
            >
              <span className="plan-pick-text">
                <strong>{r.title || 'Ohne Titel'}</strong>
                {catName(r) && <span>{catName(r)}</span>}
              </span>
              {isPlanned(r) ? <Icon name="check" /> : <Icon name="plus" />}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/** Auf der Rezeptseite „Zum Wochenplan“: Tag wählen (heute + 13 Tage) */
export function PickDaySheet({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => dayKey(addDays(new Date(), i))), []);
  const entries = useLiveQuery(() => db.plan.where('date').between(days[0], days[13], true, true).toArray(), [days]);
  return (
    <Sheet title="Wann gibt es das?" onClose={onClose}>
      <p className="muted plan-for">{recipe.title}</p>
      <ul className="plan-days">
        {days.map((d) => {
          const day = (entries ?? []).filter((e) => e.date === d);
          const already = day.some((e) => e.recipeId === recipe.id);
          return (
            <li key={d}>
              <button
                className={`plan-day-pick${already ? ' is-planned' : ''}`}
                disabled={already}
                onClick={async () => {
                  await addToPlan(recipe, d);
                  toast(`Für ${dayName(d)} eingeplant`);
                  onClose();
                }}
              >
                <span className="plan-day-name">
                  <strong>{dayName(d)}</strong>
                  <span>{shortDate(d)}</span>
                </span>
                <span className="plan-day-meals">{day.length ? day.map((e) => e.title).join(', ') : 'noch frei'}</span>
                {already ? <Icon name="check" /> : <Icon name="plus" />}
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
