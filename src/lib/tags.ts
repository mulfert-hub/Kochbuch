// Tag-Vorschläge: Claude darf nur eure vorhandenen Tags oder eine kleine feste Liste allgemeiner Tags verwenden.
// Persönliche Tags (z. B. „Thea“) nur, wenn ihr ihnen eine Bedeutung gegeben habt.
import { fold } from './search';

export const GENERAL_TAGS = ['vegetarisch', 'vegan', 'Fleisch', 'Fisch', 'schnell', 'Backen', 'Meal Prep', 'Gäste', 'glutenfrei', 'laktosefrei'];

export interface TagInfo {
  desc: string;
  updatedAt: number;
}
export type TagInfoMap = Record<string, TagInfo>;

/** Welche Tags darf Claude vorschlagen? Vorhandene allgemeine + feste Liste + persönliche mit Bedeutung */
export function allowedTags(existing: string[], info: TagInfoMap): { name: string; meaning?: string }[] {
  const out: { name: string; meaning?: string }[] = [];
  const add = (name: string, meaning?: string) => {
    if (!out.some((t) => fold(t.name) === fold(name))) out.push({ name, meaning });
  };
  const generalKeys = new Set(GENERAL_TAGS.map(fold));
  for (const t of existing) {
    const meaning = info[t]?.desc?.trim() || Object.entries(info).find(([k]) => fold(k) === fold(t))?.[1].desc?.trim();
    // Persönliche/eigene Tags nur mit Bedeutung; allgemeine immer
    if (meaning) add(t, meaning);
    else if (generalKeys.has(fold(t))) add(t);
  }
  for (const [k, v] of Object.entries(info)) if (v.desc?.trim()) add(k, v.desc.trim());
  for (const g of GENERAL_TAGS) add(existing.find((t) => fold(t) === fold(g)) ?? g);
  return out;
}

/** Vorschläge von Claude bereinigen: nur erlaubte Tags, Schreibweise wie bei euch, höchstens 5 */
export function cleanSuggestedTags(suggested: string[], allowed: { name: string }[], max = 5): string[] {
  const out: string[] = [];
  for (const s of suggested) {
    const hit = allowed.find((a) => fold(a.name) === fold(s.replace(/^#/, '').trim()));
    if (hit && !out.includes(hit.name)) out.push(hit.name);
    if (out.length >= max) break;
  }
  return out;
}

/** Beschreibung für Claude: „vegetarisch, Fleisch, Thea (= mild, ohne Alkohol) …“ */
export function describeTags(allowed: { name: string; meaning?: string }[]): string {
  return allowed.map((t) => (t.meaning ? `${t.name} (= ${t.meaning})` : t.name)).join(', ');
}
