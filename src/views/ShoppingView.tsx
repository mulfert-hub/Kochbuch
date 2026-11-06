// Einkaufsliste: zusammengefasste Zutaten abhaken, löschen, Liste leeren, eigene Einträge.
import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { addManualShopping, clearShopping, deleteShopping, toggleShopping } from '../db/repo';
import { displayItem } from '../lib/shopping';
import { formatQuantity } from '../lib/quantity';
import { unitLabel } from '../lib/units';
import { Icon } from '../components/Icon';
import { confirmDialog, toast } from '../components/ui';
import { listenOnce, speechSupported } from '../cook/voice';
import { parseSpokenList } from '../lib/spoken';
import { navigate } from '../router';
import type { ShoppingItem } from '../types';
import { AISLES, aisleFor, getAisleOverrides, setAisleOverride, type AisleId } from '../lib/aisles';

function AislePicker({ item, onClose }: { item: ShoppingItem; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);
  const current = (item.aisle as AisleId | undefined) ?? aisleFor(item.name);
  return (
    <dialog ref={ref} className="dialog" onCancel={onClose} onClose={onClose}>
      <div className="dialog-body">
        <h2>Abteilung für „{item.name}“</h2>
        <p>Die App merkt sich das für künftige Einträge.</p>
      </div>
      <div className="aisle-options">
        {AISLES.map((a) => (
          <button
            key={a.id}
            className={`chip${a.id === current ? ' is-current' : ''}`}
            aria-pressed={a.id === current}
            onClick={async () => {
              setAisleOverride(item.name, a.id);
              await db.shopping.update(item.id, { aisle: a.id });
              onClose();
            }}
          >
            {a.name}
          </button>
        ))}
      </div>
      <div className="dialog-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          Abbrechen
        </button>
      </div>
    </dialog>
  );
}

function Row({ item, onAisle }: { item: ShoppingItem; onAisle?: () => void }) {
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
      {onAisle && (
        <button className="icon-btn sm" onClick={onAisle} aria-label={`Abteilung für ${item.name} ändern`} title="Abteilung ändern">
          <Icon name="drag" />
        </button>
      )}
      <button className="icon-btn sm" onClick={() => deleteShopping([item.id])} aria-label={`${item.name} löschen`}>
        <Icon name="close" />
      </button>
    </li>
  );
}

export function ShoppingView() {
  const items = useLiveQuery(() => db.shopping.orderBy('order').toArray(), []);
  const [text, setText] = useState('');
  const [picking, setPicking] = useState<ShoppingItem | null>(null);
  const [listening, setListening] = useState(false);
  if (!items) return null;
  const open = items.filter((i) => !i.checked);
  // Offene Einträge nach Abteilungen in Laufreihenfolge gruppieren
  const overrides = getAisleOverrides();
  const groups = AISLES.map((a) => ({ ...a, items: open.filter((i) => ((i.aisle as AisleId | undefined) ?? aisleFor(i.name, overrides)) === a.id) })).filter((g) => g.items.length);
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
              if (await confirmDialog({ title: 'Liste leeren?', text: 'Alle Einträge werden entfernt.', confirm: 'Leeren', danger: true })) await clearShopping();
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
        {speechSupported() && (
          <button
            type="button"
            className={`icon-btn voice-btn${listening ? ' is-listening' : ''}`}
            aria-label="Per Sprache hinzufügen"
            disabled={listening}
            onClick={async () => {
              setListening(true);
              try {
                const said = await listenOnce();
                const entries = parseSpokenList(said);
                for (const e of entries) await addManualShopping(e);
                toast(entries.length ? `${entries.length} ${entries.length === 1 ? 'Eintrag' : 'Einträge'} hinzugefügt: ${entries.join(', ')}` : 'Nichts verstanden');
              } catch (e) {
                toast((e as Error).message);
              } finally {
                setListening(false);
              }
            }}
          >
            <Icon name="mic" />
          </button>
        )}
        <button className="icon-btn btn-primary-icon" type="submit" aria-label="Hinzufügen" disabled={!text.trim()}>
          <Icon name="plus" />
        </button>
      </form>
      {listening && <p className="hint voice-hint">Ich höre zu … z. B. „Milch, zwei Zitronen und Butter“</p>}

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
          {groups.map((g) => (
            <section key={g.id} className="shop-aisle">
              <h2 className="shop-aisle-title">{g.name}</h2>
              <ul className="shop-list">
                {g.items.map((i) => (
                  <Row key={i.id} item={i} onAisle={() => setPicking(i)} />
                ))}
              </ul>
            </section>
          ))}
          {done.length > 0 && (
            <>
              <div className="shop-done-head">
                <span className="eyebrow">Im Korb</span>
                <button className="btn btn-ghost" onClick={() => deleteShopping(done.map((d) => d.id))}>
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
      {picking && <AislePicker item={picking} onClose={() => setPicking(null)} />}
    </div>
  );
}
