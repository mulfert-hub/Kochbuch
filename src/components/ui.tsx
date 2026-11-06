// Kleine gemeinsame UI-Bausteine: Toast, Bestätigungsdialog, Bild-Hook.
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';

// ---------- Toast ----------
let toastMsg: string | null = null;
let toastTimer: number | undefined;
const toastListeners = new Set<() => void>();

export function toast(msg: string) {
  toastMsg = msg;
  toastListeners.forEach((l) => l());
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMsg = null;
    toastListeners.forEach((l) => l());
  }, 2600);
}

export function ToastHost() {
  const msg = useSyncExternalStore(
    (cb) => {
      toastListeners.add(cb);
      return () => toastListeners.delete(cb);
    },
    () => toastMsg,
  );
  return msg ? (
    <div className="toast" role="status">
      {msg}
    </div>
  ) : null;
}

// ---------- Bestätigungsdialog ----------
interface ConfirmReq {
  title: string;
  text?: string;
  confirm?: string;
  danger?: boolean;
  /** Zusätzliche Auswahl (dritter Button). */
  alt?: string;
  resolve: (v: boolean | 'alt') => void;
}
let confirmReq: ConfirmReq | null = null;
const confirmListeners = new Set<() => void>();

export function confirmDialog(opts: Omit<ConfirmReq, 'resolve' | 'alt'>): Promise<boolean> {
  return new Promise((resolve) => {
    confirmReq = { ...opts, resolve: (v) => resolve(v === true) };
    confirmListeners.forEach((l) => l());
  });
}

/** Dialog mit zwei Optionen + Abbrechen. Ergebnis: 'confirm' | 'alt' | null */
export function choiceDialog(opts: Omit<ConfirmReq, 'resolve'> & { alt: string }): Promise<'confirm' | 'alt' | null> {
  return new Promise((resolve) => {
    confirmReq = { ...opts, resolve: (v) => resolve(v === true ? 'confirm' : v === 'alt' ? 'alt' : null) };
    confirmListeners.forEach((l) => l());
  });
}

export function ConfirmHost() {
  const req = useSyncExternalStore(
    (cb) => {
      confirmListeners.add(cb);
      return () => confirmListeners.delete(cb);
    },
    () => confirmReq,
  );
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (req && ref.current && !ref.current.open) ref.current.showModal();
  }, [req]);
  const done = (ok: boolean | 'alt') => {
    req?.resolve(ok);
    confirmReq = null;
    ref.current?.close();
    confirmListeners.forEach((l) => l());
  };
  if (!req) return null;
  return (
    <dialog ref={ref} className="dialog" onCancel={() => done(false)}>
      <div className="dialog-body">
        <h2>{req.title}</h2>
        {req.text && <p>{req.text}</p>}
      </div>
      <div className="dialog-actions">
        <button className="btn btn-ghost" onClick={() => done(false)}>
          Abbrechen
        </button>
        {req.alt && (
          <button className="btn" onClick={() => done('alt')}>
            {req.alt}
          </button>
        )}
        <button className={`btn ${req.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => done(true)} autoFocus>
          {req.confirm ?? 'OK'}
        </button>
      </div>
    </dialog>
  );
}

// ---------- Bilder ----------
/** Object-URL für einen Blob, wird beim Unmount wieder freigegeben. */
export function useObjectUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

export function useStoredImage(id: string | null | undefined) {
  const img = useLiveQuery(() => (id ? db.images.get(id) : undefined), [id]);
  return useObjectUrl(img?.blob);
}

export function StoredImage({ id, alt, className, onClick }: { id: string; alt: string; className?: string; onClick?: () => void }) {
  const url = useStoredImage(id);
  if (!url) return <div className={`${className ?? ''} img-placeholder`} />;
  return <img src={url} alt={alt} className={className} onClick={onClick} loading="lazy" decoding="async" />;
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
