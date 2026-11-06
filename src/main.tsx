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
import { applyTheme } from './theme';
import { initUpdates } from './update';
import { initSync } from './sync/sync';

applyTheme();
// Rücksprung von der Google-Anmeldung auswerten und automatische Synchronisation starten
initSync();

// Service Worker registrieren (offline + automatische Updates)
initUpdates().catch(() => {});

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
