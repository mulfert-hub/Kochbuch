// Import: Screenshots wählen (Datei, Drag & Drop, Einfügen, Teilen), optional zuschneiden, OCR starten.
import { useEffect, useRef, useState } from 'react';
import { navigate } from '../router';
import { Icon } from '../components/Icon';
import { CropDialog } from '../components/CropDialog';
import { Lightbox } from '../components/Lightbox';
import { toast } from '../components/ui';
import { addFiles, moveImage, removeImage, runOcr, setCrop, setMode, startManual, useImport } from '../ocr/importStore';
import { takeSharedFiles } from '../ocr/share';
import { preprocessImage } from '../ocr/preprocess';
import { linesFromPlainText, parseRecipe } from '../lib/recipeParser';
import type { PendingImage } from '../ocr/importStore';

function PreviewProcessed({ img, onClose }: { img: PendingImage; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    preprocessImage(img.file, { crop: img.crop }).then(({ canvas }) =>
      canvas.toBlob((b) => {
        if (b) setUrl((u = URL.createObjectURL(b)));
      }),
    );
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [img]);
  return url ? <Lightbox src={url} onClose={onClose} /> : null;
}

export function ImportView({ shared }: { shared?: boolean }) {
  const st = useImport();
  const input = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [cropping, setCropping] = useState<PendingImage | null>(null);
  const [preview, setPreview] = useState<PendingImage | null>(null);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');

  // Texterkennung schon mal im Hintergrund laden, sobald Bilder gewählt wurden
  const hasImages = st.images.length > 0;
  useEffect(() => {
    if (hasImages) import('../ocr/ocr').then((m) => m.warmUpOcr()).catch(() => {});
  }, [hasImages]);

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

  const fromText = () => {
    const d = parseRecipe(linesFromPlainText(pasteText));
    startManual(d);
    navigate('/import/pruefen');
  };

  return (
    <div className="page import">
      <div className="page-head">
        <div>
          <div className="eyebrow">Neues Rezept</div>
          <h1 className="page-title">Importieren</h1>
          <p className="lede">Screenshots werden direkt auf deinem Gerät gelesen. Nichts verlässt dein Handy.</p>
        </div>
      </div>

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
                  <button className="icon-btn sm" onClick={() => setPreview(img)} aria-label="Aufbereitetes Bild ansehen" title="So sieht die Texterkennung das Bild">
                    <Icon name="sparkle" />
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
          <Icon name="sparkle" /> {st.running ? 'Erkenne Text …' : 'Text erkennen'}
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
          <button className="btn btn-primary" onClick={fromText} disabled={!pasteText.trim()}>
            Auswerten
          </button>
        </div>
      )}

      <div className="tips">
        <h2>Tipps für gute Erkennung</h2>
        <ul>
          <li>Mit eigenem Claude-Schlüssel (Mehr → Rezepterkennung) werden auch schwierige Vorlagen zuverlässig gelesen.</li>
          <li>Screenshot in voller Auflösung, nicht gezoomt oder verkleinert.</li>
          <li>Lange Rezepte: mehrere Screenshots nacheinander auswählen und „Ein Rezept“ wählen. Überlappungen werden erkannt.</li>
          <li>Werbung, Fotos und Menüleisten mit „Zuschneiden“ entfernen.</li>
          <li>Dunkle Screenshots (Dark Mode) werden automatisch umgekehrt.</li>
          <li>Kochbuchseite fotografieren: gerade von oben, gutes Licht, ohne Schatten, danach zuschneiden.</li>
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
      {preview && <PreviewProcessed img={preview} onClose={() => setPreview(null)} />}
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
