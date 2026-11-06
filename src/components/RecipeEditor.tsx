// Formular zum Prüfen/Korrigieren (nach OCR) und Bearbeiten von Rezepten.
// Originalbilder werden daneben (Desktop) bzw. ausklappbar oben (Handy) angezeigt.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Category, Ingredient, RecipeDraft } from '../types';
import { ingredientToLine, parseIngredientLine } from '../lib/ingredientParser';
import { parseLeadingQuantity } from '../lib/quantity';
import { UNITS, lookupUnit } from '../lib/units';
import { linesFromPlainText, parseRecipe } from '../lib/recipeParser';
import { uid } from '../lib/id';
import { addCategory } from '../db/repo';
import { Icon } from './Icon';
import { Lightbox } from './Lightbox';
import { confirmDialog, toast, useObjectUrl } from './ui';
import { resizePhoto } from '../lib/image';

/** Foto vom fertigen Gericht: aufnehmen (Kamera) oder aus der Mediathek wählen */
function PhotoField({ photo, onChange }: { photo: Blob | null | undefined; onChange: (p: Blob | null) => void }) {
  const url = useObjectUrl(photo ?? null);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    try {
      onChange(await resizePhoto(f));
    } catch {
      toast('Das Foto konnte nicht geladen werden');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="field">
      <span>Foto vom Gericht</span>
      <div className={`photo-field${url ? ' has-photo' : ''}`}>
        {url ? <img src={url} alt="Foto vom Gericht" /> : <div className="photo-empty"><Icon name="image" /></div>}
        <div className="photo-actions">
          <button type="button" className="btn" onClick={() => camera.current?.click()} disabled={busy}>
            <Icon name="camera" /> Foto aufnehmen
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => library.current?.click()} disabled={busy}>
            <Icon name="image" /> Aus Fotos
          </button>
          {url && (
            <button type="button" className="btn btn-ghost" onClick={() => onChange(null)}>
              <Icon name="trash" /> Entfernen
            </button>
          )}
        </div>
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      <input ref={library} type="file" accept="image/*" hidden onChange={pick} />
    </div>
  );
}

function qtyToText(q: number | null, max?: number | null): string {
  if (q == null) return '';
  const f = (n: number) => String(Math.round(n * 1000) / 1000).replace('.', ',');
  return max != null ? `${f(q)}-${f(max)}` : f(q);
}

function QuantityInput({ value, max, onChange }: { value: number | null; max?: number | null; onChange: (q: number | null, max: number | null) => void }) {
  const [text, setText] = useState(qtyToText(value, max));
  useEffect(() => setText(qtyToText(value, max)), [value, max]);
  return (
    <input
      className="input ing-q"
      inputMode="decimal"
      placeholder="–"
      aria-label="Menge"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const t = text.trim();
        if (!t) return onChange(null, null);
        const p = parseLeadingQuantity(t);
        if (p) onChange(p.value, p.max);
        else setText(qtyToText(value, max));
      }}
    />
  );
}

function NameInput({ ing, onChange }: { ing: Ingredient; onChange: (i: Ingredient) => void }) {
  const full = ing.note ? `${ing.name}, ${ing.note}` : ing.name;
  const [text, setText] = useState(full);
  useEffect(() => setText(full), [full]);
  return (
    <input
      className="input ing-n"
      placeholder="Zutat, Notiz"
      aria-label="Zutat"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const i = text.indexOf(',');
        const name = (i > 0 ? text.slice(0, i) : text).trim();
        const note = i > 0 ? text.slice(i + 1).trim() || undefined : undefined;
        if (name !== ing.name || note !== ing.note) onChange({ ...ing, name, note });
      }}
    />
  );
}

function IngredientRow({
  ing,
  onChange,
  onRemove,
  onMove,
}: {
  ing: Ingredient;
  onChange: (i: Ingredient) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  return (
    <div className="ing-row">
      <QuantityInput value={ing.quantity} max={ing.quantityMax} onChange={(q, m) => onChange({ ...ing, quantity: q, quantityMax: m })} />
      <input
        className="input ing-u"
        list="unit-list"
        placeholder="–"
        aria-label="Einheit"
        value={ing.unit}
        onChange={(e) => onChange({ ...ing, unit: e.target.value })}
        onBlur={(e) => {
          const u = lookupUnit(e.target.value);
          if (u && u.key !== ing.unit) onChange({ ...ing, unit: u.key });
        }}
      />
      <NameInput ing={ing} onChange={onChange} />
      <div className="row-tools">
        <button type="button" className="icon-btn sm wide-only" onClick={() => onMove(-1)} aria-label="Nach oben">
          <Icon name="arrowUp" />
        </button>
        <button type="button" className="icon-btn sm" onClick={onRemove} aria-label="Zutat entfernen">
          <Icon name="close" />
        </button>
      </div>
    </div>
  );
}

function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= list.length) return list;
  const n = [...list];
  [n[i], n[j]] = [n[j], n[i]];
  return n;
}

export function RecipeEditor({
  value,
  onChange,
  categories,
  imageUrls,
  footer,
  heading,
}: {
  value: RecipeDraft;
  onChange: (d: RecipeDraft) => void;
  categories: Category[];
  imageUrls: string[];
  footer: ReactNode;
  heading: ReactNode;
}) {
  const [textMode, setTextMode] = useState(false);
  const [bulk, setBulk] = useState('');
  const [showOriginal, setShowOriginal] = useState(true);
  const [showOcr, setShowOcr] = useState(false);
  const [ocrText, setOcrText] = useState(value.ocrText);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [newCat, setNewCat] = useState('');
  const set = (patch: Partial<RecipeDraft>) => onChange({ ...value, ...patch });

  const setIng = (i: number, ing: Ingredient) => set({ ingredients: value.ingredients.map((x, k) => (k === i ? ing : x)) });

  const startText = () => {
    setBulk(
      value.ingredients
        .map((i, k) => {
          const prev = value.ingredients[k - 1];
          const head = i.group && i.group !== prev?.group ? `${i.group}:\n` : '';
          return head + ingredientToLine(i);
        })
        .join('\n'),
    );
    setTextMode(true);
  };
  const applyText = () => {
    let group: string | undefined;
    const ings: Ingredient[] = [];
    for (const line of bulk.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      if (/:$/.test(t) && !parseLeadingQuantity(t)) {
        group = t.slice(0, -1);
        continue;
      }
      ings.push(parseIngredientLine(t, group));
    }
    set({ ingredients: ings });
    setTextMode(false);
  };

  const reparse = async () => {
    const ok = await confirmDialog({
      title: 'Text neu auswerten?',
      text: 'Titel, Portionen, Zutaten und Schritte werden aus dem (bearbeiteten) Erkennungstext neu erzeugt. Deine Änderungen an diesen Feldern gehen verloren.',
      confirm: 'Neu auswerten',
    });
    if (!ok) return;
    const d = parseRecipe(linesFromPlainText(ocrText));
    onChange({ ...d, categoryIds: value.categoryIds, ocrText });
  };

  return (
    <div className={`editor${imageUrls.length ? ' has-images' : ''}`}>
      {imageUrls.length > 0 && (
        <aside className={`editor-original${showOriginal ? ' is-open' : ''}`}>
          <button type="button" className="editor-original-toggle" onClick={() => setShowOriginal(!showOriginal)}>
            <Icon name="image" /> Original {showOriginal ? 'ausblenden' : 'anzeigen'}
          </button>
          {showOriginal && (
            <div className="editor-original-scroll">
              {imageUrls.map((u) => (
                <img key={u} src={u} alt="Original-Screenshot" onClick={() => setLightbox(u)} />
              ))}
            </div>
          )}
        </aside>
      )}

      <div className="editor-form">
        {heading}
        <label className="field">
          <span>Titel</span>
          <input className="input input-title" value={value.title} onChange={(e) => set({ title: e.target.value })} placeholder="Name des Rezepts" />
        </label>

        <PhotoField photo={value.photo} onChange={(photo) => set({ photo })} />

        <div className="field-row">
          <label className="field">
            <span>Portionen</span>
            <input
              className="input"
              inputMode="numeric"
              value={value.servings ?? ''}
              placeholder="–"
              onChange={(e) => {
                const n = parseFloat(e.target.value.replace(',', '.'));
                set({ servings: Number.isFinite(n) && n > 0 ? n : null });
              }}
            />
          </label>
          <label className="field">
            <span>Bezeichnung</span>
            <input className="input" list="servings-labels" value={value.servingsLabel ?? ''} placeholder="Portionen" onChange={(e) => set({ servingsLabel: e.target.value })} />
          </label>
          <label className="field">
            <span>Zeit (Min.)</span>
            <input
              className="input"
              inputMode="numeric"
              value={value.timeMinutes ?? ''}
              placeholder="–"
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                set({ timeMinutes: Number.isFinite(n) && n > 0 ? n : null });
              }}
            />
          </label>
        </div>

        <div className="field">
          <span>Kategorien</span>
          <div className="chip-wrap">
            {categories.map((c) => {
              const on = value.categoryIds.includes(c.id);
              return (
                <button
                  type="button"
                  key={c.id}
                  className="chip"
                  aria-pressed={on}
                  onClick={() => set({ categoryIds: on ? value.categoryIds.filter((x) => x !== c.id) : [...value.categoryIds, c.id] })}
                >
                  {on && <Icon name="check" size={16} />} {c.name}
                </button>
              );
            })}
            <form
              className="chip-new"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newCat.trim()) return;
                const c = await addCategory(newCat);
                set({ categoryIds: [...value.categoryIds, c.id] });
                setNewCat('');
              }}
            >
              <input className="chip chip-input" placeholder="+ Neue Kategorie" value={newCat} onChange={(e) => setNewCat(e.target.value)} aria-label="Neue Kategorie" />
            </form>
          </div>
        </div>

        <section className="editor-section">
          <div className="editor-section-head">
            <h2>Zutaten</h2>
            <button type="button" className="btn btn-ghost" onClick={textMode ? applyText : startText}>
              <Icon name={textMode ? 'check' : 'text'} /> {textMode ? 'Übernehmen' : 'Als Text'}
            </button>
          </div>
          {textMode ? (
            <>
              <textarea className="textarea mono" rows={Math.max(8, bulk.split('\n').length + 1)} value={bulk} onChange={(e) => setBulk(e.target.value)} />
              <p className="hint">Eine Zutat pro Zeile, z. B. „200 g Mehl“ oder „1½ EL Öl, kaltgepresst“. Zeilen mit Doppelpunkt am Ende werden zu Zwischenüberschriften.</p>
            </>
          ) : (
            <div className="ing-rows">
              {value.ingredients.map((ing, i) => (
                <div key={ing.id}>
                  {ing.group && ing.group !== value.ingredients[i - 1]?.group && (
                    <input
                      className="input ing-group-input"
                      value={ing.group}
                      aria-label="Zwischenüberschrift"
                      onChange={(e) => {
                        const g = ing.group;
                        set({ ingredients: value.ingredients.map((x) => (x.group === g ? { ...x, group: e.target.value || undefined } : x)) });
                      }}
                    />
                  )}
                  <IngredientRow
                    ing={ing}
                    onChange={(n) => setIng(i, n)}
                    onRemove={() => set({ ingredients: value.ingredients.filter((_, k) => k !== i) })}
                    onMove={(d) => set({ ingredients: move(value.ingredients, i, d) })}
                  />
                </div>
              ))}
              <button
                type="button"
                className="btn btn-ghost add-row"
                onClick={() =>
                  set({
                    ingredients: [
                      ...value.ingredients,
                      { id: uid(), quantity: null, unit: '', name: '', group: value.ingredients[value.ingredients.length - 1]?.group },
                    ],
                  })
                }
              >
                <Icon name="plus" /> Zutat hinzufügen
              </button>
            </div>
          )}
        </section>

        <section className="editor-section">
          <div className="editor-section-head">
            <h2>Zubereitung</h2>
          </div>
          <div className="step-rows">
            {value.steps.map((s, i) => (
              <div className="step-row" key={i}>
                <span className="step-no">{i + 1}</span>
                <textarea
                  className="textarea"
                  rows={Math.min(8, Math.max(2, Math.ceil(s.length / 38)))}
                  value={s}
                  aria-label={`Schritt ${i + 1}`}
                  onChange={(e) => set({ steps: value.steps.map((x, k) => (k === i ? e.target.value : x)) })}
                />
                <div className="row-tools col">
                  <button type="button" className="icon-btn sm" onClick={() => set({ steps: move(value.steps, i, -1) })} aria-label="Nach oben">
                    <Icon name="arrowUp" />
                  </button>
                  <button
                    type="button"
                    className="icon-btn sm"
                    onClick={() => {
                      // Mit vorherigem Schritt zusammenführen
                      if (i === 0) return;
                      const n = [...value.steps];
                      n[i - 1] = `${n[i - 1]} ${n[i]}`.trim();
                      n.splice(i, 1);
                      set({ steps: n });
                    }}
                    aria-label="Mit vorherigem Schritt zusammenführen"
                    title="Mit vorherigem Schritt zusammenführen"
                    disabled={i === 0}
                  >
                    <Icon name="layers" />
                  </button>
                  <button type="button" className="icon-btn sm" onClick={() => set({ steps: value.steps.filter((_, k) => k !== i) })} aria-label="Schritt entfernen">
                    <Icon name="close" />
                  </button>
                </div>
              </div>
            ))}
            <button type="button" className="btn btn-ghost add-row" onClick={() => set({ steps: [...value.steps, ''] })}>
              <Icon name="plus" /> Schritt hinzufügen
            </button>
          </div>
        </section>

        <label className="field">
          <span>Notizen</span>
          <textarea className="textarea" rows={3} value={value.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} placeholder="Tipps, Varianten, Quelle …" />
        </label>

        {value.ocrText && (
          <details className="ocr-raw" open={showOcr} onToggle={(e) => setShowOcr((e.target as HTMLDetailsElement).open)}>
            <summary>Erkannter Rohtext</summary>
            <textarea className="textarea mono" rows={12} value={ocrText} onChange={(e) => setOcrText(e.target.value)} />
            <button type="button" className="btn" onClick={reparse}>
              <Icon name="refresh" /> Aus Text neu auswerten
            </button>
          </details>
        )}

        <div className="editor-footer">{footer}</div>
      </div>

      <datalist id="unit-list">
        {UNITS.map((u) => (
          <option key={u.key} value={u.key} />
        ))}
      </datalist>
      <datalist id="servings-labels">
        <option value="Portionen" />
        <option value="Personen" />
        <option value="Stück" />
      </datalist>
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
