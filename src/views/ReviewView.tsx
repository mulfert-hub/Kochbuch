// Prüf- und Korrekturbildschirm nach dem OCR (alle Felder editierbar, Original daneben).
import { useMemo } from 'react';
import { navigate } from '../router';
import { useCategories } from '../hooks';
import { RecipeEditor } from '../components/RecipeEditor';
import { Icon } from '../components/Icon';
import { confirmDialog, toast } from '../components/ui';
import { createRecipe } from '../db/repo';
import { markSaved, reset, setCurrent, setDraft, useImport } from '../ocr/importStore';

export function ReviewView() {
  const st = useImport();
  const categories = useCategories();
  const entry = st.drafts[st.current];
  const imageUrls = useMemo(
    () => (entry ? entry.imageIds.map((id) => st.images.find((i) => i.id === id)?.url).filter((u): u is string => !!u) : []),
    [entry, st.images],
  );

  if (!entry || !categories) {
    return (
      <div className="page">
        <div className="empty">
          <h2>Nichts zu prüfen</h2>
          <p>Wähle zuerst Screenshots zum Importieren aus.</p>
          <button className="btn btn-primary" onClick={() => navigate('/import', { replace: true })}>
            Zum Import
          </button>
        </div>
      </div>
    );
  }

  const total = st.drafts.length;
  const conf = entry.draft.confidence;

  const finish = (lastId?: string) => {
    reset();
    navigate(lastId ? `/rezepte/${lastId}` : '/rezepte', { replace: true });
  };

  const next = (savedId?: string) => {
    const remaining = st.drafts.findIndex((d, i) => i > st.current && !d.savedRecipeId);
    if (remaining !== -1) setCurrent(remaining);
    else finish(savedId ?? entry.savedRecipeId);
  };

  const save = async () => {
    if (!entry.draft.title.trim()) {
      toast('Bitte gib einen Titel ein');
      return;
    }
    const files = entry.imageIds.map((id) => st.images.find((i) => i.id === id)?.file).filter((f): f is File => !!f);
    const id = await createRecipe(entry.draft, files);
    markSaved(st.current, id);
    toast('Rezept gespeichert');
    next(id);
  };

  const discard = async () => {
    const ok = await confirmDialog({ title: 'Entwurf verwerfen?', text: 'Dieser Rezeptentwurf wird nicht gespeichert.', confirm: 'Verwerfen', danger: true });
    if (!ok) return;
    if (total === 1) finish();
    else next();
  };

  return (
    <div className="page page-wide">
      <RecipeEditor
        key={entry.id}
        value={entry.draft}
        onChange={(d) => setDraft(st.current, d)}
        categories={categories}
        imageUrls={imageUrls}
        autoSuggestPhoto
        heading={
          <div className="review-head">
            <div className="eyebrow">
              Prüfen{total > 1 ? ` · Rezept ${st.current + 1} von ${total}` : ''}
            </div>
            <h1 className="page-title">Stimmt alles?</h1>
            {entry.draft.source === 'idea' && (
              <p className="confidence ok">Von Claude vorgeschlagen – noch nicht ausprobiert. Mengen und Zeiten bitte beim ersten Kochen prüfen.</p>
            )}
            {entry.draft.source === 'claude' && (
              <p className="confidence good">
                Von Claude erkannt. Bitte kurz Mengen und Schritte prüfen.
                {!entry.draft.title.trim() && ' Im Bild steht kein Rezeptname – bitte selbst eintragen.'}
              </p>
            )}
            {!entry.draft.source && conf != null && entry.draft.ocrText && (
              <p className={`confidence ${conf > 0.75 ? 'good' : conf > 0.45 ? 'ok' : 'low'}`}>
                {conf > 0.75
                  ? 'Gut erkannt. Bitte trotzdem kurz Mengen prüfen.'
                  : conf > 0.45
                    ? 'Teilweise erkannt. Prüfe Zutaten und Schritte.'
                    : 'Schwer lesbar. Ergänze die fehlenden Felder von Hand oder nutze „Als Text“.'}
              </p>
            )}
          </div>
        }
        footer={
          <>
            <button className="btn btn-ghost" onClick={discard}>
              Verwerfen
            </button>
            <button className="btn btn-primary" onClick={save}>
              <Icon name="check" /> Speichern{total > 1 && st.drafts.some((d, i) => i > st.current && !d.savedRecipeId) ? ' & weiter' : ''}
            </button>
          </>
        }
      />
    </div>
  );
}
