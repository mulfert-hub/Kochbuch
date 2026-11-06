// Holt Bilder ab, die über „Teilen → Kochbuch“ (Web Share Target) an die App geschickt wurden.
const SHARE_CACHE = 'kochbuch-share';

export async function takeSharedFiles(): Promise<File[]> {
  if (!('caches' in window)) return [];
  const cache = await caches.open(SHARE_CACHE);
  const keys = await cache.keys();
  const files: File[] = [];
  for (const req of keys) {
    const res = await cache.match(req);
    if (!res) continue;
    const blob = await res.blob();
    const name = decodeURIComponent(res.headers.get('x-filename') ?? 'screenshot.png');
    files.push(new File([blob], name, { type: blob.type || 'image/png' }));
    await cache.delete(req);
  }
  return files;
}
