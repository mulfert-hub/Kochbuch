// Inhaltsverzeichnis nach Kategorien + Kategorien verwalten (anlegen, umbenennen, sortieren, löschen).
import { useMemo, useState } from 'react';
import { bookOrder, useCategories, useRecipes } from '../hooks';
import { navigate } from '../router';
import { Icon } from '../components/Icon';
import { MoreLink } from '../components/MoreLink';
import { confirmDialog, toast } from '../components/ui';
import { addCategory, deleteCategory, moveCategory, renameCategory } from '../db/repo';

export function TocView() {
  const recipes = useRecipes();
  const categories = useCategories();
  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState('');

  const ordered = useMemo(() => (recipes && categories ? bookOrder(recipes, categories) : []), [recipes, categories]);
  const pageOf = useMemo(() => new Map(ordered.map((r, i) => [r.id, i + 1])), [ordered]);

  if (!recipes || !categories) return null;

  const uncategorized = recipes.filter((r) => !r.categoryIds.some((id) => categories.some((c) => c.id === id)));

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = newName.trim();
    if (!n) return;
    if (categories.some((c) => c.name.toLowerCase() === n.toLowerCase())) {
      toast('Diese Kategorie gibt es schon');
      return;
    }
    await addCategory(n);
    setNewName('');
  };

  return (
    <div className="page toc">
      <div className="page-head">
        <div>
          <div className="eyebrow">{categories.length} Kategorien</div>
          <h1 className="page-title">Inhalt</h1>
        </div>
        <div className="head-actions">
          <button className={`btn ${editing ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setEditing(!editing)}>
            {editing ? 'Fertig' : 'Bearbeiten'}
          </button>
          <MoreLink />
        </div>
      </div>

      {editing && (
        <form className="toc-add" onSubmit={add}>
          <input className="input" placeholder="Neue Kategorie, z. B. Suppen" value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Neue Kategorie" />
          <button className="btn btn-primary" type="submit" disabled={!newName.trim()}>
            <Icon name="plus" /> Anlegen
          </button>
        </form>
      )}

      <div className="toc-list">
        {categories.map((c, ci) => {
          const items = ordered.filter((r) => r.categoryIds.includes(c.id));
          return (
            <section key={c.id} className="toc-chapter">
              <div className="toc-chapter-head">
                <span className="toc-num">{String(ci + 1).padStart(2, '0')}</span>
                {editing ? (
                  <input
                    className="input toc-rename"
                    defaultValue={c.name}
                    aria-label={`Kategorie ${c.name} umbenennen`}
                    onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && renameCategory(c.id, e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                ) : (
                  <h2>{c.name}</h2>
                )}
                {editing ? (
                  <div className="toc-tools">
                    <button className="icon-btn" onClick={() => moveCategory(c.id, -1)} disabled={ci === 0} aria-label="Nach oben">
                      <Icon name="arrowUp" />
                    </button>
                    <button className="icon-btn" onClick={() => moveCategory(c.id, 1)} disabled={ci === categories.length - 1} aria-label="Nach unten">
                      <Icon name="arrowDown" />
                    </button>
                    <button
                      className="icon-btn"
                      aria-label="Kategorie löschen"
                      onClick={async () => {
                        const ok = await confirmDialog({
                          title: `„${c.name}“ löschen?`,
                          text: items.length ? `${items.length} Rezepte bleiben erhalten, verlieren aber diese Kategorie.` : undefined,
                          confirm: 'Löschen',
                          danger: true,
                        });
                        if (ok) await deleteCategory(c.id);
                      }}
                    >
                      <Icon name="trash" />
                    </button>
                  </div>
                ) : (
                  <span className="toc-count">{items.length}</span>
                )}
              </div>
              {!editing && (
                <ul className="toc-items">
                  {items.length === 0 && <li className="toc-empty">Noch keine Rezepte</li>}
                  {items.map((r) => (
                    <li key={r.id}>
                      <button onClick={() => navigate(`/buch/${r.id}`)}>
                        <span className="toc-title">{r.title}</span>
                        <span className="toc-dots" aria-hidden="true" />
                        <span className="toc-page">{pageOf.get(r.id)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        {uncategorized.length > 0 && !editing && (
          <section className="toc-chapter">
            <div className="toc-chapter-head">
              <span className="toc-num">··</span>
              <h2>Ohne Kategorie</h2>
              <span className="toc-count">{uncategorized.length}</span>
            </div>
            <ul className="toc-items">
              {uncategorized.map((r) => (
                <li key={r.id}>
                  <button onClick={() => navigate(`/buch/${r.id}`)}>
                    <span className="toc-title">{r.title}</span>
                    <span className="toc-dots" aria-hidden="true" />
                    <span className="toc-page">{pageOf.get(r.id)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
