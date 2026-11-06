// Backup (Export/Import), Beispieldaten, OCR offline bereitstellen, Speicherinfo.
import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { downloadBackup, restoreBackup } from '../db/backup';
import { seedSampleRecipes } from '../db/seed';
import { Icon } from '../components/Icon';
import { getTheme, setTheme, type ThemeChoice } from '../theme';
import { APP_BUILD_TIME, APP_VERSION, checkForUpdate } from '../update';
import { choiceDialog, confirmDialog, toast } from '../components/ui';

function fmtBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

export function MoreView() {
  const counts = useLiveQuery(async () => ({ r: await db.recipes.count(), i: await db.images.count() }), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [storage, setStorage] = useState<{ usage: number; quota: number; persisted: boolean } | null>(null);
  const [ocrState, setOcrState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
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
        <h2>Texterkennung offline</h2>
        <p>Die deutsche Texterkennung (ca. 5 MB) wird beim ersten Import geladen und danach auf dem Gerät gespeichert. Du kannst sie hier vorab laden, z. B. im WLAN.</p>
        <div className="more-actions">
          <button
            className="btn"
            disabled={ocrState === 'loading'}
            onClick={async () => {
              setOcrState('loading');
              try {
                await (await import('../ocr/ocr')).warmUpOcr();
                setOcrState('ready');
              } catch {
                setOcrState('error');
              }
            }}
          >
            <Icon name={ocrState === 'ready' ? 'check' : 'download'} />
            {ocrState === 'loading' ? 'Lade …' : ocrState === 'ready' ? 'Bereit' : ocrState === 'error' ? 'Fehler, erneut versuchen' : 'Jetzt laden'}
          </button>
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
              await Promise.all([db.recipes.clear(), db.images.clear(), db.shopping.clear()]);
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
        Texterkennung: Tesseract.js (Apache-2.0).
      </p>
    </div>
  );
}
