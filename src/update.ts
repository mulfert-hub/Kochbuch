// Updates der installierten App: Service Worker regelmäßig prüfen und bei neuer Version neu laden.
// Hintergrund: Auf dem iPhone wird eine Homescreen-App oft nur „aufgeweckt“ statt neu gestartet,
// dadurch würde eine neue Version sonst erst sehr spät aktiv.

let registration: ServiceWorkerRegistration | undefined;

export const APP_VERSION = __APP_VERSION__;
export const APP_BUILD_TIME = __APP_BUILD_TIME__;

export async function initUpdates(): Promise<void> {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  const hadController = !!navigator.serviceWorker.controller;
  // Neue Version hat übernommen → Seite einmal neu laden (nicht beim allerersten Installieren)
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });
  const { registerSW } = await import('virtual:pwa-register');
  registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      registration = reg;
      // Beim Zurückkehren in die App und stündlich nach Updates schauen
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg?.update().catch(() => {});
      });
      setInterval(() => reg?.update().catch(() => {}), 60 * 60 * 1000);
    },
  });
}

/** Manuell nach Updates suchen. Ergebnis: 'updated' (lädt neu), 'current' oder 'offline' */
export async function checkForUpdate(): Promise<'updated' | 'current' | 'offline'> {
  const reg = registration ?? (await navigator.serviceWorker?.getRegistration());
  if (!reg) return 'current';
  try {
    await reg.update();
  } catch {
    return 'offline';
  }
  const waiting = reg.installing ?? reg.waiting;
  if (waiting) {
    // Der neue Service Worker übernimmt sofort (skipWaiting) → controllerchange lädt neu
    setTimeout(() => window.location.reload(), 4000);
    return 'updated';
  }
  return 'current';
}
