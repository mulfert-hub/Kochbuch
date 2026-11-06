// Minimaler Google-Drive-Client für den versteckten App-Ordner („appDataFolder“).
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export class AuthError extends Error {}

export interface DriveFile {
  id: string;
  name: string;
  modifiedTime?: string;
}

export class DriveClient {
  constructor(private token: string) {}

  private async req(url: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${this.token}` } });
    if (res.status === 401 || res.status === 403) {
      const text = await res.text().catch(() => '');
      if (res.status === 401 || /authError|insufficient|invalid_token/i.test(text)) throw new AuthError(text || 'Nicht angemeldet');
      throw new Error(`Google Drive: ${res.status} ${text.slice(0, 200)}`);
    }
    if (!res.ok) throw new Error(`Google Drive: ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
    return res;
  }

  async list(): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const q = new URLSearchParams({ spaces: 'appDataFolder', fields: 'nextPageToken,files(id,name,modifiedTime)', pageSize: '1000' });
      if (pageToken) q.set('pageToken', pageToken);
      const data = (await (await this.req(`${API}/files?${q}`)).json()) as { files: DriveFile[]; nextPageToken?: string };
      files.push(...data.files);
      pageToken = data.nextPageToken;
    } while (pageToken);
    return files;
  }

  async download(id: string): Promise<Response> {
    return this.req(`${API}/files/${id}?alt=media`);
  }

  /** Neue Datei anlegen oder (mit id) Inhalt ersetzen */
  async upload(name: string, body: Blob, id?: string): Promise<DriveFile> {
    if (id) {
      const res = await this.req(`${UPLOAD}/files/${id}?uploadType=media&fields=id,name`, {
        method: 'PATCH',
        headers: { 'Content-Type': body.type || 'application/octet-stream' },
        body,
      });
      return res.json();
    }
    // Drive erwartet „multipart/related“ (Metadaten + Inhalt), nicht „multipart/form-data“
    const boundary = `kochbuch-${crypto.randomUUID()}`;
    const meta = JSON.stringify({ name, parents: ['appDataFolder'] });
    const multipart = new Blob(
      [
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
        `--${boundary}\r\nContent-Type: ${body.type || 'application/octet-stream'}\r\n\r\n`,
        body,
        `\r\n--${boundary}--`,
      ],
      { type: `multipart/related; boundary=${boundary}` },
    );
    const res = await this.req(`${UPLOAD}/files?uploadType=multipart&fields=id,name`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipart,
    });
    return res.json();
  }

  async remove(id: string): Promise<void> {
    await this.req(`${API}/files/${id}`, { method: 'DELETE' });
  }
}
