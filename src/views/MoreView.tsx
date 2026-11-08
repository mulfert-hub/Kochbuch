// Backup (Export/Import), Beispieldaten, OCR offline bereitstellen, Speicherinfo.
import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { addTombstones, db, tombstoneRecipes } from '../db/db';
import { downloadBackup, restoreBackup } from '../db/backup';
import { seedSampleRecipes } from '../db/seed';
import { Icon } from '../components/Icon';
import { getTheme, setTheme, type ThemeChoice } from '../theme';
import { APP_BUILD_TIME, APP_VERSION, checkForUpdate } from '../update';
import { connect, disconnect, syncNow, useSyncStatus } from '../sync/sync';
import { CLAUDE_MODELS, getApiKey, getModel, setApiKey, setModel, testApiKey, type ClaudeModel } from '../ai/claudeRecipe';
import { choiceDialog, confirmDialog, toast } from '../components/ui';
import { updateRecipe } from '../db/repo';
import { setTagMeaning } from '../db/db';
import { allTags } from '../lib/search';
import { GENERAL_TAGS, type TagInfoMap } from '../lib/tags';
import { claudeConfigured } from '../ai/claudeRecipe';
import type { Recipe } from '../types';

function fmtBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

function ClaudeCard() {
  const [key, setKey] = useState(getApiKey());
  const [saved, setSaved] = useState(!!getApiKey());
  const [model, setModelState] = useState<ClaudeModel>(getModel());
  const [busy, setBusy] = useState(false);
  return (
    <section className="more-card card">
      <h2>Rezepterkennung mit Claude</h2>
      <p>
        Claude von Anthropic liest eure Screenshots, Fotos und eingefügten Texte. Dafür braucht es euren eigenen API-Schlüssel. Die Bilder werden zur
        Erkennung an Anthropic geschickt. Der Schlüssel bleibt auf diesem Handy und wird nicht synchronisiert.
      </p>
      {saved ? (
        <>
          <p className="sync-state">Aktiv. Screenshots und Texte werden von Claude gelesen (dafür ist Internet nötig).</p>
          <div className="segmented theme-switch claude-models" role="radiogroup" aria-label="Modell">
            {CLAUDE_MODELS.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={model === m.id}
                onClick={() => {
                  setModel(m.id);
                  setModelState(m.id);
                }}
              >
                <strong>{m.label}</strong>
                <span>{m.hint}</span>
              </button>
            ))}
          </div>
          <div className="more-actions">
            <button
              className="btn btn-ghost"
              onClick={async () => {
                if (await confirmDialog({ title: 'Schlüssel entfernen?', text: 'Ohne Schlüssel können keine Screenshots mehr eingelesen werden. Von Hand anlegen geht weiterhin.', confirm: 'Entfernen' })) {
                  setApiKey('');
                  setKey('');
                  setSaved(false);
                }
              }}
            >
              Schlüssel entfernen
            </button>
          </div>
        </>
      ) : (
        <div className="sync-setup">
          <label className="field">
            <span>Anthropic-API-Schlüssel</span>
            <input
              className="input mono"
              type="password"
              autoComplete="off"
              placeholder="sk-ant-…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </label>
          <p className="hint">
            Erstellen unter console.anthropic.com → API Keys. Dort am besten ein monatliches Ausgabenlimit setzen.
          </p>
          <div className="more-actions">
            <button
              className="btn btn-primary"
              disabled={busy || !key.trim().startsWith('sk-ant-')}
              onClick={async () => {
                setBusy(true);
                const r = await testApiKey(key.trim());
                setBusy(false);
                if (r === 'invalid') return toast('Der Schlüssel wurde von Anthropic abgelehnt');
                if (r === 'error') toast('Konnte den Schlüssel nicht prüfen – er wird trotzdem gespeichert');
                setApiKey(key);
                setSaved(true);
                if (r === 'ok') toast('Schlüssel gespeichert – Claude ist bereit');
              }}
            >
              {busy ? 'Prüfe …' : 'Speichern'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function SyncCard() {
  const st = useSyncStatus();
  const [repo, setRepo] = useState(st.repo);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = st.lastSync ? new Date(st.lastSync).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : null;
  return (
    <section className="more-card card">
      <h2>Synchronisation</h2>
      <p>
        Rezepte, Kategorien, Fotos und die Einkaufsliste über ein <strong>privates</strong> GitHub-Repository zwischen euren Handys abgleichen. Einrichtung
        siehe README.
      </p>
      {st.enabled ? (
        <>
          <p className={`sync-state${st.error ? ' is-error' : ''}`}>
            {st.running ? 'Gleiche ab …' : st.message ?? (last ? `Zuletzt abgeglichen: ${last}` : 'Noch nicht abgeglichen.')}
          </p>
          <p className="hint">Repository: {st.repo}</p>
          <div className="more-actions">
            <button className="btn btn-primary" disabled={st.running} onClick={() => syncNow()}>
              <Icon name="refresh" /> Jetzt abgleichen
            </button>
            <button
              className="btn btn-ghost"
              onClick={async () => {
                if (await confirmDialog({ title: 'Synchronisation ausschalten?', text: 'Die Rezepte bleiben auf diesem Handy und im Repository erhalten. Der Token wird von diesem Handy gelöscht.', confirm: 'Ausschalten' })) disconnect();
              }}
            >
              Ausschalten
            </button>
          </div>
        </>
      ) : (
        <div className="sync-setup">
          <label className="field">
            <span>Daten-Repository</span>
            <input className="input mono" placeholder="benutzer/kochbuch-daten" autoCapitalize="off" autoCorrect="off" value={repo} onChange={(e) => setRepo(e.target.value)} />
          </label>
          <label className="field">
            <span>GitHub-Token</span>
            <input className="input mono" type="password" autoComplete="off" placeholder="github_pat_…" value={token} onChange={(e) => setToken(e.target.value)} />
          </label>
          {error && <p className="sync-state is-error">{error}</p>}
          <div className="more-actions">
            <button
              className="btn btn-primary"
              disabled={busy || !repo.trim() || token.trim().length < 20}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await connect(repo, token);
                  setToken('');
                  toast('Synchronisation eingerichtet');
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Icon name="refresh" /> {busy ? 'Prüfe …' : 'Verbinden'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Eigene Tags erklären (damit Claude sie passend vergeben kann) und bestehende Rezepte verschlagworten */
function TagsCard() {
  const recipes = useLiveQuery(() => db.recipes.toArray(), []);
  const info = useLiveQuery(async () => ((await db.settings.get('tagInfo'))?.value as TagInfoMap | undefined) ?? {}, []);
  const tags = allTags(recipes ?? []);
  const personal = tags.filter((t) => !GENERAL_TAGS.some((g) => g.toLowerCase() === t.toLowerCase()));
  const [busy, setBusy] = useState<string | null>(null);
  const [proposal, setProposal] = useState<{ recipe: Recipe; tags: string[]; on: boolean }[] | null>(null);
  const [newTag, setNewTag] = useState('');

  const suggest = async () => {
    if (!recipes?.length) return;
    setBusy('Claude liest die Rezepte …');
    try {
      const { suggestTagsForRecipes } = await import('../ai/claudeAssist');
      const map = await suggestTagsForRecipes(recipes, (n) => setBusy(`Claude liest die Rezepte … ${n} von ${recipes.length}`));
      const list = recipes.filter((r) => map.has(r.id)).map((r) => ({ recipe: r, tags: map.get(r.id)!, on: true }));
      if (!list.length) toast('Claude hat keine neuen Tags gefunden');
      setProposal(list.length ? list : null);
    } catch (e) {
      toast((e as Error).message || 'Claude konnte keine Tags vorschlagen');
    } finally {
      setBusy(null);
    }
  };

  const apply = async () => {
    if (!proposal) return;
    const chosen = proposal.filter((p) => p.on);
    for (const p of chosen) await updateRecipe(p.recipe.id, { tags: [...(p.recipe.tags ?? []), ...p.tags] });
    setProposal(null);
    toast(`Tags bei ${chosen.length} Rezept${chosen.length === 1 ? '' : 'en'} ergänzt`);
  };

  return (
    <section className="more-card card tags-card">
      <h2>Tags</h2>
      <p>
        Claude schlägt beim Einlesen 3–5 Tags vor. Allgemeine Tags wie „vegetarisch“ oder „schnell“ kennt Claude. Eure eigenen Tags (z. B. „Thea“)
        vergibt Claude nur, wenn hier steht, was sie bedeuten.
      </p>
      {personal.map((t) => (
        <MeaningRow key={t} tag={t} value={info?.[t]?.desc ?? ''} />
      ))}
      <form
        className="link-row"
        onSubmit={(e) => {
          e.preventDefault();
          const v = newTag.trim().replace(/^#/, '');
          if (!v) return;
          void setTagMeaning(v, info?.[v]?.desc ?? '');
          setNewTag('');
        }}
      >
        <input className="input" placeholder="Eigenen Tag hinzufügen, z. B. Thea" value={newTag} onChange={(e) => setNewTag(e.target.value)} aria-label="Eigenen Tag hinzufügen" />
        <button className="btn" type="submit" disabled={!newTag.trim()}>
          <Icon name="plus" /> Hinzufügen
        </button>
      </form>
      {Object.keys(info ?? {})
        .filter((t) => !tags.some((x) => x.toLowerCase() === t.toLowerCase()))
        .map((t) => (
          <MeaningRow key={t} tag={t} value={info?.[t]?.desc ?? ''} />
        ))}

      <div className="more-actions">
        <button className="btn btn-primary" onClick={suggest} disabled={!!busy || !recipes?.length || !claudeConfigured()}>
          <Icon name="sparkle" /> {busy ?? 'Tags für bestehende Rezepte vorschlagen'}
        </button>
      </div>
      {!claudeConfigured() && <p className="hint">Dafür zuerst oben den Claude-Schlüssel eintragen.</p>}

      {proposal && (
        <div className="tag-proposal">
          <p className="hint">Vorschläge – Häkchen entfernen, was nicht passt:</p>
          <ul>
            {proposal.map((p, i) => (
              <li key={p.recipe.id}>
                <label>
                  <input type="checkbox" checked={p.on} onChange={() => setProposal(proposal.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} />
                  <span>
                    <strong>{p.recipe.title || 'Ohne Titel'}</strong> {p.tags.map((t) => `#${t}`).join(' ')}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="more-actions">
            <button className="btn btn-primary" onClick={apply} disabled={!proposal.some((p) => p.on)}>
              Übernehmen
            </button>
            <button className="btn btn-ghost" onClick={() => setProposal(null)}>
              Verwerfen
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function MeaningRow({ tag, value }: { tag: string; value: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <label className="field">
      <span>#{tag} bedeutet …</span>
      <input
        className="input"
        placeholder="z. B. mild, ohne Alkohol – leer lassen: Claude vergibt den Tag nicht"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text.trim() !== value && void setTagMeaning(tag, text)}
      />
    </label>
  );
}

/** Kategorien: Anzahl + Weg zur Verwaltung (anlegen, umbenennen, sortieren, löschen) */
function CategoriesCard() {
  const cats = useLiveQuery(() => db.categories.orderBy('order').toArray(), []);
  return (
    <section className="more-card card">
      <h2>Kategorien</h2>
      <p>
        {cats?.length ? cats.map((c) => c.name).join(' · ') : 'Noch keine Kategorien.'} Neue Kategorien, Namen und Reihenfolge werden mit
        synchronisiert.
      </p>
      <div className="more-actions">
        <a className="btn btn-primary" href="#/inhalt?bearbeiten">
          <Icon name="edit" /> Kategorien bearbeiten
        </a>
      </div>
    </section>
  );
}

export function MoreView() {
  const counts = useLiveQuery(async () => ({ r: await db.recipes.count(), i: await db.images.count() }), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [storage, setStorage] = useState<{ usage: number; quota: number; persisted: boolean } | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const [theme, setThemeState] = useState<ThemeChoice>(getTheme());

  useEffect(() => {
    (async () => {
      const est = await navigator.storage?.estimate?.();
      const persisted = (await navigator.storage?.persisted?.()) ?? false;
      if (est) setStorage({ usage: est.usage ?? 0, quota: est.quota ?? 0, persisted });
    })();
  }, [counts]);

  const doExport = async () => {
    setBusy('export');
    try {
      await downloadBackup();
    } catch (e) {
      toast('Export fehlgeschlagen');
      console.error(e);
    } finally {
      setBusy(null);
    }
  };

  const doImport = async (f: File) => {
    const choice = await choiceDialog({
      title: 'Backup einspielen',
      text: '„Zusammenführen“ behält deine aktuellen Rezepte und ergänzt die aus dem Backup. „Ersetzen“ löscht zuerst alles auf diesem Gerät.',
      alt: 'Ersetzen',
      confirm: 'Zusammenführen',
    });
    if (!choice) return;
    const replace = choice === 'alt';
    setBusy('import');
    try {
      const res = await restoreBackup(f, replace ? 'replace' : 'merge');
      toast(`${res.recipes} Rezepte und ${res.images} Bilder ${replace ? 'wiederhergestellt' : 'zusammengeführt'}`);
    } catch (e) {
      toast((e as Error).message || 'Import fehlgeschlagen');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page more">
      <div className="page-head">
        <div>
          <div className="eyebrow">Einstellungen</div>
          <h1 className="page-title">Mehr</h1>
        </div>
      </div>

      <section className="more-card card">
        <h2>Aussehen</h2>
        <p>Hell, dunkel oder automatisch wie dein Handy.</p>
        <div className="segmented theme-switch" role="radiogroup" aria-label="Farbschema">
          {(
            [
              ['light', 'Hell'],
              ['dark', 'Dunkel'],
              ['system', 'Automatisch'],
            ] as [ThemeChoice, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              role="radio"
              aria-checked={theme === v}
              onClick={() => {
                setTheme(v);
                setThemeState(v);
              }}
            >
              <strong>{label}</strong>
            </button>
          ))}
        </div>
      </section>

      <ClaudeCard />

      <CategoriesCard />

      <TagsCard />

      <SyncCard />

      <section className="more-card card">
        <h2>Backup</h2>
        <p>
          Deine Rezepte liegen nur auf diesem Gerät. Sichere sie regelmäßig als Datei (inkl. Bilder), z. B. in iCloud Drive oder Google Drive. Aktuell:{' '}
          <strong>{counts?.r ?? '–'} Rezepte</strong>, <strong>{counts?.i ?? '–'} Bilder</strong>.
        </p>
        <div className="more-actions">
          <button className="btn btn-primary" onClick={doExport} disabled={!!busy}>
            <Icon name="download" /> {busy === 'export' ? 'Exportiere …' : 'Backup exportieren'}
          </button>
          <button className="btn" onClick={() => file.current?.click()} disabled={!!busy}>
            <Icon name="upload" /> {busy === 'import' ? 'Importiere …' : 'Backup importieren'}
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) doImport(f);
            }}
          />
        </div>
      </section>


      <section className="more-card card">
        <h2>Speicher</h2>
        <p>
          {storage ? (
            <>
              Belegt: <strong>{fmtBytes(storage.usage)}</strong>
              {storage.quota ? ` von ca. ${fmtBytes(storage.quota)}` : ''}.{' '}
              {storage.persisted ? 'Der Speicher ist als dauerhaft markiert.' : 'Der Browser darf den Speicher bei Platzmangel leeren, darum regelmäßig ein Backup machen.'}
            </>
          ) : (
            'Keine Angaben verfügbar.'
          )}
        </p>
        {storage && !storage.persisted && navigator.storage?.persist && (
          <div className="more-actions">
            <button
              className="btn"
              onClick={async () => {
                const ok = await navigator.storage.persist();
                toast(ok ? 'Speicher ist jetzt dauerhaft' : 'Der Browser hat das abgelehnt (installiere die App aufs Homescreen)');
                setStorage({ ...storage, persisted: ok });
              }}
            >
              Dauerhaft speichern
            </button>
          </div>
        )}
      </section>

      <section className="more-card card">
        <h2>Daten</h2>
        <div className="more-actions">
          <button
            className="btn"
            onClick={async () => {
              const n = await seedSampleRecipes();
              toast(`${n} Beispielrezepte hinzugefügt`);
            }}
          >
            <Icon name="sparkle" /> Beispielrezepte hinzufügen
          </button>
          <button
            className="btn btn-danger"
            onClick={async () => {
              const ok = await confirmDialog({
                title: 'Alles löschen?',
                text: 'Alle Rezepte, Bilder, Kategorien und die Einkaufsliste werden unwiderruflich gelöscht. Mach vorher ein Backup!',
                confirm: 'Alles löschen',
                danger: true,
              });
              if (!ok) return;
              await db.transaction('rw', db.recipes, db.images, db.shopping, db.tombstones, async () => {
                await tombstoneRecipes(await db.recipes.toArray());
                await addTombstones('shopping', (await db.shopping.toCollection().primaryKeys()) as string[]);
                await Promise.all([db.recipes.clear(), db.images.clear(), db.shopping.clear()]);
              });
              toast('Alle Rezepte gelöscht');
            }}
          >
            <Icon name="trash" /> Alle Rezepte löschen
          </button>
        </div>
      </section>

      <section className="more-card card">
        <h2>App-Version</h2>
        <p>
          Version <strong>{APP_VERSION}</strong> vom{' '}
          {new Date(APP_BUILD_TIME).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}. Die App aktualisiert sich normalerweise von
          selbst.
        </p>
        <div className="more-actions">
          <button
            className="btn"
            disabled={busy === 'update'}
            onClick={async () => {
              setBusy('update');
              const r = await checkForUpdate();
              setBusy(null);
              toast(r === 'updated' ? 'Neue Version gefunden – die App startet gleich neu …' : r === 'offline' ? 'Keine Verbindung – bitte später erneut versuchen' : 'Du hast die neueste Version');
            }}
          >
            <Icon name="refresh" /> {busy === 'update' ? 'Suche …' : 'Nach Update suchen'}
          </button>
        </div>
      </section>

      <p className="about">
        Kochbuch · läuft komplett offline · keine Cloud, kein Tracking.
        <br />
        Rezepterkennung: Claude von Anthropic (eigener API-Schlüssel).
      </p>
    </div>
  );
}
