// Liste aller Rezepte + Detailansicht. Handy: Liste → Detail. Großer Bildschirm: nebeneinander.
import { useEffect, useMemo, useState } from 'react';
import { useCategories, useMediaQuery, useRecipes } from '../hooks';
import { navigate } from '../router';
import { searchRecipes, snippet } from '../lib/search';
import { Icon } from '../components/Icon';
import { MoreLink } from '../components/MoreLink';
import { RecipeArticle } from '../components/RecipeArticle';
import { confirmDialog, StoredImage, toast } from '../components/ui';
import { addToShopping, deleteRecipe } from '../db/repo';
import type { Category, Recipe } from '../types';

function RecipeDetail({ recipe, categories, onBack }: { recipe: Recipe; categories: Category[]; onBack?: () => void }) {
  const [servings, setServings] = useState(recipe.servings ?? 1);
  useEffect(() => setServings(recipe.servings ?? 1), [recipe.id, recipe.servings]);

  const remove = async () => {
    const ok = await confirmDialog({
      title: 'Rezept löschen?',
      text: `„${recipe.title}“ wird inklusive Bilder dauerhaft gelöscht.`,
      confirm: 'Löschen',
      danger: true,
    });
    if (!ok) return;
    await deleteRecipe(recipe.id);
    toast('Rezept gelöscht');
    navigate('/rezepte', { replace: true });
  };

  return (
    <div className="detail">
      <div className="detail-bar">
        {onBack ? (
          <button className="icon-btn" onClick={onBack} aria-label="Zurück zur Liste">
            <Icon name="back" />
          </button>
        ) : (
          <span />
        )}
        <div className="detail-bar-actions">
          <button className="icon-btn" onClick={() => navigate(`/buch/${recipe.id}`)} aria-label="Im Buch öffnen" title="Im Buch öffnen">
            <Icon name="book" />
          </button>
          <button className="icon-btn" onClick={() => navigate(`/rezepte/${recipe.id}/bearbeiten`)} aria-label="Bearbeiten" title="Bearbeiten">
            <Icon name="edit" />
          </button>
          <button className="icon-btn" onClick={remove} aria-label="Löschen" title="Löschen">
            <Icon name="trash" />
          </button>
        </div>
      </div>
      <RecipeArticle
        recipe={recipe}
        categories={categories}
        servings={servings}
        onServings={setServings}
        actions={
          <button
            className="btn btn-primary"
            onClick={async () => {
              const n = await addToShopping(recipe, servings);
              toast(`${n} Zutaten auf die Einkaufsliste gesetzt`);
            }}
          >
            <Icon name="cart" /> Auf die Einkaufsliste
          </button>
        }
      />
    </div>
  );
}

export function LibraryView({ recipeId }: { recipeId?: string }) {
  const recipes = useRecipes();
  const categories = useCategories();
  const wide = useMediaQuery('(min-width: 1100px)');
  const [query, setQuery] = useState(() => sessionStorage.getItem('kb-q') ?? '');
  const [cat, setCat] = useState<string | null>(() => sessionStorage.getItem('kb-cat'));
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    sessionStorage.setItem('kb-q', query);
    if (cat) sessionStorage.setItem('kb-cat', cat);
    else sessionStorage.removeItem('kb-cat');
  }, [query, cat]);

  const results = useMemo(() => (recipes ? searchRecipes(recipes, query, cat) : []), [recipes, query, cat]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of recipes ?? []) for (const c of r.categoryIds) m.set(c, (m.get(c) ?? 0) + 1);
    return m;
  }, [recipes]);

  const current = recipeId ? recipes?.find((r) => r.id === recipeId) : wide ? results[0] : undefined;

  if (!recipes || !categories) return null;

  const addSelected = async () => {
    let n = 0;
    for (const r of recipes.filter((r) => selected.has(r.id))) n += await addToShopping(r, r.servings);
    toast(`${selected.size} Rezepte (${n} Zutaten) hinzugefügt`);
    setSelected(new Set());
    setSelecting(false);
  };

  const list = (
    <div className="library-list">
      <div className="page-head">
        <div>
          <div className="eyebrow">{recipes.length} Rezepte</div>
          <h1 className="page-title">Rezepte</h1>
        </div>
        <div className="head-actions">
          <button
            className={`btn ${selecting ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => {
              setSelecting(!selecting);
              setSelected(new Set());
            }}
          >
            {selecting ? 'Fertig' : 'Auswählen'}
          </button>
          <MoreLink />
        </div>
      </div>
      <label className="search">
        <Icon name="search" />
        <input
          className="input"
          type="search"
          placeholder="Suche nach Titel, Zutat, Schritt …"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          enterKeyHint="search"
          aria-label="Rezepte durchsuchen"
        />
      </label>
      <div className="chips" role="toolbar" aria-label="Nach Kategorie filtern">
        <button className="chip" aria-pressed={!cat} onClick={() => setCat(null)}>
          Alle
        </button>
        {categories.map((c) => (
          <button key={c.id} className="chip" aria-pressed={cat === c.id} onClick={() => setCat(cat === c.id ? null : c.id)}>
            {c.name} <span className="chip-count">{counts.get(c.id) ?? 0}</span>
          </button>
        ))}
      </div>

      {results.length === 0 ? (
        <div className="empty">
          <h2>{recipes.length ? 'Nichts gefunden' : 'Noch keine Rezepte'}</h2>
          <p>{recipes.length ? 'Versuch es mit einem anderen Suchbegriff.' : 'Importiere Screenshots oder lege ein Rezept an.'}</p>
          {!recipes.length && (
            <button className="btn btn-primary" onClick={() => navigate('/import')}>
              <Icon name="plus" /> Importieren
            </button>
          )}
        </div>
      ) : (
        <ul className="recipe-list">
          {results.map((r) => {
            const sn = snippet(r, query);
            const cats = categories.filter((c) => r.categoryIds.includes(c.id)).map((c) => c.name);
            const isSel = selected.has(r.id);
            return (
              <li key={r.id}>
                <button
                  className={`recipe-row${current?.id === r.id && !selecting ? ' is-active' : ''}${isSel ? ' is-selected' : ''}`}
                  onClick={() => {
                    if (selecting) {
                      const n = new Set(selected);
                      if (isSel) n.delete(r.id);
                      else n.add(r.id);
                      setSelected(n);
                    } else navigate(`/rezepte/${r.id}`);
                  }}
                  aria-pressed={selecting ? isSel : undefined}
                >
                  {selecting && (
                    <span className={`checkbox${isSel ? ' is-checked' : ''}`} aria-hidden="true">
                      {isSel && <Icon name="check" />}
                    </span>
                  )}
                  <span className="recipe-row-text">
                    <span className="recipe-row-title">{r.title}</span>
                    <span className="recipe-row-meta">
                      {sn ?? [cats.join(', ') || 'Ohne Kategorie', `${r.ingredients.length} Zutaten`].join(' · ')}
                    </span>
                  </span>
                  {r.imageIds[0] ? <StoredImage id={r.imageIds[0]} alt="" className="recipe-row-img" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {selecting && selected.size > 0 && (
        <div className="selection-bar">
          <button className="btn btn-primary btn-block" onClick={addSelected}>
            <Icon name="cart" /> {selected.size} {selected.size === 1 ? 'Rezept' : 'Rezepte'} zur Einkaufsliste
          </button>
        </div>
      )}
    </div>
  );

  if (!wide) {
    if (recipeId) {
      if (!current) return <div className="page"><div className="empty"><h2>Rezept nicht gefunden</h2></div></div>;
      return (
        <div className="page">
          <RecipeDetail recipe={current} categories={categories} onBack={() => navigate('/rezepte')} />
        </div>
      );
    }
    return <div className="page">{list}</div>;
  }

  return (
    <div className="split">
      <div className="split-list">{list}</div>
      <div className="split-detail">
        {current ? <RecipeDetail key={current.id} recipe={current} categories={categories} /> : <div className="empty"><h2>Wähle ein Rezept</h2></div>}
      </div>
    </div>
  );
}
