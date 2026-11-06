// Bestehendes Rezept bearbeiten (inkl. Bilder hinzufügen/entfernen).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useCategories } from '../hooks';
import { back, navigate } from '../router';
import { RecipeEditor } from '../components/RecipeEditor';
import { Icon } from '../components/Icon';
import { confirmDialog, toast } from '../components/ui';
import { addImagesToRecipe, deleteRecipe, removeImage, setRecipePhoto, updateRecipe } from '../db/repo';
import type { Recipe, RecipeDraft } from '../types';

function toDraft(r: Recipe): RecipeDraft {
  return {
    title: r.title,
    servings: r.servings,
    servingsLabel: r.servingsLabel,
    ingredients: r.ingredients,
    steps: r.steps,
    notes: r.notes,
    timeMinutes: r.timeMinutes,
    categoryIds: r.categoryIds,
    ocrText: r.ocrText ?? '',
  };
}

export function EditView({ id }: { id: string }) {
  const recipe = useLiveQuery(() => db.recipes.get(id), [id]);
  const categories = useCategories();
  const images = useLiveQuery(() => db.images.where('recipeId').equals(id).toArray(), [id]);
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!recipe || draft) return;
    // Vorhandenes Foto in den Entwurf laden
    (async () => {
      const photo = recipe.photoId ? (await db.images.get(recipe.photoId))?.blob : undefined;
      setDraft({ ...toDraft(recipe), photo });
    })();
  }, [recipe, draft]);
  const [originalPhoto, setOriginalPhoto] = useState<Blob | undefined | null>(null);
  useEffect(() => {
    if (draft && originalPhoto === null) setOriginalPhoto(draft.photo);
  }, [draft, originalPhoto]);

  // Nur Screenshots/Anhänge anzeigen, nicht das Foto vom Gericht
  const urls = useMemo(
    () => (images ?? []).filter((i) => i.id !== recipe?.photoId).map((i) => ({ id: i.id, url: URL.createObjectURL(i.blob) })),
    [images, recipe?.photoId],
  );
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u.url)), [urls]);

  if (recipe === undefined || !categories) return null;
  if (recipe === null || !draft) return <div className="page"><div className="empty"><h2>Rezept nicht gefunden</h2></div></div>;

  const save = async () => {
    const { photo, confidence: _c, ...fields } = draft;
    await updateRecipe(id, { ...fields, title: fields.title.trim() || 'Ohne Titel' });
    if (photo !== originalPhoto) await setRecipePhoto(id, photo ?? null);
    toast('Änderungen gespeichert');
    navigate(`/rezepte/${id}`, { replace: true });
  };

  return (
    <div className="page page-wide">
      <RecipeEditor
        value={draft}
        onChange={setDraft}
        categories={categories}
        imageUrls={urls.map((u) => u.url)}
        heading={
          <div className="review-head">
            <button className="btn btn-ghost back-link" onClick={() => back(`/rezepte/${id}`)}>
              <Icon name="back" /> Zurück
            </button>
            <h1 className="page-title">Bearbeiten</h1>
          </div>
        }
        footer={
          <>
            <button
              className="btn btn-danger btn-icon-mobile"
              aria-label="Rezept löschen"
              onClick={async () => {
                const ok = await confirmDialog({ title: 'Rezept löschen?', text: `„${recipe.title}“ wird dauerhaft gelöscht.`, confirm: 'Löschen', danger: true });
                if (!ok) return;
                await deleteRecipe(id);
                toast('Rezept gelöscht');
                navigate('/rezepte', { replace: true });
              }}
            >
              <Icon name="trash" /> <span>Löschen</span>
            </button>
            <span className="spacer" />
            <button className="btn btn-ghost" onClick={() => back(`/rezepte/${id}`)}>
              Abbrechen
            </button>
            <button className="btn btn-primary" onClick={save}>
              <Icon name="check" /> Speichern
            </button>
          </>
        }
      />
      <section className="edit-images">
        <h2>Bilder</h2>
        <div className="thumbs">
          {urls.map((u) => (
            <div key={u.id} className="thumb">
              <img src={u.url} alt="Anhang" />
              <button
                className="icon-btn sm thumb-remove"
                aria-label="Bild entfernen"
                onClick={async () => {
                  if (await confirmDialog({ title: 'Bild entfernen?', confirm: 'Entfernen', danger: true })) await removeImage(id, u.id);
                }}
              >
                <Icon name="close" />
              </button>
            </div>
          ))}
          <button className="thumb thumb-add" onClick={() => fileInput.current?.click()}>
            <Icon name="plus" />
            <span>Bild</span>
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={async (e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (files.length) await addImagesToRecipe(id, files);
          }}
        />
      </section>
    </div>
  );
}
