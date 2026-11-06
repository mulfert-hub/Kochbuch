import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/fraunces/full.css';
import '@fontsource/instrument-sans/400.css';
import '@fontsource/instrument-sans/500.css';
import '@fontsource/instrument-sans/600.css';
import './styles/global.css';
import './styles/views.css';
import { App } from './App';
import { firstRunSetup } from './db/seed';

// Service Worker registrieren (offline + Updates automatisch)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}

// Als installierte App: Speicher als dauerhaft anfragen, damit der Browser ihn nicht räumt
if (window.matchMedia('(display-mode: standalone)').matches) {
  navigator.storage?.persist?.().catch(() => {});
}

firstRunSetup()
  .catch((e) => console.error('Einrichtung fehlgeschlagen', e))
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
