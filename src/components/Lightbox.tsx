import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useStoredImage } from './ui';

export function Lightbox({ imageId, src, onClose }: { imageId?: string; src?: string; onClose: () => void }) {
  const stored = useStoredImage(imageId);
  const url = src ?? stored;
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return createPortal(
    <div className="lightbox" onClick={onClose} role="dialog" aria-label="Bild">
      <button className="icon-btn lightbox-close" onClick={onClose} aria-label="Schließen">
        <Icon name="close" />
      </button>
      {url && <img src={url} alt="Original-Screenshot" onClick={(e) => e.stopPropagation()} />}
    </div>,
    document.body,
  );
}
