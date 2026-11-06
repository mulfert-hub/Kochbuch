// Minimaler GitHub-Client für das private Daten-Repository (Contents-API).
// Jede Speicherung ist ein Commit. GitHub prüft dabei die Version (sha) – so fallen
// gleichzeitige Änderungen von zwei Handys auf und werden neu zusammengeführt statt überschrieben.
const API = 'https://api.github.com';

export class AuthError extends Error {}
export class ConflictError extends Error {}

export interface RemoteFile {
  path: string;
  sha: string;
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return toBase64(new Uint8Array(await blob.arrayBuffer()));
}

export function textToBase64(text: string): string {
  return toBase64(new TextEncoder().encode(text));
}

/** „benutzer/repo“ oder eine GitHub-Adresse → { owner, repo } */
export function parseRepo(input: string): { owner: string; repo: string } | null {
  const m = input
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '')
    .match(/^([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

export class GitHubClient {
  constructor(
    private token: string,
    private owner: string,
    private repo: string,
  ) {}

  private async req(path: string, init: RequestInit = {}, accept = 'application/vnd.github+json'): Promise<Response> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        Accept: accept,
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });
    if (res.status === 401) throw new AuthError('Der GitHub-Token ist ungültig oder abgelaufen.');
    if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') throw new Error('GitHub-Limit erreicht – bitte später erneut versuchen.');
    if (res.status === 403) throw new AuthError('Der GitHub-Token hat keine Schreibrechte auf das Daten-Repository.');
    if (res.status === 409 || (res.status === 422 && init.method === 'PUT')) throw new ConflictError('Gleichzeitige Änderung');
    return res;
  }

  private contents(path: string) {
    return `/repos/${this.owner}/${this.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  }

  /** Repository prüfen: existiert, privat, beschreibbar? */
  async checkRepo(): Promise<{ private: boolean; canWrite: boolean }> {
    const res = await this.req(`/repos/${this.owner}/${this.repo}`);
    if (res.status === 404) throw new Error('Repository nicht gefunden – Name prüfen und ob der Token Zugriff darauf hat.');
    if (!res.ok) throw new Error(`GitHub: ${res.status}`);
    const d = (await res.json()) as { private: boolean; permissions?: { push?: boolean } };
    return { private: d.private, canWrite: d.permissions?.push ?? true };
  }

  /** Text-Datei lesen; null, wenn es sie (noch) nicht gibt */
  async readText(path: string): Promise<{ text: string; sha: string } | null> {
    const meta = await this.req(this.contents(path));
    if (meta.status === 404) return null;
    if (!meta.ok) throw new Error(`GitHub: ${meta.status}`);
    const d = (await meta.json()) as { sha: string; content?: string; encoding?: string };
    if (d.encoding === 'base64' && d.content) {
      const bin = atob(d.content.replace(/\n/g, ''));
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return { text: new TextDecoder().decode(bytes), sha: d.sha };
    }
    // Dateien über 1 MB liefert GitHub nur „roh“
    const raw = await this.req(this.contents(path), {}, 'application/vnd.github.raw+json');
    if (!raw.ok) throw new Error(`GitHub: ${raw.status}`);
    return { text: await raw.text(), sha: d.sha };
  }

  async readBlob(path: string): Promise<Blob> {
    const raw = await this.req(this.contents(path), {}, 'application/vnd.github.raw+json');
    if (!raw.ok) throw new Error(`GitHub: ${raw.status}`);
    return raw.blob();
  }

  /** Dateien eines Ordners (leer, wenn es ihn nicht gibt) */
  async list(dir: string): Promise<RemoteFile[]> {
    const res = await this.req(this.contents(dir));
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`GitHub: ${res.status}`);
    const d = (await res.json()) as { path: string; sha: string; type: string }[] | { type: string };
    return Array.isArray(d) ? d.filter((f) => f.type === 'file').map((f) => ({ path: f.path, sha: f.sha })) : [];
  }

  /** Datei anlegen oder ersetzen (mit sha: nur wenn sie seitdem unverändert ist) */
  async write(path: string, base64: string, message: string, sha?: string): Promise<string> {
    const res = await this.req(this.contents(path), { method: 'PUT', body: JSON.stringify({ message, content: base64, ...(sha ? { sha } : {}) }) });
    if (!res.ok) throw new Error(`GitHub: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return ((await res.json()) as { content: { sha: string } }).content.sha;
  }

  async remove(path: string, sha: string, message: string): Promise<void> {
    const res = await this.req(this.contents(path), { method: 'DELETE', body: JSON.stringify({ message, sha }) });
    if (!res.ok && res.status !== 404) throw new Error(`GitHub: ${res.status}`);
  }
}
