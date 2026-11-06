// „Was koche ich heute?“ – Claude sucht passende Rezepte aus eurem Buch zu dem, was da ist.
import { useState } from 'react';
import { useRecipes } from '../hooks';
import { navigate } from '../router';
import { whatToCook, type TodaySuggestion } from '../ai/claudeAssist';
import { ClaudeError, claudeConfigured } from '../ai/claudeRecipe';
import { addManualShopping } from '../db/repo';
import { Icon } from '../components/Icon';
import { StoredImage, toast } from '../components/ui';
import { MoreLink } from '../components/MoreLink';

const WISHES = ['schnell', 'vegetarisch', 'für Kinder', 'leicht', 'Resteverwertung', 'etwas Süßes'];

export function TodayView() {
  const recipes = useRecipes();
  const [have, setHave] = useState('');
  const [wishes, setWishes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ suggestions: TodaySuggestion[]; note: string | null } | null>(null);

  const ask = async () => {
    if (!recipes?.length) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await whatToCook(have, wishes, recipes));
    } catch (e) {
      setError(e instanceof ClaudeError ? e.message : 'Das hat leider nicht geklappt. Bitte erneut versuchen.');
    } finally {
      setBusy(false);
    }
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
        {WISHES.map((w) => (
          <button key={w} className="chip" aria-pressed={wishes.includes(w)} onClick={() => setWishes(wishes.includes(w) ? wishes.filter((x) => x !== w) : [...wishes, w])}>
            {w}
          </button>
        ))}
      </div>
      <button className="btn btn-primary btn-block btn-lg" onClick={ask} disabled={busy || !recipes?.length}>
        <Icon name="sparkle" /> {busy ? 'Claude blättert im Kochbuch …' : 'Vorschläge holen'}
      </button>
      {error && <p className="error">{error}</p>}

      {result && (
        <div className="today-results">
          {result.note && <p className="sync-state">{result.note}</p>}
          {result.suggestions.map((s) => (
            <article key={s.recipe.id} className="today-card card">
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
                  <button
                    className="btn"
                    onClick={async () => {
                      for (const m of s.missing) await addManualShopping(m);
                      toast(`${s.missing.length} Zutaten auf die Einkaufsliste gesetzt`);
                    }}
                  >
                    <Icon name="cart" /> Fehlendes einkaufen
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
