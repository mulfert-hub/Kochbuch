// Wochenplan: sieben Tage, auf einen Tag tippen → Rezept auswählen.
import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { planToShopping, removeFromPlan } from '../db/repo';
import { navigate } from '../router';
import { Icon } from '../components/Icon';
import { PickRecipeSheet } from '../components/PlanSheets';
import { confirmDialog, toast } from '../components/ui';
import { dayKey, dayName, shortDate, weekDays, weekLabel } from '../lib/week';

export function PlanView() {
  const [offset, setOffset] = useState(0);
  const [picking, setPicking] = useState<string | null>(null);
  const days = weekDays(offset);
  const entries = useLiveQuery(() => db.plan.where('date').between(days[0], days[6], true, true).sortBy('order'), [days[0]]);
  const recipeIds = useLiveQuery(async () => new Set((await db.recipes.toCollection().primaryKeys()) as string[]), []);
  const today = dayKey(new Date());
  const count = entries?.length ?? 0;

  return (
    <div className="page plan">
      <div className="page-head">
        <div>
          <div className="eyebrow">{count ? `${count} Essen geplant` : 'Noch nichts geplant'}</div>
          <h1 className="page-title">Wochenplan</h1>
        </div>
      </div>

      <div className="plan-week-nav">
        <button className="icon-btn" onClick={() => setOffset(offset - 1)} aria-label="Vorige Woche">
          <Icon name="back" />
        </button>
        <button className="plan-week-label" onClick={() => setOffset(0)} disabled={offset === 0}>
          <strong>{weekLabel(offset)}</strong>
          <span>
            {shortDate(days[0])} – {shortDate(days[6])}
          </span>
        </button>
        <button className="icon-btn" onClick={() => setOffset(offset + 1)} aria-label="Nächste Woche">
          <Icon name="next" />
        </button>
      </div>

      <ol className="plan-days-list">
        {days.map((d) => {
          const day = (entries ?? []).filter((e) => e.date === d);
          return (
            <li key={d} className={`plan-day${d === today ? ' is-today' : ''}${d < today ? ' is-past' : ''}`}>
              <button className="plan-day-head" onClick={() => setPicking(d)} aria-label={`${dayName(d)}, ${shortDate(d)}: Essen auswählen`}>
                <span className="plan-day-name">
                  <strong>{dayName(d)}</strong>
                  <span>{shortDate(d)}</span>
                </span>
                {day.length === 0 && <span className="plan-empty">Essen auswählen</span>}
                <span className="plan-add">
                  <Icon name="plus" />
                </span>
              </button>
              {day.length > 0 && (
                <ul className="plan-meals">
                  {day.map((e) => {
                    const exists = recipeIds?.has(e.recipeId) ?? true;
                    return (
                      <li key={e.id} className="plan-meal">
                        <button className="plan-meal-title" disabled={!exists} onClick={() => navigate(`/rezepte/${e.recipeId}`)}>
                          {e.title || 'Ohne Titel'}
                          {!exists && <span className="muted"> (nicht mehr im Kochbuch)</span>}
                        </button>
                        <button className="icon-btn sm" onClick={() => removeFromPlan(e.id)} aria-label={`${e.title} aus dem Plan nehmen`}>
                          <Icon name="close" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>

      {count > 0 && (
        <button
          className="btn btn-block plan-shop"
          onClick={async () => {
            const ok = await confirmDialog({
              title: 'Auf die Einkaufsliste?',
              text: `Die Zutaten aller ${count} Essen dieser Woche kommen auf die Einkaufsliste. Gleiche Zutaten werden zusammengefasst.`,
              confirm: 'Hinzufügen',
            });
            if (!ok) return;
            const n = await planToShopping(entries ?? []);
            toast(`Zutaten von ${n} Rezept${n === 1 ? '' : 'en'} auf der Einkaufsliste`);
          }}
        >
          <Icon name="cart" /> Zutaten der Woche auf die Einkaufsliste
        </button>
      )}

      {picking && <PickRecipeSheet date={picking} onClose={() => setPicking(null)} />}
    </div>
  );
}
