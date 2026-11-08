// Buchansicht: eine Rezeptseite pro Ansicht. Wischen, Pfeiltasten oder Pfeil-Buttons blättern.
// Animation: Beim Vorblättern hebt sich die aktuelle Seite nach links weg (leicht gedreht wie Papier),
// beim Zurückblättern legt sich die vorherige Seite von links wieder darüber.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { bookOrder, useCategories, useRecipes } from '../hooks';
import { navigate } from '../router';
import { RecipeArticle } from '../components/RecipeArticle';
import { Icon } from '../components/Icon';
import { MoreLink } from '../components/MoreLink';
import type { Category, Recipe } from '../types';

const DURATION = 340;

function Cover({ recipes, categories, onOpen }: { recipes: Recipe[]; categories: Category[]; onOpen: (i: number) => void }) {
  // Inhaltsverzeichnis auf der Titelseite: Seitenzahl = Index + 1 (Titelseite ist 0)
  const groups = useMemo(() => {
    const out: { name: string; items: { r: Recipe; page: number }[] }[] = [];
    recipes.forEach((r, i) => {
      const cat = categories.find((c) => r.categoryIds.includes(c.id))?.name ?? 'Ohne Kategorie';
      const last = out[out.length - 1];
      if (last?.name === cat) last.items.push({ r, page: i + 1 });
      else out.push({ name: cat, items: [{ r, page: i + 1 }] });
    });
    return out;
  }, [recipes, categories]);

  return (
    <div className="cover">
      <MoreLink className="cover-gear" />
      <div className="cover-top">
        <div className="eyebrow">Band I · {recipes.length} Rezepte</div>
        <h1 className="cover-title">
          Mein
          <br />
          Kochbuch
        </h1>
        <button className="today-link" onClick={() => navigate('/heute')}>
          <Icon name="sparkle" /> Was koche ich heute?
        </button>
        <p className="cover-sub">Wische zum Blättern – oder nutze die Pfeiltasten.</p>
      </div>
      <nav className="cover-toc" aria-label="Inhalt">
        {groups.map((g) => (
          <div key={g.name} className="cover-toc-group">
            <h2>{g.name}</h2>
            <ul>
              {g.items.map(({ r, page }) => (
                <li key={r.id}>
                  <button onClick={() => onOpen(page)}>
                    <span className="toc-title">{r.title}</span>
                    <span className="toc-dots" aria-hidden="true" />
                    <span className="toc-page">{page}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <button className="cover-edit-cats" onClick={() => navigate('/inhalt?bearbeiten')}>
        <Icon name="edit" /> Kategorien bearbeiten
      </button>
    </div>
  );
}

function BookPage({ recipe, categories, page, total }: { recipe: Recipe; categories: Category[]; page: number; total: number }) {
  const [servings, setServings] = useState(recipe.servings ?? 1);
  useEffect(() => setServings(recipe.servings ?? 1), [recipe.id, recipe.servings]);
  return (
    <RecipeArticle
      recipe={recipe}
      categories={categories}
      servings={servings}
      onServings={setServings}
      pageLabel={
        <>
          <span>— {page} —</span>
          <span className="page-of">von {total}</span>
        </>
      }
      actions={
        <button className="btn btn-ghost" onClick={() => navigate(`/rezepte/${recipe.id}`)}>
          <Icon name="list" /> Details &amp; Einkaufsliste
        </button>
      }
    />
  );
}

export function BookView({ recipeId }: { recipeId?: string }) {
  const recipes = useRecipes();
  const categories = useCategories();
  const ordered = useMemo(() => (recipes && categories ? bookOrder(recipes, categories) : []), [recipes, categories]);
  const total = ordered.length;

  // Seite 0 = Titelseite, 1..n = Rezepte
  const indexFromId = recipeId ? ordered.findIndex((r) => r.id === recipeId) + 1 : 0;
  const [index, setIndex] = useState(indexFromId);
  useEffect(() => setIndex(indexFromId), [indexFromId]);

  const [offset, setOffset] = useState(0); // px; <0 = Vorblättern, >0 = Zurückblättern
  const [animating, setAnimating] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; t: number; mode: 'none' | 'h' | 'v'; id: number } | null>(null);

  const width = () => stage.current?.clientWidth ?? window.innerWidth;

  const commitTo = useCallback(
    (newIndex: number) => {
      const url = newIndex === 0 ? '/buch' : `/buch/${ordered[newIndex - 1]?.id}`;
      navigate(url, { replace: true });
      setIndex(newIndex);
    },
    [ordered],
  );

  const turn = useCallback(
    (dir: 1 | -1) => {
      if (animating) return;
      const target = index + dir;
      if (target < 0 || target > total) return;
      const w = width();
      setAnimating(true);
      if (dir === 1) {
        setOffset(-w * 1.08);
      } else {
        // Vorherige Seite startet links außerhalb und legt sich darüber
        setOffset(1);
        requestAnimationFrame(() => requestAnimationFrame(() => setOffset(w)));
      }
      window.setTimeout(() => {
        commitTo(target);
        setAnimating(false);
        setOffset(0);
        stage.current?.querySelector('.book-page.is-top')?.scrollTo({ top: 0 });
      }, DURATION + 20);
    },
    [animating, index, total, commitTo],
  );

  // Pfeiltasten
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'ArrowRight') turn(1);
      else if (e.key === 'ArrowLeft') turn(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [turn]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (animating || e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), mode: 'none', id: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.mode === 'none') {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        d.mode = 'h';
        try {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        } catch {
          /* Pointer bereits beendet */
        }
      } else if (Math.abs(dy) > 10) d.mode = 'v';
    }
    if (d.mode !== 'h') return;
    // Am Anfang/Ende „Gummiband“-Widerstand
    let o = dx;
    if ((dx > 0 && index === 0) || (dx < 0 && index === total)) o = dx * 0.25;
    setOffset(o);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.mode !== 'h') return;
    const dx = e.clientX - d.x;
    const v = dx / Math.max(1, performance.now() - d.t); // px/ms
    const w = width();
    const dir = dx < 0 ? 1 : -1;
    const canTurn = (dir === 1 && index < total) || (dir === -1 && index > 0);
    if (canTurn && (Math.abs(dx) > w * 0.22 || Math.abs(v) > 0.55)) {
      setAnimating(true);
      setOffset(dir === 1 ? -w * 1.08 : w);
      window.setTimeout(() => {
        commitTo(index + dir);
        setAnimating(false);
        setOffset(0);
      }, DURATION + 20);
    } else {
      setAnimating(true);
      setOffset(0);
      window.setTimeout(() => setAnimating(false), DURATION);
    }
  };

  if (!recipes || !categories) return <div className="book-stage" />;

  const renderPage = (i: number) => {
    if (i === 0) return <Cover recipes={ordered} categories={categories} onOpen={(p) => commitTo(p)} />;
    const r = ordered[i - 1];
    return r ? <BookPage key={r.id} recipe={r} categories={categories} page={i} total={total} /> : null;
  };

  const w = typeof window !== 'undefined' ? width() : 400;
  const forward = offset < 0;
  const backward = offset > 0 && index > 0;
  const progress = Math.min(1, Math.abs(offset) / w);

  // Ebenen: unten (bleibt liegen) und oben (bewegt sich)
  let bottomIndex: number | null = null;
  let topIndex = index;
  let topTransform = 'none';
  let shade = 0;
  if (forward && index < total) {
    bottomIndex = index + 1;
    topIndex = index;
    topTransform = `translateX(${offset}px) rotateY(${progress * 14}deg)`;
    shade = progress;
  } else if (backward) {
    bottomIndex = index;
    topIndex = index - 1;
    topTransform = `translateX(${-w * 1.08 + offset * 1.08}px) rotateY(${(1 - progress) * 14}deg)`;
    shade = 1 - progress;
  } else if (offset !== 0) {
    topTransform = `translateX(${offset}px)`;
  }

  return (
    <div className="book">
      <div
        className={`book-stage${animating ? ' is-animating' : ''}`}
        ref={stage}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {bottomIndex != null && (
          <div className="book-page is-bottom" style={{ '--shade': 1 - shade } as React.CSSProperties} key={`p${bottomIndex}`}>
            {renderPage(bottomIndex)}
          </div>
        )}
        <div className="book-page is-top" style={{ transform: topTransform, '--lift': shade } as React.CSSProperties} key={`p${topIndex}`}>
          {renderPage(topIndex)}
        </div>
      </div>

      <div className="book-controls">
        <button className="icon-btn" onClick={() => turn(-1)} disabled={index === 0} aria-label="Vorherige Seite">
          <Icon name="back" />
        </button>
        <div className="book-dots" aria-hidden="true">
          <i style={{ width: `${total ? (index / total) * 100 : 0}%` }} />
        </div>
        <button className="icon-btn" onClick={() => turn(1)} disabled={index === total} aria-label="Nächste Seite">
          <Icon name="next" />
        </button>
      </div>
      {total === 0 && (
        <div className="empty">
          <h2>Noch leer</h2>
          <p>Importiere deinen ersten Screenshot.</p>
          <button className="btn btn-primary" onClick={() => navigate('/import')}>
            <Icon name="plus" /> Rezept importieren
          </button>
        </div>
      )}
    </div>
  );
}
