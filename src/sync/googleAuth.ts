// Google-Anmeldung per Weiterleitung (OAuth 2.0, „implicit flow“ für reine Browser-Apps).
// Pop-up-Fenster funktionieren in installierten iPhone-Web-Apps oft nicht, Weiterleitungen schon.
// Die App erhält nur Zugriff auf ihren eigenen, versteckten App-Ordner in Google Drive.
import { GOOGLE_CLIENT_ID } from '../config';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_KEY = 'kochbuch-google-token';
const STATE_KEY = 'kochbuch-google-state';
const CLIENT_KEY = 'kochbuch-google-client-id';

interface StoredToken {
  accessToken: string;
  expiresAt: number;
}

function read<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignorieren */
  }
}

export function getClientId(): string {
  return read<string>(CLIENT_KEY) || GOOGLE_CLIENT_ID;
}
export function setClientId(id: string) {
  write(CLIENT_KEY, id.trim() || null);
}

export function redirectUri(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href;
}

/** Gültiges Zugriffstoken oder null (mit 2 Minuten Puffer) */
export function getToken(): string | null {
  const t = read<StoredToken>(TOKEN_KEY);
  return t && t.expiresAt - 120_000 > Date.now() ? t.accessToken : null;
}

export function clearToken() {
  write(TOKEN_KEY, null);
}

/** Zur Google-Anmeldung weiterleiten. silent = ohne Rückfrage, wenn schon einmal zugestimmt wurde. */
export function startLogin(silent = false) {
  const clientId = getClientId();
  if (!clientId) throw new Error('Keine Google-Client-ID eingetragen');
  const nonce = crypto.randomUUID();
  write(STATE_KEY, { nonce, returnTo: window.location.hash || '#/mehr', silent, at: Date.now() });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: DRIVE_SCOPE,
    include_granted_scopes: 'true',
    state: nonce,
  });
  if (silent) params.set('prompt', 'none');
  window.location.assign(`${AUTH_URL}?${params}`);
}

export type RedirectResult = { kind: 'none' } | { kind: 'ok' } | { kind: 'error'; error: string; silent: boolean };

/**
 * Beim App-Start aufrufen: Liest das Token aus der Rücksprung-Adresse
 * (#access_token=…&state=…) und stellt danach die ursprüngliche Seite wieder her.
 */
export function handleRedirect(): RedirectResult {
  const hash = window.location.hash;
  if (!/(^#|&)(access_token|error)=/.test(hash)) return { kind: 'none' };
  const p = new URLSearchParams(hash.slice(1));
  const saved = read<{ nonce: string; returnTo: string; silent: boolean }>(STATE_KEY);
  write(STATE_KEY, null);
  const back = saved?.returnTo ?? '#/mehr';
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${back}`);
  if (!saved || p.get('state') !== saved.nonce) return { kind: 'error', error: 'state_mismatch', silent: false };
  const err = p.get('error');
  if (err) return { kind: 'error', error: err, silent: saved.silent };
  const token = p.get('access_token');
  const expires = Number(p.get('expires_in') ?? '3600');
  if (!token) return { kind: 'error', error: 'no_token', silent: saved.silent };
  write(TOKEN_KEY, { accessToken: token, expiresAt: Date.now() + expires * 1000 } satisfies StoredToken);
  return { kind: 'ok' };
}
