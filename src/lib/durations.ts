// Zeitangaben in Zubereitungsschritten finden: „20 Minuten köcheln“, „1 Std. ruhen“, „10–15 Min.“, „1½ Stunden“.
import { parseNumber } from './quantity';

export interface FoundDuration {
  /** Sekunden (bei Spannen der kleinere Wert – lieber früher nachsehen) */
  seconds: number;
  /** Obergrenze bei Spannen, sonst null */
  maxSeconds: number | null;
  /** Fundstelle im Text, z. B. „10–15 Minuten“ */
  text: string;
  index: number;
}

const NUM = String.raw`\d+(?:[.,]\d+)?(?:\s*[½¼¾⅓⅔])?|[½¼¾⅓⅔]|ein(?:e|er|en)?|eine?\s+halbe`;
const UNIT = String.raw`stunden?|std\.?|h\b|minuten?|min\.?|sekunden?|sek\.?|sec\.?`;
const RE = new RegExp(String.raw`(?<![\w-])(${NUM})(?:\s*(?:–|-|—|bis)\s*(${NUM}))?\s*(${UNIT})(?![a-zäöüß])`, 'gi');

function toNumber(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (/^ein/.test(s)) return s.includes('halb') ? 0.5 : 1;
  return parseNumber(s.replace(/\s+/g, ''));
}

function factor(unit: string): number {
  const u = unit.toLowerCase();
  if (u.startsWith('st') || u === 'h') return 3600;
  if (u.startsWith('min')) return 60;
  return 1;
}

export function findDurations(text: string): FoundDuration[] {
  const out: FoundDuration[] = [];
  for (const m of text.matchAll(RE)) {
    const a = toNumber(m[1]);
    if (a == null || a <= 0) continue;
    const b = m[2] ? toNumber(m[2]) : null;
    const f = factor(m[3]);
    const seconds = Math.round(a * f);
    // „4 h“ nach einer Temperatur o. Ä. ausschließen: nur plausible Küchenzeiten (5 s bis 48 h)
    if (seconds < 5 || seconds > 48 * 3600) continue;
    out.push({ seconds, maxSeconds: b != null && b > a ? Math.round(b * f) : null, text: m[0].trim(), index: m.index ?? 0 });
  }
  return out;
}

/** „1:05:00“ / „12:30“ */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** „20 Min.“, „1 Std. 30 Min.“, „45 Sek.“ */
export function formatDurationShort(seconds: number): string {
  if (seconds < 60) return `${seconds} Sek.`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (!h) return `${m} Min.`;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}
