// Einheiten: Erkennung von Schreibweisen (auch OCR-Varianten), Anzeige im Singular/Plural
// und Umrechnung für die Einkaufsliste.

export interface UnitDef {
  /** Kanonische Kurzform (wird gespeichert). */
  key: string;
  singular: string;
  plural: string;
  /** Schreibweisen, die erkannt werden (klein geschrieben, ohne Punkt am Ende). */
  aliases: string[];
  /** Metrische Einheit → Dezimaldarstellung statt Brüchen. */
  metric?: boolean;
  /** Basis-Einheit und Faktor für die Umrechnung (z. B. kg → g · 1000). */
  base?: { unit: string; factor: number };
}

export const UNITS: UnitDef[] = [
  { key: 'g', singular: 'g', plural: 'g', aliases: ['g', 'gr', 'gramm', 'grm'], metric: true, base: { unit: 'g', factor: 1 } },
  { key: 'kg', singular: 'kg', plural: 'kg', aliases: ['kg', 'kilo', 'kilogramm'], metric: true, base: { unit: 'g', factor: 1000 } },
  { key: 'mg', singular: 'mg', plural: 'mg', aliases: ['mg', 'milligramm'], metric: true, base: { unit: 'g', factor: 0.001 } },
  { key: 'ml', singular: 'ml', plural: 'ml', aliases: ['ml', 'milliliter'], metric: true, base: { unit: 'ml', factor: 1 } },
  { key: 'cl', singular: 'cl', plural: 'cl', aliases: ['cl', 'zentiliter'], metric: true, base: { unit: 'ml', factor: 10 } },
  { key: 'dl', singular: 'dl', plural: 'dl', aliases: ['dl', 'deziliter'], metric: true, base: { unit: 'ml', factor: 100 } },
  { key: 'l', singular: 'Liter', plural: 'Liter', aliases: ['l', 'liter', 'ltr'], metric: true, base: { unit: 'ml', factor: 1000 } },
  { key: 'EL', singular: 'EL', plural: 'EL', aliases: ['el', 'eßl', 'essl', 'esslöffel', 'eßlöffel', 'essloeffel'] },
  { key: 'TL', singular: 'TL', plural: 'TL', aliases: ['tl', 'teel', 'teelöffel', 'teeloeffel'] },
  { key: 'Msp.', singular: 'Msp.', plural: 'Msp.', aliases: ['msp', 'messerspitze', 'messerspitzen'] },
  { key: 'Prise', singular: 'Prise', plural: 'Prisen', aliases: ['prise', 'prisen', 'pr'] },
  { key: 'Bund', singular: 'Bund', plural: 'Bund', aliases: ['bund', 'bd', 'bunde'] },
  { key: 'Stück', singular: 'Stück', plural: 'Stück', aliases: ['stück', 'stk', 'st', 'stueck', 'stücke'] },
  { key: 'Scheibe', singular: 'Scheibe', plural: 'Scheiben', aliases: ['scheibe', 'scheiben', 'scheibe(n)', 'sch'] },
  { key: 'Zehe', singular: 'Zehe', plural: 'Zehen', aliases: ['zehe', 'zehen', 'zehe(n)'] },
  { key: 'Dose', singular: 'Dose', plural: 'Dosen', aliases: ['dose', 'dosen', 'dose(n)', 'ds'] },
  { key: 'Pck.', singular: 'Pck.', plural: 'Pck.', aliases: ['pck', 'pkt', 'pkg', 'päckchen', 'packung', 'packungen', 'pack', 'tüte', 'tüten', 'beutel'] },
  { key: 'Becher', singular: 'Becher', plural: 'Becher', aliases: ['becher', 'bch'] },
  { key: 'Glas', singular: 'Glas', plural: 'Gläser', aliases: ['glas', 'gläser'] },
  { key: 'Tasse', singular: 'Tasse', plural: 'Tassen', aliases: ['tasse', 'tassen', 'cup', 'cups'] },
  { key: 'Handvoll', singular: 'Handvoll', plural: 'Handvoll', aliases: ['handvoll', 'hand voll', 'hv'] },
  { key: 'Zweig', singular: 'Zweig', plural: 'Zweige', aliases: ['zweig', 'zweige', 'zweig(e)'] },
  { key: 'Blatt', singular: 'Blatt', plural: 'Blätter', aliases: ['blatt', 'blätter'] },
  { key: 'Würfel', singular: 'Würfel', plural: 'Würfel', aliases: ['würfel', 'wurfel'] },
  { key: 'Stange', singular: 'Stange', plural: 'Stangen', aliases: ['stange', 'stangen', 'stange(n)'] },
  { key: 'Knolle', singular: 'Knolle', plural: 'Knollen', aliases: ['knolle', 'knollen'] },
  { key: 'Kopf', singular: 'Kopf', plural: 'Köpfe', aliases: ['kopf', 'köpfe'] },
  { key: 'Flasche', singular: 'Flasche', plural: 'Flaschen', aliases: ['flasche', 'flaschen', 'fl'] },
  { key: 'Tropfen', singular: 'Tropfen', plural: 'Tropfen', aliases: ['tropfen'] },
  { key: 'Schuss', singular: 'Schuss', plural: 'Schuss', aliases: ['schuss', 'schuß', 'spritzer'] },
  { key: 'Stiel', singular: 'Stiel', plural: 'Stiele', aliases: ['stiel', 'stiele', 'stiel(e)'] },
  { key: 'Kugel', singular: 'Kugel', plural: 'Kugeln', aliases: ['kugel', 'kugeln'] },
  { key: 'Rolle', singular: 'Rolle', plural: 'Rollen', aliases: ['rolle', 'rollen'] },
  { key: 'cm', singular: 'cm', plural: 'cm', aliases: ['cm'], metric: true },
];

const aliasMap = new Map<string, UnitDef>();
for (const u of UNITS) {
  aliasMap.set(u.key.toLowerCase().replace(/\.$/, ''), u);
  for (const a of u.aliases) aliasMap.set(a, u);
}

/** Findet eine Einheit zu einem Wort (z. B. „Esslöffel“, „EL.“, „g“). */
export function lookupUnit(word: string): UnitDef | undefined {
  const w = word.toLowerCase().replace(/[.:,]+$/, '').trim();
  return aliasMap.get(w);
}

export function unitDef(key: string): UnitDef | undefined {
  return UNITS.find((u) => u.key === key) ?? lookupUnit(key);
}

/** Einheit passend zur Menge (1 Zehe / 2 Zehen). */
export function unitLabel(key: string, quantity: number | null | undefined): string {
  if (!key) return '';
  const def = unitDef(key);
  if (!def) return key;
  return quantity != null && quantity > 1 ? def.plural : def.singular;
}

export function isMetric(key: string): boolean {
  return !!unitDef(key)?.metric;
}

/** Für Mengenaddition: g/kg/mg → g, ml/cl/dl/l → ml. */
export function toBase(key: string, quantity: number | null): { unit: string; quantity: number | null } {
  const def = unitDef(key);
  if (!def?.base) return { unit: def?.key ?? key, quantity };
  return { unit: def.base.unit, quantity: quantity == null ? null : quantity * def.base.factor };
}

/** Zurück zur lesbaren Einheit: 1500 g → 1,5 kg; 750 ml bleibt ml. */
export function fromBase(unit: string, quantity: number | null): { unit: string; quantity: number | null } {
  if (quantity == null) return { unit, quantity };
  if (unit === 'g' && quantity >= 1000) return { unit: 'kg', quantity: quantity / 1000 };
  if (unit === 'ml' && quantity >= 1000) return { unit: 'l', quantity: quantity / 1000 };
  return { unit, quantity };
}

// Einfache Singular/Plural-Paare für Zutaten ohne Einheit („1 Ei“ → „2 Eier“).
const NOUN_PAIRS: [string, string][] = [
  ['Ei', 'Eier'],
  ['Eigelb', 'Eigelb'],
  ['Eiweiß', 'Eiweiß'],
  ['Zwiebel', 'Zwiebeln'],
  ['Schalotte', 'Schalotten'],
  ['Knoblauchzehe', 'Knoblauchzehen'],
  ['Kartoffel', 'Kartoffeln'],
  ['Tomate', 'Tomaten'],
  ['Möhre', 'Möhren'],
  ['Karotte', 'Karotten'],
  ['Zitrone', 'Zitronen'],
  ['Limette', 'Limetten'],
  ['Orange', 'Orangen'],
  ['Paprikaschote', 'Paprikaschoten'],
  ['Gurke', 'Gurken'],
  ['Banane', 'Bananen'],
  ['Apfel', 'Äpfel'],
  ['Birne', 'Birnen'],
  ['Zucchini', 'Zucchini'],
  ['Aubergine', 'Auberginen'],
  ['Chilischote', 'Chilischoten'],
  ['Frühlingszwiebel', 'Frühlingszwiebeln'],
  ['Lorbeerblatt', 'Lorbeerblätter'],
  ['Avocado', 'Avocados'],
  ['Brötchen', 'Brötchen'],
];

/** Passt das erste Wort des Zutatennamens an die Menge an (nur ohne Einheit). */
export function inflectName(name: string, unit: string, quantity: number | null): string {
  if (unit || quantity == null) return name;
  const m = name.match(/^(\S+)(.*)$/s);
  if (!m) return name;
  const [, first, rest] = m;
  for (const [sg, pl] of NOUN_PAIRS) {
    if (quantity > 1 && first === sg) return pl + rest;
    if (quantity <= 1 && first === pl) return sg + rest;
  }
  return name;
}

/** Grundform für den Vergleich in der Einkaufsliste. */
export function singularize(word: string): string {
  for (const [sg, pl] of NOUN_PAIRS) {
    if (word.toLowerCase() === pl.toLowerCase()) return sg.toLowerCase();
  }
  return word.toLowerCase();
}
