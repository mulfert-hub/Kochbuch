// Zuschneiden eines Screenshots (z. B. Statusleiste, Werbung oder Navigationsleiste entfernen).
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CropRect } from '../ocr/preprocess';
import { Icon } from './Icon';

type Handle = 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se' | 'move';
const MIN = 0.08;

export function CropDialog({ url, initial, onDone, onCancel }: { url: string; initial: CropRect | null; onDone: (c: CropRect | null) => void; onCancel: () => void }) {
  const [crop, setCrop] = useState<CropRect>(initial ?? { x: 0, y: 0, w: 1, h: 1 });
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ h: Handle; x: number; y: number; start: CropRect } | null>(null);

  const down = (h: Handle) => (e: React.PointerEvent) => {
    e.stopPropagation();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignorieren */
    }
    drag.current = { h, x: e.clientX, y: e.clientY, start: crop };
  };
  const moveP = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = box.current;
    if (!d || !el) return;
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - d.x) / r.width;
    const dy = (e.clientY - d.y) / r.height;
    let { x, y, w, h } = d.start;
    if (d.h === 'move') {
      x = Math.min(1 - w, Math.max(0, x + dx));
      y = Math.min(1 - h, Math.max(0, y + dy));
    } else {
      if (d.h.includes('w')) {
        const nx = Math.min(x + w - MIN, Math.max(0, x + dx));
        w += x - nx;
        x = nx;
      }
      if (d.h.includes('e')) w = Math.min(1 - x, Math.max(MIN, w + dx));
      if (d.h.includes('n')) {
        const ny = Math.min(y + h - MIN, Math.max(0, y + dy));
        h += y - ny;
        y = ny;
      }
      if (d.h.includes('s')) h = Math.min(1 - y, Math.max(MIN, h + dy));
    }
    setCrop({ x, y, w, h });
  };
  const up = () => (drag.current = null);

  const isFull = crop.x < 0.005 && crop.y < 0.005 && crop.w > 0.99 && crop.h > 0.99;
  const handles: Handle[] = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];

  return createPortal(
    <div className="crop-overlay" role="dialog" aria-label="Bild zuschneiden">
      <div className="crop-head">
        <button className="btn btn-ghost" onClick={onCancel}>
          Abbrechen
        </button>
        <strong>Zuschneiden</strong>
        <button className="btn btn-primary" onClick={() => onDone(isFull ? null : crop)}>
          Fertig
        </button>
      </div>
      <p className="crop-hint">Ziehe die Ecken, damit nur das Rezept im Rahmen ist.</p>
      <div className="crop-area">
        <div className="crop-box" ref={box} onPointerMove={moveP} onPointerUp={up} onPointerCancel={up}>
          <img src={url} alt="" draggable={false} />
          <div
            className="crop-rect"
            style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}
            onPointerDown={down('move')}
          >
            {handles.map((h) => (
              <span key={h} className={`crop-handle h-${h}`} onPointerDown={down(h)} />
            ))}
          </div>
        </div>
      </div>
      <div className="crop-foot">
        <button className="btn btn-ghost" onClick={() => setCrop({ x: 0, y: 0, w: 1, h: 1 })}>
          <Icon name="refresh" /> Zurücksetzen
        </button>
        <button className="btn btn-ghost" onClick={() => setCrop({ x: 0, y: 0.06, w: 1, h: 0.88 })}>
          <Icon name="crop" /> Status-/Navileiste weg
        </button>
      </div>
    </div>,
    document.body,
  );
}
