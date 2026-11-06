// Einkaufsliste nach Supermarkt-Abteilungen sortieren (Stichwort-Liste, von Hand änderbar).
import { fold } from './search';

export const AISLES = [
  { id: 'obst-gemuese', name: 'Obst & Gemüse' },
  { id: 'brot', name: 'Brot & Backwaren' },
  { id: 'kuehl', name: 'Kühlregal & Milchprodukte' },
  { id: 'fleisch-fisch', name: 'Fleisch & Fisch' },
  { id: 'trocken', name: 'Nudeln, Reis & Konserven' },
  { id: 'backen', name: 'Backen & Süßes' },
  { id: 'gewuerze', name: 'Gewürze, Öle & Saucen' },
  { id: 'tiefkuehl', name: 'Tiefkühl' },
  { id: 'getraenke', name: 'Getränke' },
  { id: 'sonstiges', name: 'Sonstiges' },
] as const;
export type AisleId = (typeof AISLES)[number]['id'];

// Reihenfolge wichtig: spezifische Begriffe vor allgemeinen („Kokosmilch“ vor „Milch“, „Tomatenmark“ vor „Tomate“)
const RULES: [AisleId, string[]][] = [
  ['tiefkuehl', ['tk-', 'tiefkuhl', 'tiefgekuhlt', 'gefroren', 'eiswurfel', 'speiseeis']],
  ['gewuerze', ['tomatenmark', 'kokosmilch', 'brühe', 'bruhe', 'fond', 'senf', 'ketchup', 'mayonnaise', 'sojasauce', 'sojasosse', 'essig', 'balsamico', 'ol', 'olivenol', 'rapsol', 'sonnenblumenol', 'sesamol', 'kokosol', 'butterschmalz', 'salz', 'pfeffer', 'paprikapulver', 'pulver', 'gewurz', 'curry', 'kurkuma', 'kreuzkummel', 'zimt', 'muskat', 'oregano', 'thymian', 'majoran', 'lorbeer', 'chiliflocken', 'vanilleschote', 'nelken', 'kardamom', 'pesto', 'sirup', 'honig', 'brühwürfel']],
  ['backen', ['mehl', 'zucker', 'backpulver', 'natron', 'hefe', 'vanillezucker', 'puderzucker', 'speisestarke', 'starke', 'schokolade', 'kakao', 'kuvertüre', 'kuverture', 'streusel', 'gelatine', 'marzipan', 'rosinen', 'mandeln', 'haselnuss', 'walnuss', 'nusse', 'kokosraspel', 'chiasamen', 'leinsamen', 'sesam', 'kerne']],
  ['trocken', ['nudel', 'spaghetti', 'pasta', 'penne', 'fusilli', 'lasagne', 'reis', 'risotto', 'couscous', 'bulgur', 'quinoa', 'hirse', 'linsen', 'kichererbsen', 'bohnen', 'haferflocken', 'hafer', 'gries', 'griess', 'polenta', 'dose', 'stuckige tomaten', 'passierte tomaten', 'gehackte tomaten', 'mais', 'gnocchi', 'semmelbrosel', 'paniermehl', 'cornflakes', 'musli', 'brühe']],
  ['fleisch-fisch', ['fleisch', 'hack', 'rind', 'schwein', 'kalb', 'lamm', 'hahnchen', 'huhn', 'pute', 'ente', 'speck', 'bacon', 'schinken', 'salami', 'wurst', 'chorizo', 'roulade', 'filet', 'schnitzel', 'lachs', 'thunfisch', 'fisch', 'garnelen', 'shrimps', 'muscheln', 'forelle', 'kabeljau']],
  ['kuehl', ['milch', 'sahne', 'schmand', 'creme fraiche', 'saure sahne', 'quark', 'joghurt', 'jogurt', 'butter', 'margarine', 'kase', 'parmesan', 'mozzarella', 'feta', 'gouda', 'ricotta', 'mascarpone', 'frischkase', 'ei', 'eier', 'eigelb', 'eiweiss', 'tofu', 'blatterteig', 'hefeteig', 'pizzateig', 'pfannkuchenteig', 'gnocchi frisch']],
  ['brot', ['brot', 'brotchen', 'baguette', 'toast', 'tortilla', 'wraps', 'fladenbrot', 'ciabatta', 'naan', 'croissant']],
  ['getraenke', ['wein', 'bier', 'saft', 'wasser', 'mineralwasser', 'limonade', 'cola', 'kaffee', 'tee', 'sekt', 'prosecco']],
  ['obst-gemuese', ['apfel', 'birne', 'banane', 'zitrone', 'limette', 'orange', 'mandarine', 'beere', 'erdbeer', 'himbeer', 'heidelbeer', 'kirsch', 'pflaume', 'zwetschge', 'traube', 'mango', 'ananas', 'melone', 'kiwi', 'avocado', 'tomate', 'gurke', 'paprika', 'zucchini', 'aubergine', 'kurbis', 'kartoffel', 'susskartoffel', 'mohre', 'karotte', 'zwiebel', 'schalotte', 'lauchzwiebel', 'fruhlingszwiebel', 'knoblauch', 'ingwer', 'lauch', 'porree', 'sellerie', 'fenchel', 'brokkoli', 'blumenkohl', 'kohl', 'spinat', 'mangold', 'salat', 'rucola', 'feldsalat', 'champignon', 'pilz', 'spargel', 'erbsen', 'mais', 'radieschen', 'rote bete', 'petersilie', 'basilikum', 'schnittlauch', 'dill', 'koriander', 'minze', 'rosmarin', 'salbei', 'chili', 'pastinake', 'kohlrabi', 'rhabarber', 'gewürzgurke', 'gewurzgurke']],
];

/** Abteilung für eine Zutat raten */
export function guessAisle(name: string): AisleId {
  const n = fold(name.replace(/\(.*?\)/g, ' ').replace(/,.*$/, '')).trim();
  // ganzes Wort oder Wortende bevorzugen („Eier“ ≠ „Eierlikör“ ist egal, „Öl“ nicht in „Möhren“)
  const words = n.split(/[\s-]+/);
  for (const [aisle, keys] of RULES) {
    for (const k of keys) {
      if (k.includes(' ') || k.endsWith('-')) {
        if (n.includes(k.replace(/-$/, ''))) return aisle;
      } else if (words.some((w) => w === k || (k.length >= 4 && (w.startsWith(k) || w.endsWith(k))))) {
        return aisle;
      }
    }
  }
  return 'sonstiges';
}

// Eigene Zuordnungen merken („Hefe“ liegt bei uns im Kühlregal) – pro Zutatenname
const OVERRIDE_KEY = 'kochbuch-aisle-overrides';
export function getAisleOverrides(): Record<string, AisleId> {
  try {
    return JSON.parse(localStorage.getItem(OVERRIDE_KEY) ?? '{}');
  } catch {
    return {};
  }
}
export function setAisleOverride(name: string, aisle: AisleId) {
  const o = getAisleOverrides();
  o[fold(name.trim())] = aisle;
  try {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(o));
  } catch {
    /* ignorieren */
  }
}
export function aisleFor(name: string, overrides = getAisleOverrides()): AisleId {
  return overrides[fold(name.trim())] ?? guessAisle(name);
}
