// Einkaufsliste: zusammengefasste Zutaten abhaken, löschen, Liste leeren, eigene Einträge.
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { addManualShopping, toggleShopping } from '../db/repo';
import { displayItem } from '../lib/shopping';
import { formatQuantity } from '../lib/quantity';
import { unitLabel } from '../lib/units';
import { Icon } from '../components/Icon';
import { confirmDialog } from '../components/ui';
import { navigate } from '../router';
import type { ShoppingItem } from '../types';

function Row({ item }: { item: ShoppingItem }) {
  const d = displayItem(item);
  const amount = d.quantity != null ? `${formatQuantity(d.quantity, d.unit)} ${unitLabel(d.unit, d.quantity)}`.trim() : '';
  return (
    <li className={`shop-item${item.checked ? ' is-checked' : ''}`}>
      <button className="shop-check" onClick={() => toggleShopping(item)} aria-pressed={item.checked} aria-label={`${item.name} abhaken`}>
        <span className={`checkbox${item.checked ? ' is-checked' : ''}`} aria-hidden="true">
          {item.checked && <Icon name="check" />}
        </span>
        <span className="shop-text">
          <span className="shop-name">{item.name}</span>
          {item.sources.length > 0 && <span className="shop-src">{item.sources.map((s) => s.title).join(' · ')}</span>}
        </span>
        {amount && <span className="shop-amount">{amount}</span>}
      </button>
      <button className="icon-btn sm" onClick={() => db.shopping.delete(item.id)} aria-label={`${item.name} löschen`}>
        <Icon name="close" />
      </button>
    </li>
  );
}

export function ShoppingView() {
  const items = useLiveQuery(() => db.shopping.orderBy('order').toArray(), []);
  const [text, setText] = useState('');
  if (!items) return null;
  const open = items.filter((i) => !i.checked);
  const done = items.filter((i) => i.checked);

  return (
    <div className="page shopping">
      <div className="page-head">
        <div>
          <div className="eyebrow">{open.length} offen{done.length ? ` · ${done.length} erledigt` : ''}</div>
          <h1 className="page-title">Einkauf</h1>
        </div>
        {items.length > 0 && (
          <button
            className="btn btn-ghost"
            onClick={async () => {
              if (await confirmDialog({ title: 'Liste leeren?', text: 'Alle Einträge werden entfernt.', confirm: 'Leeren', danger: true })) await db.shopping.clear();
            }}
          >
            <Icon name="trash" /> Leeren
          </button>
        )}
      </div>

      <form
        className="shop-add"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          await addManualShopping(text.trim());
          setText('');
        }}
      >
        <input className="input" placeholder="Hinzufügen, z. B. „2 Zitronen“" value={text} onChange={(e) => setText(e.target.value)} aria-label="Eintrag hinzufügen" enterKeyHint="done" />
        <button className="icon-btn btn-primary-icon" type="submit" aria-label="Hinzufügen" disabled={!text.trim()}>
          <Icon name="plus" />
        </button>
      </form>

      {items.length === 0 ? (
        <div className="empty">
          <h2>Alles da</h2>
          <p>Öffne ein Rezept und tippe auf „Auf die Einkaufsliste“, oder wähle in der Rezeptliste mehrere Rezepte aus.</p>
          <button className="btn" onClick={() => navigate('/rezepte')}>
            <Icon name="list" /> Zu den Rezepten
          </button>
        </div>
      ) : (
        <>
          <ul className="shop-list">
            {open.map((i) => (
              <Row key={i.id} item={i} />
            ))}
          </ul>
          {done.length > 0 && (
            <>
              <div className="shop-done-head">
                <span className="eyebrow">Im Korb</span>
                <button className="btn btn-ghost" onClick={() => db.shopping.bulkDelete(done.map((d) => d.id))}>
                  Erledigte entfernen
                </button>
              </div>
              <ul className="shop-list">
                {done.map((i) => (
                  <Row key={i.id} item={i} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
