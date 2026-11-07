// Datumshilfen für den Wochenplan. Tage werden als „JJJJ-MM-TT“ in Ortszeit gespeichert.

const pad = (n: number) => String(n).padStart(2, '0');

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Montag der Woche, in der `d` liegt */
export function weekStart(d: Date): Date {
  const day = (d.getDay() + 6) % 7; // Mo = 0 … So = 6
  return addDays(d, -day);
}

/** Die sieben Tage (Mo–So) der Woche, `offset` Wochen von heute entfernt */
export function weekDays(offset = 0, today = new Date()): string[] {
  const start = addDays(weekStart(today), offset * 7);
  return Array.from({ length: 7 }, (_, i) => dayKey(addDays(start, i)));
}

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

/** „Heute“, „Morgen“ oder „Mittwoch“ */
export function dayName(key: string, today = new Date()): string {
  const t = dayKey(today);
  if (key === t) return 'Heute';
  if (key === dayKey(addDays(today, 1))) return 'Morgen';
  return WEEKDAYS[parseDay(key).getDay()];
}

/** „7. Nov.“ */
export function shortDate(key: string): string {
  return parseDay(key).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

/** Überschrift einer Woche: „Diese Woche“, „Nächste Woche“ oder „10.–16. Nov.“ */
export function weekLabel(offset: number, today = new Date()): string {
  if (offset === 0) return 'Diese Woche';
  if (offset === 1) return 'Nächste Woche';
  if (offset === -1) return 'Letzte Woche';
  const days = weekDays(offset, today);
  return `${shortDate(days[0])} – ${shortDate(days[6])}`;
}
