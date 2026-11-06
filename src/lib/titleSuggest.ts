// Titel aus Zutaten und Zubereitung ableiten, wenn im Screenshot kein Rezeptname erkennbar ist.
// Läuft komplett lokal mit festen Regeln (keine KI, kein Internet).
import type { Ingredient } from '../types';
import { fold } from './search';

// Grundzutaten, die ein Gericht nicht prägen
const STAPLES = [
  'salz', 'pfeffer', 'wasser', 'ol', 'olivenol', 'rapsol', 'sonnenblumenol', 'kokosol', 'butterschmalz', 'zucker', 'brauner zucker',
  'puderzucker', 'vanillezucker', 'backpulver', 'natron', 'hefe', 'trockenhefe', 'mehl', 'speisestarke', 'starke', 'brühe', 'gemusebruhe',
  'huhnerbruhe', 'rinderbruhe', 'fond', 'rinderfond', 'essig', 'balsamico', 'senf', 'zitronensaft', 'limettensaft', 'muskat', 'zimt',
  'paprikapulver', 'kreuzkummel', 'kurkuma', 'currypulver', 'chiliflocken', 'chili', 'oregano', 'thymian', 'rosmarin', 'basilikum',
  'petersilie', 'schnittlauch', 'dill', 'koriander', 'lorbeerblatt', 'knoblauch', 'knoblauchzehe', 'knoblauchzehen', 'zwiebel',
  'zwiebeln', 'schalotte', 'tomatenmark', 'sojasauce', 'honig', 'milch', 'sahne', 'butter', 'ei', 'eier', 'eigelb', 'eiweiss',
  'gewurze', 'krauter', 'eis', 'wein', 'rotwein', 'weisswein',
];
const STAPLE_SET = new Set(STAPLES);

// Füllwörter vor dem eigentlichen Zutatennamen
const ADJECTIVES =
  /^(?:kleine?[rsn]?|große?[rsn]?|grosse?[rsn]?|mittelgroße?[rsn]?|rote?[rsn]?|grüne?[rsn]?|gelbe?[rsn]?|weiße?[rsn]?|schwarze?[rsn]?|frische?[rsn]?|getrocknete?[rsn]?|gehackte?[rsn]?|geriebene?[rsn]?|zarte?[rsn]?|reife?[rsn]?|säuerliche?[rsn]?|weiche?[rsn]?|festkochende?[rsn]?|mehligkochende?[rsn]?|tiefgekühlte?[rsn]?|tk|bio|stückige?[rsn]?|passierte?[rsn]?|ganze?[rsn]?|halbe?[rsn]?|dünne?[rsn]?|helle?[rsn]?|dunkle?[rsn]?|gemischte?[rsn]?|grobe?[rsn]?|feine?[rsn]?|mittelscharfe?[rsn]?|scharfe?[rsn]?|milde?[rsn]?)\s+/i;

// Plural → Singular für schönere Titel („Kartoffeln“ → „Kartoffel“ in „Kartoffel-Suppe“)
const SINGULAR: Record<string, string> = {
  kartoffeln: 'Kartoffel', tomaten: 'Tomaten', zwiebeln: 'Zwiebel', möhren: 'Möhren', karotten: 'Karotten', äpfel: 'Apfel',
  birnen: 'Birnen', beeren: 'Beeren', erdbeeren: 'Erdbeer', himbeeren: 'Himbeer', kirschen: 'Kirsch', paprikaschoten: 'Paprika',
  paprikaschote: 'Paprika', champignons: 'Champignon', pilze: 'Pilz', bananen: 'Bananen', nudeln: 'Nudel', haferflocken: 'Hafer',
  kichererbsen: 'Kichererbsen', erbsen: 'Erbsen', bohnen: 'Bohnen', linsen: 'Linsen', zucchini: 'Zucchini', auberginen: 'Auberginen',
  rinderrouladen: 'Rinderrouladen', hähnchenbrustfilets: 'Hähnchen', hähnchenbrust: 'Hähnchen', hackfleisch: 'Hackfleisch',
  gnocchi: 'Gnocchi', kirschtomaten: 'Tomaten', cocktailtomaten: 'Tomaten', mozzarella: 'Mozzarella', feta: 'Feta',
};

/** „kleiner Apfel“ → „Apfel“, „Hokkaido-Kürbis“ → „Kürbis“, „Zartbitterschokolade (70 %)“ → „Zartbitterschokolade“ */
export function coreName(name: string): string {
  let n = name.replace(/\(.*?\)/g, ' ').replace(/,.*$/, '').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3 && ADJECTIVES.test(n); i++) n = n.replace(ADJECTIVES, '');
  n = n.split(/\s+(?:und|oder|mit)\s+/i)[0];
  const words = n.split(' ');
  let w = words[words.length - 1] ?? n;
  if (w.includes('-')) w = w.split('-').pop()!;
  w = SINGULAR[w.toLowerCase()] ?? w;
  return w.charAt(0).toUpperCase() + w.slice(1);
}

function isStaple(name: string): boolean {
  const f = fold(name.replace(/\(.*?\)/g, '').replace(/,.*$/, '').trim());
  if (STAPLE_SET.has(f)) return true;
  const core = fold(coreName(name));
  return STAPLE_SET.has(core) || /(?:pulver|gewürz|gewurz|salz|ol|öl|essig|brühe|bruhe|fond|zucker|sirup)$/.test(core);
}

type DishType = { word: string; test: (steps: string, ings: string) => boolean };

// Reihenfolge = Priorität
const DISH_TYPES: DishType[] = [
  { word: 'Smoothie', test: (s) => /\b(?:mixen|smoothie)\b/.test(s) && !/\b(?:kochen|backen|braten|köcheln|koecheln)\b/.test(s) },
  { word: 'Suppe', test: (s) => /suppe|pürier|purier/.test(s) && /\b(?:koch|köchel|kochel|brühe|bruhe)/.test(s) },
  { word: 'Brei', test: (s, i) => /\b(?:hirse|haferflocken|hafer|griess|grieß|polenta)\b/.test(i) && /\b(?:wasser|milch)\b/.test(i) && /(?:koch|köchel|kochel|quell)/.test(s) && !/backen/.test(s) },
  { word: 'Salat', test: (s) => /\bsalat|dressing|vinaigrette/.test(s) },
  { word: 'Curry', test: (s, i) => /\bcurry\b|currypaste/.test(s + ' ' + i) && /(?:koch|köchel|kochel)/.test(s) },
  { word: 'Auflauf', test: (s) => /auflaufform|überbacken|uberbacken|gratinier/.test(s) },
  { word: 'Kuchen', test: (s, i) => /backen|backofen|ofen/.test(s) && /\bmehl\b/.test(i) && /\b(?:zucker|honig)\b/.test(i) },
  { word: 'Brot', test: (s, i) => /backen|ofen/.test(s) && /\bmehl\b/.test(i) && /\b(?:hefe|sauerteig)\b/.test(i) },
  { word: 'Pfanne', test: (s) => /\bpfanne\b/.test(s) && /\b(?:brat|anbrat|dünst|dunst|schmor)/.test(s) },
  { word: 'Eintopf', test: (s) => /(?:köchel|kochel|schmor|garen)/.test(s) && /\btopf\b/.test(s) },
  { word: 'aus dem Ofen', test: (s) => /backofen|im ofen|\bblech\b/.test(s) },
];

export function detectDishType(ingredients: Ingredient[], steps: string[]): string | null {
  const s = fold(steps.join(' ')).replace(/ü/g, 'u');
  const i = fold(ingredients.map((x) => x.name).join(' '));
  return DISH_TYPES.find((t) => t.test(s, i))?.word ?? null;
}

/** Titelvorschlag aus Zutaten + Schritten, z. B. „Hirse-Apfel-Brei“ oder „Paprika-Tomaten-Pfanne“. */
export function suggestTitle(ingredients: Ingredient[], steps: string[]): string | null {
  const mains: string[] = [];
  for (const ing of ingredients) {
    if (!ing.name.trim() || isStaple(ing.name)) continue;
    const c = coreName(ing.name);
    if (c.length < 3 || mains.some((m) => fold(m) === fold(c))) continue;
    mains.push(c);
    if (mains.length === 2) break;
  }
  const type = detectDishType(ingredients, steps);
  if (!mains.length) return type && type !== 'aus dem Ofen' ? type : null;
  if (!type) return mains.length === 2 ? `${mains[0]} mit ${mains[1]}` : `${mains[0]}-Gericht`;
  if (type === 'aus dem Ofen') return `${mains.join('-')} aus dem Ofen`;
  // Wenn die Hauptzutat die Gerichtsart schon enthält („Kürbissuppe“), nicht doppeln
  if (mains.some((m) => fold(m).endsWith(fold(type)))) return mains.join('-');
  return `${mains.join('-')}-${type}`;
}

/** Ist ein erkannter Titel brauchbar? Sätze wie „Ja, natürlich! Apfel passt …“ sind es nicht. */
export function isPlausibleTitle(title: string): boolean {
  const t = title.trim();
  if (t.length < 3 || t.length > 60) return false;
  if (t === 'Neues Rezept') return false;
  if (/[.!?]\s*\S|[.!?:,;]$/.test(t)) return false;
  if (t.split(/\s+/).length > 8) return false;
  if (/^(?:ja|nein|klar|gerne|natürlich|hier|super|okay|ok|hallo|hi|danke|also|genau|wenn|ich|du|wir|das|es)\b/i.test(t)) return false;
  return /\p{Lu}/u.test(t.charAt(0));
}
