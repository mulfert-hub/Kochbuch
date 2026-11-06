// Fenster für „Zutat ersetzen“ und „Rezept anpassen“ (beides mit Claude).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Category, Ingredient, Recipe, RecipeDraft } from '../types';
import { adaptRecipe, ADAPT_PRESETS, applySubstitute, substitute, type SubstituteOption } from '../ai/claudeAssist';
import { ClaudeError } from '../ai/claudeRecipe';
import { createRecipe, updateRecipe } from '../db/repo';
import { db } from '../db/db';
import { formatAmount } from '../lib/quantity';
import { ingredientToLine } from '../lib/ingredientParser';
import { navigate } from '../router';
import { Icon } from './Icon';
import { toast } from './ui';

export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="dialog sheet" onCancel={onClose} onClose={onClose}>
      <div className="sheet-head">
        <h2>{title}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Schließen">
          <Icon name="close" />
        </button>
      </div>
      <div className="sheet-body">{children}</div>
      {footer && <div className="dialog-actions">{footer}</div>}
    </dialog>
  );
}

function errorText(e: unknown) {
  return e instanceof ClaudeError ? e.message : 'Das hat leider nicht geklappt. Bitte erneut versuchen.';
}

const ingLabel = (i: Ingredient) => (formatAmount(i.quantity, i.quantityMax, i.unit) + ' ' + i.name).trim();

export function SubstituteSheet({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const [ing, setIng] = useState<Ingredient | null>(null);
  const [wish, setWish] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ options: SubstituteOption[]; warning: string | null } | null>(null);

  const ask = async () => {
    if (!ing) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await substitute(recipe, ing, wish));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Zutat ersetzen" onClose={onClose}>
      <p className="hint">Welche Zutat fehlt oder soll ersetzt werden?</p>
      <div className="chip-wrap">
        {recipe.ingredients.map((i) => (
          <button
            key={i.id}
            className="chip"
            aria-pressed={ing?.id === i.id}
            onClick={() => {
              setIng(i);
              setResult(null);
            }}
          >
            {ingLabel(i)}
          </button>
        ))}
      </div>
      {ing && (
        <>
          <label className="field sheet-field">
            <span>Wunsch (optional)</span>
            <input className="input" placeholder="z. B. „ich habe nur Apfel da“ oder „ohne Milchprodukte“" value={wish} onChange={(e) => setWish(e.target.value)} />
          </label>
          <button className="btn btn-primary btn-block" onClick={ask} disabled={busy}>
            <Icon name="sparkle" /> {busy ? 'Claude überlegt …' : 'Ersatz vorschlagen'}
          </button>
        </>
      )}
      {error && <p className="error">{error}</p>}
      {result && (
        <div className="assist-results">
          {result.warning && <p className="sync-state is-error">{result.warning}</p>}
          {result.options.map((o, k) => {
            const line = ingredientToLine({ id: '', quantity: o.replacement.quantity, quantityMax: o.replacement.quantity_max, unit: o.replacement.unit, name: o.replacement.name, note: o.replacement.note ?? undefined });
            return (
              <div key={k} className="assist-card">
                <strong>{line}</strong>
                <p>{o.explanation}</p>
                {o.step_hint && <p className="hint">Zubereitung: {o.step_hint}</p>}
                <button
                  className="btn"
                  onClick={async () => {
                    await updateRecipe(recipe.id, applySubstitute(recipe, ing!, o));
                    toast(`„${ing!.name}“ ersetzt – Hinweis steht in den Notizen`);
                    onClose();
                  }}
                >
                  <Icon name="check" /> Im Rezept ersetzen
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}

export function AdaptSheet({ recipe, categories, onClose }: { recipe: Recipe; categories: Category[]; onClose: () => void }) {
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ draft: RecipeDraft; changes: string[] } | null>(null);

  const ask = async (g: string) => {
    setGoal(g);
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await adaptRecipe(recipe, g, categories));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!result) return;
    // Foto vom Gericht übernehmen, damit die Variante nicht ohne Bild dasteht
    const photo = recipe.photoId ? (await db.images.get(recipe.photoId))?.blob : undefined;
    const id = await createRecipe({ ...result.draft, photo, photoCredit: recipe.photoCredit ?? null });
    toast('Variante gespeichert');
    onClose();
    navigate(`/rezepte/${id}`);
  };

  return (
    <Sheet
      title="Rezept anpassen"
      onClose={onClose}
      footer={
        result && (
          <>
            <button className="btn btn-ghost" onClick={() => setResult(null)}>
              Verwerfen
            </button>
            <button className="btn btn-primary" onClick={save}>
              <Icon name="check" /> Als Variante speichern
            </button>
          </>
        )
      }
    >
      {!result && (
        <>
          <p className="hint">Das Original bleibt erhalten, die Anpassung wird als eigenes Rezept gespeichert.</p>
          <div className="chip-wrap">
            {ADAPT_PRESETS.map((p) => (
              <button key={p} className="chip" disabled={busy} onClick={() => ask(p)}>
                {p}
              </button>
            ))}
          </div>
          <form
            className="sheet-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (goal.trim()) void ask(goal.trim());
            }}
          >
            <input className="input" placeholder="Eigener Wunsch, z. B. „für 8 Personen ohne Pilze“" value={goal} onChange={(e) => setGoal(e.target.value)} />
            <button className="btn btn-primary" type="submit" disabled={busy || !goal.trim()}>
              Los
            </button>
          </form>
          {busy && <p className="hint">Claude passt „{recipe.title}“ an ({goal}) …</p>}
        </>
      )}
      {error && <p className="error">{error}</p>}
      {result && (
        <div className="assist-results">
          <h3 className="assist-title">{result.draft.title || recipe.title}</h3>
          <ul className="assist-changes">
            {result.changes.map((c, k) => (
              <li key={k}>{c}</li>
            ))}
          </ul>
          <details>
            <summary>Zutaten und Schritte ansehen</summary>
            <ul>
              {result.draft.ingredients.map((i) => (
                <li key={i.id}>{ingLabel(i)}</li>
              ))}
            </ul>
            <ol>
              {result.draft.steps.map((s, k) => (
                <li key={k}>{s}</li>
              ))}
            </ol>
          </details>
        </div>
      )}
    </Sheet>
  );
}
