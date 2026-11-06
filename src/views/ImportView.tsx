// Import: Screenshots wählen (Datei, Drag & Drop, Einfügen, Teilen), optional zuschneiden, OCR starten.
import { useEffect, useRef, useState } from 'react';
import { navigate } from '../router';
import { Icon } from '../components/Icon';
import { CropDialog } from '../components/CropDialog';
import { toast } from '../components/ui';
import { addFiles, moveImage, NO_KEY_MESSAGE, removeImage, runOcr, runText, setCrop, setMode, startManual, useImport } from '../ocr/importStore';
import { claudeConfigured } from '../ai/claudeRecipe';
import { takeSharedFiles } from '../ocr/share';
import type { PendingImage } from '../ocr/importStore';

export function ImportView({ shared }: { shared?: boolean }) {
  const st = useImport();
  const input = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [cropping, setCropping] = useState<PendingImage | null>(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const hasKey = claudeConfigured();

  // Über „Teilen“ empfangene Bilder abholen
  useEffect(() => {
    if (!shared) return;
    takeSharedFiles().then((files) => {
      const n = addFiles(files);
      if (n) toast(`${n} geteilte${n === 1 ? 's Bild' : ' Bilder'} übernommen`);
      navigate('/import', { replace: true });
    });
  }, [shared]);

  // Bilder aus der Zwischenablage einfügen (Strg+V / Einfügen)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) {
        e.preventDefault();
        addFiles(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const start = async () => {
    const ok = await runOcr();
    if (ok) navigate('/import/pruefen');
  };

  const fromText = async () => {
    const ok = await runText(pasteText);
    if (ok) navigate('/import/pruefen');
  };

  return (
    <div className="page import">
      <div className="page-head">
        <div>
          <div className="eyebrow">Neues Rezept</div>
          <h1 className="page-title">Importieren</h1>
          <p className="lede">Claude liest Screenshots und Fotos und macht daraus ein Rezept zum Prüfen.</p>
        </div>
      </div>

      {!hasKey && (
        <div className="notice">
          <p>{NO_KEY_MESSAGE}</p>
          <button className="btn" onClick={() => navigate('/mehr')}>
            Zu den Einstellungen
          </button>
        </div>
      )}

      <div
        className={`dropzone${over ? ' is-over' : ''}${st.images.length ? ' has-images' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const n = addFiles(Array.from(e.dataTransfer.files));
          if (!n) toast('Bitte nur Bilddateien ablegen');
        }}
      >
        {st.images.length === 0 ? (
          <button className="dropzone-empty" onClick={() => input.current?.click()}>
            <span className="dropzone-icon">
              <Icon name="upload" />
            </span>
            <strong>Screenshots auswählen</strong>
            <span>oder hierher ziehen · mehrere möglich</span>
          </button>
        ) : (
          <div className="pending-grid">
            {st.images.map((img, i) => (
              <figure key={img.id} className="pending">
                <img src={img.url} alt={`Screenshot ${i + 1}`} style={img.crop ? cropStyle(img) : undefined} />
                <span className="pending-no">{i + 1}</span>
                {img.crop && <span className="pending-badge">zugeschnitten</span>}
                <figcaption>
                  <button className="icon-btn sm" onClick={() => setCropping(img)} aria-label="Zuschneiden" disabled={st.running}>
                    <Icon name="crop" />
                  </button>
                  <button className="icon-btn sm" onClick={() => moveImage(img.id, -1)} aria-label="Nach vorne" disabled={i === 0 || st.running}>
                    <Icon name="back" />
                  </button>
                  <button className="icon-btn sm" onClick={() => removeImage(img.id)} aria-label="Entfernen" disabled={st.running}>
                    <Icon name="trash" />
                  </button>
                </figcaption>
              </figure>
            ))}
            <button className="pending pending-add" onClick={() => input.current?.click()} disabled={st.running}>
              <Icon name="plus" />
              <span>Weitere</span>
            </button>
          </div>
        )}
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </div>

      {st.images.length > 1 && (
        <div className="segmented" role="radiogroup" aria-label="Wie sollen die Bilder verarbeitet werden?">
          <button role="radio" aria-checked={st.mode === 'single'} onClick={() => setMode('single')} disabled={st.running}>
            <strong>Ein Rezept</strong>
            <span>Bilder gehören zusammen</span>
          </button>
          <button role="radio" aria-checked={st.mode === 'each'} onClick={() => setMode('each')} disabled={st.running}>
            <strong>{st.images.length} Rezepte</strong>
            <span>Jedes Bild einzeln</span>
          </button>
        </div>
      )}

      {st.running && (
        <div className="ocr-progress" aria-live="polite">
          <div className="progress">
            <i style={{ width: `${Math.round(st.progress * 100)}%` }} />
          </div>
          <span>{st.status}</span>
        </div>
      )}
      {st.error && <p className="error">{st.error}</p>}

      {st.images.length > 0 && (
        <button className="btn btn-primary btn-block btn-lg" onClick={start} disabled={st.running}>
          <Icon name="sparkle" /> {st.running ? 'Claude liest …' : 'Rezept erkennen'}
        </button>
      )}

      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          addFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <div className="import-alt">
        <button className="btn btn-ghost" onClick={() => cameraInput.current?.click()} disabled={st.running}>
          <Icon name="camera" /> Foto aufnehmen
        </button>
        <button className="btn btn-ghost" onClick={() => setPasteMode(!pasteMode)}>
          <Icon name="text" /> Text einfügen
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => {
            startManual({ title: '', servings: 4, servingsLabel: 'Portionen', ingredients: [], steps: [''], categoryIds: [], ocrText: '' });
            navigate('/import/pruefen');
          }}
        >
          <Icon name="edit" /> Von Hand anlegen
        </button>
      </div>

      {pasteMode && (
        <div className="paste-box">
          <textarea
            className="textarea"
            rows={8}
            placeholder={'Rezepttext hier einfügen …\n\nTitel\nZutaten\n200 g Mehl\n…\nZubereitung\n1. …'}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <button className="btn btn-primary" onClick={fromText} disabled={!pasteText.trim() || st.running}>
            Auswerten
          </button>
        </div>
      )}

      <div className="tips">
        <h2>Tipps für gute Erkennung</h2>
        <ul>
          <li>Lange Rezepte: alle Screenshots auf einmal auswählen und „Ein Rezept“ wählen – Claude fügt sie zusammen.</li>
          <li>Mehrere verschiedene Rezepte auf einmal: „Jedes Bild einzeln“ wählen.</li>
          <li>Kochbuchseite fotografieren: möglichst gerade, gutes Licht. Mit „Zuschneiden“ nur das Rezept einrahmen.</li>
          <li>Die Bilder werden zur Erkennung an Anthropic (Claude) geschickt.</li>
        </ul>
      </div>

      {cropping && (
        <CropDialog
          url={cropping.url}
          initial={cropping.crop}
          onCancel={() => setCropping(null)}
          onDone={(c) => {
            setCrop(cropping.id, c);
            setCropping(null);
          }}
        />
      )}
    </div>
  );
}

// Vorschau zeigt nur den zugeschnittenen Bereich
function cropStyle(img: PendingImage): React.CSSProperties {
  const c = img.crop!;
  return {
    objectViewBox: `inset(${c.y * 100}% ${(1 - c.x - c.w) * 100}% ${(1 - c.y - c.h) * 100}% ${c.x * 100}%)`,
  } as React.CSSProperties;
}
