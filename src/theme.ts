// Farbschema: System (Standard), immer hell oder immer dunkel. Gespeichert pro Gerät.
export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'kochbuch-theme';

export function getTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* privater Modus o. Ä. */
  }
  return 'system';
}

export function applyTheme(choice: ThemeChoice = getTheme()): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
  // Statusleisten-Farbe passend zum Hintergrund
  const bg = getComputedStyle(root).getPropertyValue('--paper').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    if (choice === 'system') {
      m.setAttribute('content', m.getAttribute('media')?.includes('dark') ? '#1c1c1f' : '#fffcf8');
    } else {
      m.setAttribute('content', bg);
    }
  });
}

export function setTheme(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    /* ignorieren */
  }
  applyTheme(choice);
}
