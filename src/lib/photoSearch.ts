// Fotovorschläge aus Openverse (freie Bilder, u. a. Flickr und Wikimedia Commons).
// Keine Anmeldung nötig. Es wird nur der Rezepttitel als Suchbegriff gesendet.

export interface PhotoSuggestion {
  id: string;
  thumb: string;
  title: string;
  creator: string;
  license: string;
  licenseUrl: string;
  landingUrl: string;
}

export interface PhotoCredit {
  title: string;
  creator: string;
  license: string;
  licenseUrl: string;
  landingUrl: string;
}

const API = 'https://api.openverse.org/v1/images/';

// Kleines Wörterbuch für Ausweichsuchen auf Englisch (Openverse ist überwiegend englisch verschlagwortet)
const EN: Record<string, string> = {
  apfel: 'apple', birne: 'pear', banane: 'banana', beere: 'berry', beeren: 'berries', erdbeer: 'strawberry', erdbeere: 'strawberry',
  himbeer: 'raspberry', kirsch: 'cherry', kirsche: 'cherry', pflaume: 'plum', zwetschge: 'plum', zitrone: 'lemon', orange: 'orange',
  kürbis: 'pumpkin', kartoffel: 'potato', kartoffeln: 'potatoes', tomate: 'tomato', tomaten: 'tomato', gurke: 'cucumber',
  karotte: 'carrot', möhre: 'carrot', möhren: 'carrot', zwiebel: 'onion', spinat: 'spinach', linsen: 'lentil', linse: 'lentil',
  bohnen: 'beans', erbsen: 'peas', pilz: 'mushroom', pilze: 'mushrooms', champignon: 'mushroom', paprika: 'bell pepper',
  zucchini: 'zucchini', aubergine: 'eggplant', kohl: 'cabbage', rotkohl: 'red cabbage', spargel: 'asparagus', lauch: 'leek',
  hirse: 'millet', hafer: 'oat', haferflocken: 'oatmeal', reis: 'rice', nudel: 'pasta', nudeln: 'pasta', quinoa: 'quinoa',
  rind: 'beef', rinder: 'beef', schwein: 'pork', hähnchen: 'chicken', huhn: 'chicken', pute: 'turkey', lachs: 'salmon',
  fisch: 'fish', garnelen: 'shrimp', ei: 'egg', eier: 'eggs', käse: 'cheese', quark: 'quark', joghurt: 'yogurt', schoko: 'chocolate',
  schokolade: 'chocolate', zimt: 'cinnamon', vanille: 'vanilla', nuss: 'nut', mandel: 'almond', kokos: 'coconut', honig: 'honey',
  brei: 'porridge', suppe: 'soup', eintopf: 'stew', curry: 'curry', salat: 'salad', auflauf: 'casserole', gratin: 'gratin',
  kuchen: 'cake', torte: 'cake', muffin: 'muffin', muffins: 'muffins', keks: 'cookie', kekse: 'cookies', plätzchen: 'cookies',
  brot: 'bread', brötchen: 'bread rolls', pfannkuchen: 'pancakes', waffeln: 'waffles', schnecken: 'rolls', mousse: 'mousse',
  pudding: 'pudding', creme: 'cream', soße: 'sauce', sauce: 'sauce', pesto: 'pesto', bowl: 'bowl', smoothie: 'smoothie',
  rouladen: 'roulade', braten: 'roast', gulasch: 'goulash', frikadellen: 'meatballs', bällchen: 'balls', pfanne: 'skillet',
  ofengemüse: 'roasted vegetables', gemüse: 'vegetables', risotto: 'risotto', lasagne: 'lasagna', pizza: 'pizza', burger: 'burger',
};

/** Titel vereinfachen: „Omas Apfelkuchen vom Blech“ → „Apfelkuchen“, „Kürbissuppe mit Ingwer“ → „Kürbissuppe“ */
export function simplifyTitle(title: string): string {
  return title
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(?:mit|und|an|auf|vom|von|aus|nach|à la|a la|in)\b.*$/i, '')
    .replace(/\b(?:omas?|mamas?|meine?r?s?|schnelle?r?s?|einfache?r?s?|leckere?r?s?|beste?r?s?|klassische?r?s?|vegane?r?s?|vegetarische?r?s?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function translate(word: string): string | undefined {
  const w = word.toLowerCase();
  if (EN[w]) return EN[w];
  // Komposita: längstes bekanntes Endstück („Kürbissuppe“ → „suppe“)
  for (let i = 1; i < w.length - 2; i++) if (EN[w.slice(i)]) return EN[w.slice(i)];
  return undefined;
}

function firstPart(word: string): string | undefined {
  const w = word.toLowerCase();
  for (let i = w.length - 1; i > 2; i--) if (EN[w.slice(0, i)]) return EN[w.slice(0, i)];
  return undefined;
}

/** Suchbegriffe von genau nach grob */
export function searchQueries(title: string): string[] {
  const out: string[] = [];
  const add = (q: string | undefined) => {
    const t = q?.trim();
    if (t && t.length > 2 && !out.includes(t)) out.push(t);
  };
  const simple = simplifyTitle(title) || title;
  add(title.replace(/\s+/g, ' ').trim());
  add(simple);
  const words = simple.split(/[\s-]+/).filter((w) => w.length > 1);
  if (words.length >= 2) {
    // „Hirse-Apfel-Brei“ → „Hirsebrei“
    add(words[0] + words[words.length - 1].toLowerCase());
    const a = translate(words[0]) ?? firstPart(words[0]);
    const b = translate(words[words.length - 1]);
    if (a && b) add(`${a} ${b}`);
    if (b) add(`${b} food`);
  } else if (words.length === 1) {
    const head = translate(words[0]);
    const mod = firstPart(words[0]);
    if (mod && head && mod !== head) add(`${mod} ${head}`);
    if (head) add(`${head} food`);
  }
  return out;
}

interface OpenverseResult {
  id: string;
  title?: string;
  creator?: string;
  license: string;
  license_version?: string;
  license_url?: string;
  foreign_landing_url?: string;
  mature?: boolean;
}

async function query(q: string, signal?: AbortSignal): Promise<PhotoSuggestion[]> {
  const url = `${API}?${new URLSearchParams({ q, page_size: '12', mature: 'false' })}`;
  const res = await fetch(url, { signal });
  if (res.status === 429) throw new Error('rate-limit');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { results?: OpenverseResult[] };
  return (data.results ?? [])
    .filter((r) => !r.mature)
    .map((r) => ({
      id: r.id,
      thumb: `${API}${r.id}/thumb/`,
      title: r.title ?? '',
      creator: r.creator ?? 'unbekannt',
      license: `${r.license === 'pdm' || r.license === 'cc0' ? r.license.toUpperCase() : `CC ${r.license.toUpperCase()}`}${r.license_version ? ` ${r.license_version}` : ''}`,
      licenseUrl: r.license_url ?? '',
      landingUrl: r.foreign_landing_url ?? '',
    }));
}

/** Bis zu 9 Vorschläge, Suchbegriffe werden nacheinander probiert.
 *  Scheitert eine Stufe (z. B. Limit von 20 Suchen/Minute), bleiben bisherige Treffer erhalten. */
export async function findPhotos(title: string, signal?: AbortSignal): Promise<PhotoSuggestion[]> {
  const found: PhotoSuggestion[] = [];
  let lastError: unknown = null;
  for (const q of searchQueries(title)) {
    try {
      const res = await query(q, signal);
      for (const r of res) if (!found.some((f) => f.id === r.id)) found.push(r);
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      lastError = e;
      if ((e as Error).message === 'rate-limit') break;
    }
    if (found.length >= 4) break;
  }
  if (!found.length && lastError) throw lastError;
  return found.slice(0, 9);
}

/** Lädt das gewählte Bild (Vorschaugröße reicht für die App, ca. 600 px) */
export async function downloadPhoto(s: PhotoSuggestion): Promise<Blob> {
  const res = await fetch(s.thumb);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

export function creditOf(s: PhotoSuggestion): PhotoCredit {
  return { title: s.title, creator: s.creator, license: s.license, licenseUrl: s.licenseUrl, landingUrl: s.landingUrl };
}
