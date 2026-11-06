// Beispielrezepte als Testdaten, damit alle Ansichten sofort etwas zeigen.
import { db } from './db';
import { ensureDefaultCategories } from './repo';
import { parseIngredientLine } from '../lib/ingredientParser';
import { uid } from '../lib/id';
import type { Recipe } from '../types';

interface SeedRecipe {
  title: string;
  category: string;
  servings: number;
  servingsLabel?: string;
  time?: number;
  ingredients: (string | { group: string })[];
  steps: string[];
  notes?: string;
}

const SEED: SeedRecipe[] = [
  {
    title: 'Kürbissuppe mit Ingwer und Kokos',
    category: 'Vorspeise',
    servings: 4,
    time: 40,
    ingredients: [
      '1 kg Hokkaido-Kürbis',
      '1 Zwiebel',
      '3 cm Ingwer, frisch',
      '2 EL Olivenöl',
      '800 ml Gemüsebrühe',
      '200 ml Kokosmilch',
      '½ Limette',
      'Salz und Pfeffer',
      '2 EL Kürbiskerne',
    ],
    steps: [
      'Kürbis waschen, halbieren, entkernen und samt Schale in grobe Würfel schneiden. Zwiebel und Ingwer schälen und fein hacken.',
      'Öl in einem großen Topf erhitzen, Zwiebel und Ingwer darin 3 Minuten glasig dünsten.',
      'Kürbis zugeben, kurz mitbraten, mit Brühe ablöschen und zugedeckt 20 Minuten weich köcheln.',
      'Kokosmilch einrühren, alles fein pürieren und mit Limettensaft, Salz und Pfeffer abschmecken.',
      'Kürbiskerne ohne Fett rösten und über die Suppe streuen.',
    ],
    notes: 'Hält sich im Kühlschrank 3 Tage und lässt sich gut einfrieren.',
  },
  {
    title: 'Spaghetti al limone',
    category: 'Hauptgericht',
    servings: 2,
    time: 20,
    ingredients: ['200 g Spaghetti', '1 Bio-Zitrone', '40 g Butter', '50 g Parmesan, frisch gerieben', '1 Knoblauchzehe', 'Salz', 'schwarzer Pfeffer'],
    steps: [
      'Spaghetti in reichlich Salzwasser nach Packungsangabe al dente kochen. Eine Tasse Nudelwasser aufheben.',
      'Zitronenschale fein abreiben, den Saft auspressen. Knoblauch andrücken.',
      'Butter mit Knoblauch in einer Pfanne schmelzen, Knoblauch wieder entfernen.',
      'Nudeln tropfnass in die Pfanne geben, Zitronensaft, Schale, Parmesan und etwas Nudelwasser zugeben und kräftig schwenken, bis eine cremige Sauce entsteht.',
      'Mit Pfeffer abschmecken und sofort servieren.',
    ],
  },
  {
    title: 'Ofengemüse mit Feta',
    category: 'Hauptgericht',
    servings: 3,
    time: 45,
    ingredients: [
      '600 g Kartoffeln, festkochend',
      '2 Paprikaschoten',
      '1 Zucchini',
      '1 rote Zwiebel',
      '200 g Feta',
      '4 EL Olivenöl',
      '1 TL Paprikapulver, edelsüß',
      '2 Zweige Rosmarin',
      'Salz',
    ],
    steps: [
      'Backofen auf 200 °C Umluft vorheizen.',
      'Kartoffeln waschen und vierteln, Gemüse in mundgerechte Stücke schneiden.',
      'Alles mit Öl, Paprikapulver, Rosmarinnadeln und Salz auf einem Blech vermengen.',
      '30 Minuten backen, dann den zerbröselten Feta darüber verteilen und weitere 10 Minuten backen.',
    ],
  },
  {
    title: 'Knusprige Rosmarinkartoffeln',
    category: 'Beilage',
    servings: 4,
    time: 50,
    ingredients: ['1 kg kleine Kartoffeln', '3 EL Olivenöl', '3 Zweige Rosmarin', '4 Knoblauchzehen', '1 TL grobes Meersalz'],
    steps: [
      'Kartoffeln in Salzwasser 10 Minuten vorkochen, abgießen und kurz ausdampfen lassen.',
      'Mit einer Gabel leicht andrücken, damit die Oberfläche aufreißt.',
      'Mit Öl, Rosmarin, angedrückten Knoblauchzehen und Salz mischen und bei 220 °C etwa 35 Minuten goldbraun rösten.',
    ],
  },
  {
    title: 'Schokoladenmousse',
    category: 'Dessert',
    servings: 4,
    time: 25,
    ingredients: ['150 g Zartbitterschokolade (70 %)', '3 Eier', '1 EL Zucker', '200 ml Sahne', '1 Prise Salz'],
    steps: [
      'Schokolade über dem Wasserbad schmelzen und etwas abkühlen lassen.',
      'Eier trennen. Eiweiß mit Salz steif schlagen, dabei den Zucker einrieseln lassen.',
      'Sahne steif schlagen. Eigelbe unter die Schokolade rühren.',
      'Erst die Sahne, dann den Eischnee vorsichtig unterheben.',
      'In Gläser füllen und mindestens 4 Stunden kalt stellen.',
    ],
    notes: 'Enthält rohe Eier – nur ganz frische Eier verwenden.',
  },
  {
    title: 'Zimtschnecken',
    category: 'Backen',
    servings: 12,
    servingsLabel: 'Stück',
    time: 120,
    ingredients: [
      { group: 'Für den Teig' },
      '500 g Mehl',
      '1 Würfel Hefe',
      '250 ml Milch, lauwarm',
      '80 g Zucker',
      '80 g Butter, weich',
      '1 Ei',
      '1 Prise Salz',
      { group: 'Für die Füllung' },
      '100 g Butter, weich',
      '100 g brauner Zucker',
      '2 EL Zimt',
    ],
    steps: [
      'Hefe in der lauwarmen Milch auflösen. Mit Mehl, Zucker, Butter, Ei und Salz zu einem glatten Teig kneten.',
      'Abgedeckt an einem warmen Ort 1 Stunde gehen lassen, bis sich das Volumen verdoppelt hat.',
      'Teig zu einem Rechteck (ca. 40 × 30 cm) ausrollen. Butter darauf streichen, Zucker und Zimt mischen und darüber streuen.',
      'Von der langen Seite her aufrollen, in 12 Scheiben schneiden und in eine gefettete Form setzen.',
      'Weitere 20 Minuten gehen lassen und bei 180 °C Ober-/Unterhitze 25 Minuten backen.',
    ],
  },
  {
    title: 'Overnight Oats mit Beeren',
    category: 'Frühstück',
    servings: 1,
    time: 5,
    ingredients: ['50 g zarte Haferflocken', '150 ml Milch', '2 EL Joghurt', '1 TL Honig', '1 EL Chiasamen', '1 Handvoll Beeren'],
    steps: [
      'Haferflocken, Milch, Joghurt, Honig und Chiasamen in einem Glas verrühren.',
      'Abgedeckt über Nacht im Kühlschrank quellen lassen.',
      'Morgens mit frischen Beeren toppen.',
    ],
  },
  {
    title: 'Shakshuka',
    category: 'Frühstück',
    servings: 2,
    time: 30,
    ingredients: [
      '1 Zwiebel',
      '1 rote Paprikaschote',
      '2 Knoblauchzehen',
      '1 Dose stückige Tomaten (400 g)',
      '1 TL Kreuzkümmel',
      '½ TL Chiliflocken',
      '4 Eier',
      '½ Bund Petersilie',
      '2 EL Olivenöl',
      'Salz und Pfeffer',
    ],
    steps: [
      'Zwiebel, Paprika und Knoblauch klein schneiden und im Öl 5 Minuten anbraten.',
      'Gewürze zugeben, kurz mitrösten, dann die Tomaten einrühren und 10 Minuten sämig einköcheln.',
      'Mit einem Löffel vier Mulden formen, je ein Ei hineinschlagen und zugedeckt 6–8 Minuten stocken lassen.',
      'Mit gehackter Petersilie bestreuen und mit Brot servieren.',
    ],
  },
];

export async function seedSampleRecipes(): Promise<number> {
  await ensureDefaultCategories();
  const cats = await db.categories.toArray();
  const byName = new Map(cats.map((c) => [c.name, c.id]));
  const now = Date.now();
  const recipes: Recipe[] = SEED.map((s, idx) => {
    let group: string | undefined;
    const ingredients = [];
    for (const line of s.ingredients) {
      if (typeof line !== 'string') {
        group = line.group;
        continue;
      }
      ingredients.push(parseIngredientLine(line, group));
    }
    return {
      id: uid(),
      title: s.title,
      servings: s.servings,
      servingsLabel: s.servingsLabel ?? 'Portionen',
      categoryIds: byName.get(s.category) ? [byName.get(s.category)!] : [],
      ingredients,
      steps: s.steps,
      notes: s.notes,
      timeMinutes: s.time ?? null,
      imageIds: [],
      createdAt: now - idx * 1000,
      updatedAt: now - idx * 1000,
    };
  });
  await db.recipes.bulkAdd(recipes);
  return recipes.length;
}

/** Beim allerersten Start Kategorien + Beispielrezepte anlegen. */
export async function firstRunSetup(): Promise<void> {
  const done = await db.settings.get('seeded');
  if (done) return;
  await ensureDefaultCategories();
  if ((await db.recipes.count()) === 0) await seedSampleRecipes();
  await db.settings.put({ key: 'seeded', value: true });
}
