// „Was koche ich heute?“ – immer 3 Vorschläge: zuerst aus dem eigenen Buch, sonst neue Ideen von Claude.
import { useMemo, useState } from 'react';
import { useCategories, useRecipes } from '../hooks';
import { navigate } from '../router';
import { ideaToRecipe, whatToCook, type BookSuggestion, type RecipeIdea } from '../ai/claudeAssist';
import { ClaudeError, claudeConfigured } from '../ai/claudeRecipe';
import { addManualShopping } from '../db/repo';
import { allTags } from '../lib/search';
import { startManual } from '../ocr/importStore';
import { Icon } from '../components/Icon';
import { StoredImage, toast } from '../components/ui';
import { MoreLink } from '../components/MoreLink';

const WISHES = ['schnell', 'vegetarisch', 'leicht', 'Resteverwertung', 'etwas Süßes'];

function errorText(e: unknown) {
  return e instanceof ClaudeError ? e.message : 'Das hat leider nicht geklappt. Bitte erneut versuchen.';
}

export function TodayView() {
  const recipes = useRecipes();
  const categories = useCategories();
  const tags = useMemo(() => allTags(recipes ?? []), [recipes]);
  const [have, setHave] = useState('');
  const [wishes, setWishes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ fromBook: BookSuggestion[]; ideas: RecipeIdea[] } | null>(null);

  // Tags wie „Thea“ als Wunsch: „für Thea geeignet (#Thea)“
  const wishText = wishes.map((w) => (tags.includes(w) ? `passend zu #${w}` : w));

  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await whatToCook(have, wishText, recipes ?? []));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const workOut = async (idea: RecipeIdea) => {
    setWorking(idea.title);
    setError(null);
    try {
      const draft = await ideaToRecipe(idea, have, wishText, categories ?? []);
      // Gewählte Tags übernehmen („Thea“), damit das neue Rezept gleich richtig einsortiert ist
      draft.tags = wishes.filter((w) => tags.includes(w));
      startManual(draft);
      navigate('/import/pruefen');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setWorking(null);
    }
  };

  const shopMissing = async (missing: string[]) => {
    for (const m of missing) await addManualShopping(m);
    toast(`${missing.length} Zutaten auf die Einkaufsliste gesetzt`);
  };

  return (
    <div className="page today">
      <div className="page-head">
        <div>
          <div className="eyebrow">{recipes?.length ?? 0} Rezepte im Buch</div>
          <h1 className="page-title">Was koche ich heute?</h1>
        </div>
        <MoreLink />
      </div>

      {!claudeConfigured() && (
        <div className="notice">
          <p>Dafür wird Claude benötigt: unter „Mehr → Rezepterkennung mit Claude“ einen API-Schlüssel eintragen.</p>
          <button className="btn" onClick={() => navigate('/mehr')}>
            Zu den Einstellungen
          </button>
        </div>
      )}

      <label className="field">
        <span>Was ist da?</span>
        <textarea
          className="textarea"
          rows={3}
          placeholder="z. B. Kartoffeln, Paprika, Feta, Eier, halbe Zucchini …"
          value={have}
          onChange={(e) => setHave(e.target.value)}
        />
      </label>
      <div className="chip-wrap today-wishes">
        {[...tags.map((t) => ({ v: t, label: `#${t}` })), ...WISHES.map((w) => ({ v: w, label: w }))].map(({ v, label }) => (
          <button key={v} className={`chip${tags.includes(v) ? ' tag-chip' : ''}`} aria-pressed={wishes.includes(v)} onClick={() => setWishes(wishes.includes(v) ? wishes.filter((x) => x !== v) : [...wishes, v])}>
            {label}
          </button>
        ))}
      </div>
      <button className="btn btn-primary btn-block btn-lg" onClick={ask} disabled={busy}>
        <Icon name="sparkle" /> {busy ? 'Claude blättert im Kochbuch …' : '3 Vorschläge holen'}
      </button>
      {error && <p className="error">{error}</p>}

      {result && (
        <div className="today-results">
          {result.fromBook.map((s) => (
            <article key={s.recipe.id} className="today-card card">
              <span className="today-badge">Aus eurem Buch</span>
              <button className="today-card-main" onClick={() => navigate(`/rezepte/${s.recipe.id}`)}>
                {(s.recipe.photoId || s.recipe.imageIds[0]) && <StoredImage id={(s.recipe.photoId || s.recipe.imageIds[0])!} alt="" className="today-img" />}
                <span>
                  <strong>{s.recipe.title}</strong>
                  <span className="today-reason">{s.reason}</span>
                </span>
              </button>
              {s.missing.length > 0 && <p className="today-missing">Fehlt noch: {s.missing.join(', ')}</p>}
              {s.tip && <p className="hint">{s.tip}</p>}
              <div className="more-actions">
                <button className="btn btn-primary" onClick={() => navigate(`/kochen/${s.recipe.id}?p=${s.recipe.servings ?? 1}`)}>
                  <Icon name="flame" /> Kochen
                </button>
                {s.missing.length > 0 && (
                  <button className="btn" onClick={() => shopMissing(s.missing)}>
                    <Icon name="cart" /> Fehlendes einkaufen
                  </button>
                )}
              </div>
            </article>
          ))}
          {result.ideas.map((idea) => (
            <article key={idea.title} className="today-card card is-idea">
              <span className="today-badge is-idea">Neue Idee</span>
              <div className="today-card-main">
                <span>
                  <strong>{idea.title}</strong>
                  <span className="today-reason">
                    {idea.description}
                    {idea.time_minutes ? ` · ca. ${idea.time_minutes} Min.` : ''}
                  </span>
                </span>
              </div>
              {idea.missing.length > 0 && <p className="today-missing">Fehlt noch: {idea.missing.join(', ')}</p>}
              <div className="more-actions">
                <button className="btn btn-primary" onClick={() => workOut(idea)} disabled={!!working}>
                  <Icon name="sparkle" /> {working === idea.title ? 'Claude schreibt das Rezept …' : 'Rezept ausarbeiten'}
                </button>
                {idea.missing.length > 0 && (
                  <button className="btn" onClick={() => shopMissing(idea.missing)}>
                    <Icon name="cart" /> Fehlendes einkaufen
                  </button>
                )}
              </div>
            </article>
          ))}
          {result.fromBook.length + result.ideas.length === 0 && <p className="sync-state">Claude hat keine Vorschläge gefunden – versuch es mit anderen Zutaten oder Wünschen.</p>}
        </div>
      )}
    </div>
  );
}
