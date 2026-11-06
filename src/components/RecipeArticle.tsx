// Lesefreundliche Rezeptdarstellung (Buchseite & Detailansicht).
import { useMemo, useState, type ReactNode } from 'react';
import type { Category, Ingredient, Recipe } from '../types';
import { formatAmount } from '../lib/quantity';
import { inflectName } from '../lib/units';
import { Icon } from './Icon';
import { StoredImage } from './ui';
import { Lightbox } from './Lightbox';

export function ServingsStepper({
  value,
  base,
  label,
  onChange,
}: {
  value: number;
  base: number | null;
  label?: string;
  onChange: (n: number) => void;
}) {
  const unit = base == null ? (value === 1 ? 'Rezept' : '× Rezept') : (label ?? 'Portionen');
  return (
    <div className="stepper" role="group" aria-label="Portionen anpassen">
      <button type="button" className="stepper-btn" onClick={() => onChange(Math.max(0.5, value - (value <= 1 ? 0.5 : 1)))} aria-label="Weniger">
        <Icon name="minus" />
      </button>
      <output className="stepper-value" aria-live="polite">
        <strong>{String(value).replace('.', ',')}</strong> <span>{value === 1 && unit === 'Portionen' ? 'Portion' : unit}</span>
      </output>
      <button type="button" className="stepper-btn" onClick={() => onChange(value + (value < 1 ? 0.5 : 1))} aria-label="Mehr">
        <Icon name="plus" />
      </button>
    </div>
  );
}

function groupIngredients(list: Ingredient[]) {
  const groups: { name?: string; items: Ingredient[] }[] = [];
  for (const i of list) {
    const last = groups[groups.length - 1];
    if (!last || last.name !== i.group) groups.push({ name: i.group, items: [i] });
    else last.items.push(i);
  }
  return groups;
}

export function IngredientList({ ingredients, factor }: { ingredients: Ingredient[]; factor: number }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const groups = useMemo(() => groupIngredients(ingredients), [ingredients]);
  const toggle = (id: string) =>
    setDone((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <div className="ingredients">
      {groups.map((g, gi) => (
        <div key={gi} className="ing-group">
          {g.name && <h3 className="ing-group-title">{g.name}</h3>}
          <ul>
            {g.items.map((i) => {
              const q = i.quantity == null ? null : i.quantity * factor;
              return (
                <li key={i.id} className={done.has(i.id) ? 'is-done' : ''} onClick={() => toggle(i.id)}>
                  <span className="ing-amount">{formatAmount(i.quantity, i.quantityMax, i.unit, factor)}</span>
                  <span className="ing-name">
                    {inflectName(i.name, i.unit, q)}
                    {i.note && <span className="ing-note">, {i.note}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function StepList({ steps }: { steps: string[] }) {
  const [done, setDone] = useState<number | null>(null);
  return (
    <ol className="steps">
      {steps.map((s, i) => (
        <li key={i} className={done != null && i <= done ? 'is-done' : ''} onClick={() => setDone(done === i ? i - 1 : i)}>
          <span className="step-no" aria-hidden="true">
            {i + 1}
          </span>
          <p>{s}</p>
        </li>
      ))}
    </ol>
  );
}

export function formatTime(min: number | null | undefined): string | null {
  if (!min) return null;
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

export function RecipeArticle({
  recipe,
  categories,
  servings,
  onServings,
  actions,
  pageLabel,
}: {
  recipe: Recipe;
  categories: Category[];
  servings: number;
  onServings: (n: number) => void;
  actions?: ReactNode;
  pageLabel?: ReactNode;
}) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const base = recipe.servings;
  const factor = base ? servings / base : servings;
  const cats = categories.filter((c) => recipe.categoryIds.includes(c.id));
  const time = formatTime(recipe.timeMinutes);

  return (
    <article className="recipe">
      {recipe.photoId && (
        <button className="recipe-photo" onClick={() => setLightbox(recipe.photoId!)} aria-label="Foto vergrößern">
          <StoredImage id={recipe.photoId} alt={recipe.title} />
        </button>
      )}
      {recipe.photoId && recipe.photoCredit && (
        <p className="photo-credit">
          Beispielfoto: {recipe.photoCredit.creator} ·{' '}
          {recipe.photoCredit.licenseUrl ? (
            <a href={recipe.photoCredit.licenseUrl} target="_blank" rel="noreferrer">
              {recipe.photoCredit.license}
            </a>
          ) : (
            recipe.photoCredit.license
          )}
          {recipe.photoCredit.landingUrl && (
            <>
              {' · '}
              <a href={recipe.photoCredit.landingUrl} target="_blank" rel="noreferrer">
                Quelle
              </a>
            </>
          )}
        </p>
      )}
      <header className="recipe-head">
        <div className="eyebrow">{cats.length ? cats.map((c) => c.name).join(' · ') : 'Rezept'}</div>
        <h1 className="recipe-title">{recipe.title}</h1>
        <div className="recipe-meta">
          <ServingsStepper value={servings} base={base} label={recipe.servingsLabel} onChange={onServings} />
          {time && (
            <span className="meta-pill">
              <Icon name="clock" /> {time}
            </span>
          )}
        </div>
      </header>

      <div className="recipe-body">
        <section className="recipe-col recipe-ingredients">
          <h2 className="recipe-section-title">Zutaten</h2>
          {recipe.ingredients.length ? (
            <IngredientList ingredients={recipe.ingredients} factor={factor} />
          ) : (
            <p className="muted">Keine Zutaten erfasst.</p>
          )}
        </section>
        <section className="recipe-col recipe-steps">
          <h2 className="recipe-section-title">Zubereitung</h2>
          {recipe.steps.length ? <StepList steps={recipe.steps} /> : <p className="muted">Keine Schritte erfasst.</p>}
          {recipe.notes && (
            <aside className="recipe-notes">
              <strong>Notiz</strong>
              <p>{recipe.notes}</p>
            </aside>
          )}
        </section>
      </div>

      {recipe.imageIds.length > 0 && (
        <section className="recipe-images">
          <h2 className="recipe-section-title">Original</h2>
          <div className="thumbs">
            {recipe.imageIds.map((id) => (
              <button key={id} className="thumb" onClick={() => setLightbox(id)} aria-label="Original-Screenshot ansehen">
                <StoredImage id={id} alt="Original-Screenshot" />
              </button>
            ))}
          </div>
        </section>
      )}

      {actions && <footer className="recipe-actions">{actions}</footer>}
      {pageLabel && <div className="page-number">{pageLabel}</div>}
      {lightbox && <Lightbox imageId={lightbox} onClose={() => setLightbox(null)} />}
    </article>
  );
}
