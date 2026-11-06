// Minimaler Hash-Router (funktioniert auf GitHub Pages ohne Server-Konfiguration).
import { useSyncExternalStore } from 'react';

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

function getHash() {
  return window.location.hash.slice(1) || '/buch';
}

export interface Route {
  path: string;
  segments: string[];
  query: URLSearchParams;
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash, () => '/buch');
  const [path, qs] = hash.split('?');
  return { path, segments: path.split('/').filter(Boolean), query: new URLSearchParams(qs ?? '') };
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const target = `#${to}`;
  if (opts.replace) window.location.replace(target);
  else window.location.hash = to;
}

export function back(fallback: string) {
  if (window.history.length > 1) window.history.back();
  else navigate(fallback, { replace: true });
}
