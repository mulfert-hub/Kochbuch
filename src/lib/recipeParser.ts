// Heuristik: OCR-Text (Zeilen mit Höhe/Absatz-Info) → Rezeptentwurf.
import type { Ingredient, RecipeDraft } from '../types';
import { lookupUnit } from './units';
import { isPureQuantity, normalizeOcrLine, parseIngredientLine, reorderColumns, startsWithQuantity } from './ingredientParser';

export interface OcrLine {
  text: string;
  /** Höhe der Zeile in Pixeln (Schriftgröße) – hilft beim Erkennen des Titels. */
  height?: number;
  /** Beginnt hier ein neuer Absatz/Block? */
  paragraphStart?: boolean;
  /** Erkennungssicherheit 0–100 */
  confidence?: number;
}

/** Tab-/Menüleisten wie „Entdecken     Suche     Favoriten     Profil“ */
/** Führende OCR-Reste („= So geht's:“, „» Zutaten“) für Überschriften-Erkennung entfernen */
const stripJunk = (t: string) => t.replace(/^[^\p{L}\d]{1,3}\s*/u, '').trim();
const isIngHeader = (t: string) => INGREDIENT_HEADER.test(stripJunk(t));
const isStepHeader = (t: string) => STEPS_HEADER.test(stripJunk(t));

export function isNavBar(text: string): boolean {
  if (/\d/.test(text)) return false;
  const parts = text.trim().split(/\s{3,}/);
  if (parts.length < 3) return false;
  return parts.every((p) => p.split(' ').length <= 2 && /^[A-ZÄÖÜ]/.test(p) && !/[.,;:!?]$/.test(p));
}

const INGREDIENT_HEADER =
  /^(?:zutaten|zutatenliste|einkaufsliste|du brauchst|das brauchst du|ihr braucht|was du brauchst|man nehme|für \d+ (?:personen|portionen))\b/i;
const STEPS_HEADER =
  /^(?:zubereitung(?:sschritte)?|so geht'?s|so wird'?s gemacht|und so geht'?s|anleitung|arbeitsschritte|schritte|zubereitungsanleitung|so gelingt'?s|los geht'?s|kochanleitung|methode)\b/i;
const NOTES_HEADER = /^(?:tipps?|hinweis|notiz(?:en)?|variante|unser tipp|mein tipp|extra-tipp)\b\s*:?/i;
const GROUP_HEADER = /^(?:für (?:den|die|das)\s+.+|.{2,30}:)$/i;

const UI_NOISE = new RegExp(
  '^(?:' +
    [
      'teilen', 'speichern', 'gespeichert', 'drucken', 'merken', 'gemerkt', 'kommentare?', 'bewertungen?', 'werbung', 'anzeige',
      'jetzt kochen', 'kochmodus', 'zur einkaufsliste', 'auf die einkaufsliste', 'einkaufsliste erstellen', 'mehr anzeigen', 'weniger anzeigen',
      'alle anzeigen', 'zurück', 'menü', 'suche', 'profil', 'startseite', 'home', 'favoriten', 'abonnieren', 'folgen', 'gefällt mir', 'like',
      'portionen anpassen', 'rezept drucken', 'video ansehen', 'zum rezept', 'nährwerte', 'cookie.*', 'akzeptieren', 'pro portion',
      'schwierigkeit:?.*', 'einfach', 'normal', 'mittel', 'schwer', 'vegetarisch', 'vegan', 'glutenfrei',
    ].join('|') +
    ')$',
  'i',
);

const STATUS_BAR = /^(?:\d{1,2}[:.]\d{2}(?:\s|$)|.*\b\d{1,3}\s?%$|lte|5g|4g)/i;

/** Eindeutige Portionsangaben (ohne „Stück“, das auch in Zutaten vorkommt) */
const SERVINGS_STRONG = /(\d+(?:[.,]\d+)?)\s*(?:-\s*\d+\s*)?(portionen|portion|personen|person|pers\.?|port\.?)(?=\s|$|[.,;:)])/i;
/** „Ergibt 20 Stück“, „für 12 Muffins“ – nur mit Einleitungswort */
const SERVINGS_WEAK = /(?:ergibt|für|reicht für|zutaten für|menge:?)\s+(?:ca\.\s*)?(\d+)\s*(stück|stk\.?|scheiben|muffins|kekse|brötchen|gläser|waffeln|pfannkuchen)\b/i;
const SERVINGS_RE_FUER = /\bfür\s+(\d+)\b/i;
const TIME_RE = /(\d+)\s*(?:min\.?|minuten)\b|(\d+(?:[.,]\d+)?)\s*(?:std\.?|stunden?|h)\b/gi;

function letterRatio(s: string): number {
  const letters = (s.match(/[A-Za-zÄÖÜäöüß]/g) ?? []).length;
  return s.length ? letters / s.length : 0;
}

/** Entfernt Statusleiste, UI-Buttons und Zeichensalat. */
export function cleanLines(lines: OcrLine[]): OcrLine[] {
  const out: OcrLine[] = [];
  for (const [idx, l] of lines.entries()) {
    // Statusleiste (Uhrzeit) in den ersten Zeilen, auch wenn OCR Symbole dahinter liest
    if (idx < 3 && /^\d{1,2}[:.]\d{2}(?:\s|$)/.test(l.text.trim())) continue;
    // Eingabezeilen von Chat-Apps („ChatGPT fragen“, „Nachricht schreiben“)
    if (/^\W*\S+\s+fragen\b|nachricht (?:schreiben|senden)|^\W*message\b/i.test(l.text.trim())) continue;
    // Große Lücken (≥3 Leerzeichen) bleiben als Spaltentrenner erhalten
    const text = l.text
      .replace(/^\s*[|¦]\s+/, '')
      // einzelne Symbol-Reste von Emojis („&“, „@“, „©“) entfernen
      .replace(/(^|\s)[&@©®]+(?=\s|$)/g, '$1')
      .replace(/[\t\u00A0]/g, ' ')
      .replace(/ {3,}/g, '\u0000')
      .replace(/ +/g, ' ')
      .replace(/\u0000/g, '     ')
      .trim();
    if (!text) continue;
    if (isNavBar(l.text)) continue;
    // Hashtag-Zeilen und „Alle 48 Kommentare ansehen“
    if (/^#\S+(?:\s+#\S+)*$/.test(text) || (text.match(/#/g) ?? []).length >= 2) continue;
    if (/^(?:alle\s+)?\d+\s+(?:kommentare|antworten|likes?|gefällt)/i.test(text)) continue;
    if (UI_NOISE.test(text.replace(/[^\p{L}\s:'-]/gu, '').trim())) continue;
    if (text.length < 25 && STATUS_BAR.test(text) && !startsWithIngredientish(text)) continue;
    // Zeichensalat aus Icon-Leisten („OO» OO N 6 0“): mehrere Fetzen, aber kein echtes Wort
    const tokens = text.split(/\s+/);
    if (tokens.length >= 3 && !startsWithQuantity(text) && !tokens.some((t) => /\p{L}{3,}/u.test(t))) continue;
    const ratio = letterRatio(text);
    // Zeilen ohne Buchstaben (außer reinen Mengen/Nummern) sind meist Icons oder Rauschen.
    if (ratio < 0.3 && !isPureQuantity(text) && !/^\d+[.)]?$/.test(text)) continue;
    if (text.length <= 2 && !/^\d+[.)]?$/.test(text)) continue;
    // Sehr unsichere Kurzzeilen verwerfen
    if (l.confidence != null && l.confidence < 35 && text.length < 12) continue;
    out.push({ ...l, text });
  }
  return out;
}

function startsWithIngredientish(text: string): boolean {
  return /^\d+\s*(?:g|kg|ml|l|el|tl)\b/i.test(text);
}

/** Zeilen ohne Layout-Infos (z. B. eingefügter Text) in OcrLines umwandeln. */
export function linesFromPlainText(text: string): OcrLine[] {
  const out: OcrLine[] = [];
  let newPara = true;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) {
      newPara = true;
      continue;
    }
    out.push({ text: raw, paragraphStart: newPara });
    newPara = false;
  }
  return out;
}

function findTitle(lines: OcrLine[], limit: number): { title: string; used: Set<number> } {
  const used = new Set<number>();
  const candidates: { i: number; score: number }[] = [];
  const maxH = Math.max(0, ...lines.slice(0, limit).map((l) => l.height ?? 0));
  for (let i = 0; i < Math.min(limit, lines.length); i++) {
    const t = lines[i].text;
    if (letterRatio(t) < 0.6 || t.length < 3 || t.length > 80) continue;
    if (SERVINGS_STRONG.test(t) || SERVINGS_WEAK.test(t) || /\b(?:min|minuten|std|kcal|zeit)\b/i.test(t)) continue;
    if (startsWithQuantity(t)) continue;
    const h = lines[i].height ?? 0;
    // größere Schrift + weiter oben = wahrscheinlicher Titel
    const score = (maxH ? h / maxH : 0.5) * 3 - i * 0.15 + (t.length > 6 ? 0.3 : 0);
    candidates.push({ i, score });
  }
  if (!candidates.length) return { title: '', used };
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0].i;
  used.add(best);
  let title = lines[best].text;
  // Mehrzeilige Titel: Folgezeile mit ähnlicher Schriftgröße anhängen
  const h = lines[best].height ?? 0;
  for (let j = best + 1; j < Math.min(lines.length, best + 3); j++) {
    const hj = lines[j].height ?? 0;
    const t2 = lines[j].text;
    if (SERVINGS_STRONG.test(t2) || /\b(?:min|std|zeit)\b/i.test(t2) || startsWithQuantity(t2)) break;
    // Gleiche Schriftgröße (±30 %) – Wortboxen schwanken durch Unterlängen
    if (!h || !hj || Math.abs(hj - h) / h > 0.3) break;
    if (isIngHeader(lines[j].text) || isStepHeader(lines[j].text)) break;
    title += ' ' + lines[j].text;
    used.add(j);
  }
  title = title.replace(/[|_]+/g, '').replace(/\s+/g, ' ').trim();
  return { title, used };
}

function servingsLabel(raw: string): string {
  const l = raw.toLowerCase();
  if (l.startsWith('port')) return 'Portionen';
  if (l.startsWith('pers')) return 'Personen';
  if (l.startsWith('st')) return 'Stück';
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function parseServings(lines: OcrLine[]): { servings: number | null; label?: string } {
  for (const re of [SERVINGS_STRONG, SERVINGS_WEAK]) {
    for (const l of lines) {
      const m = l.text.match(re);
      if (!m) continue;
      const n = Number(m[1].replace(',', '.'));
      if (n > 0 && n < 100) return { servings: n, label: servingsLabel(m[2]) };
    }
  }
  for (const l of lines) {
    if (!isIngHeader(l.text)) continue;
    const m = l.text.match(SERVINGS_RE_FUER);
    if (m) return { servings: Number(m[1]), label: 'Portionen' };
  }
  return { servings: null };
}

function parseTime(lines: OcrLine[]): number | null {
  // Bevorzugt „Gesamtzeit“, sonst die erste Zeitangabe in einer Zeile mit „Zeit“
  const timeLines = lines.filter((l) => /zeit|dauer|gesamt/i.test(l.text));
  const pick =
    timeLines.find((l) => /gesamt/i.test(l.text)) ??
    timeLines[0] ??
    lines.find((l) => l.text.length < 45 && /^\D{0,20}\d+\s*(?:min\.?|minuten|std\.?|stunden?)\b/i.test(l.text));
  if (!pick) return null;
  let total = 0;
  for (const m of pick.text.matchAll(TIME_RE)) {
    if (m[1]) total += Number(m[1]);
    else if (m[2]) total += Math.round(Number(m[2].replace(',', '.')) * 60);
  }
  return total > 0 ? total : null;
}

/** Fügt Silbentrennung und umbrochene Zeilen zusammen. */
function joinWrapped(a: string, b: string): string {
  if (/[A-Za-zÄÖÜäöüß]-$/.test(a) && /^[a-zäöüß]/.test(b)) return a.slice(0, -1) + b;
  return `${a} ${b}`;
}

const STEP_NUMBER = /^(?:schritt\s*)?(\d{1,2})(?:[.):]|\s*$)\s*/i;

function parseSteps(lines: OcrLine[]): { steps: string[]; notes: string[] } {
  const steps: string[] = [];
  const notes: string[] = [];
  let current = '';
  let inNotes = false;
  const numbered = lines.filter((l) => STEP_NUMBER.test(l.text)).length >= 2;
  const lens = lines.map((l) => l.text.trim().length).sort((a, b) => a - b);
  const typicalLen = lens.length ? lens[Math.floor(lens.length * 0.5)] : 0;
  let prevLen = 0;

  const flush = () => {
    const s = current.trim();
    if (s) (inNotes ? notes : steps).push(s);
    current = '';
  };

  for (const l of lines) {
    let t = l.text.replace(/\s+/g, ' ').trim();
    if (NOTES_HEADER.test(t)) {
      flush();
      inNotes = true;
      t = t.replace(NOTES_HEADER, '').trim();
      if (!t) continue;
      current = t;
      continue;
    }
    if (/^guten appetit!?$/i.test(t)) continue;
    const num = t.match(STEP_NUMBER);
    if (numbered && num && !inNotes) {
      flush();
      t = t.slice(num[0].length).trim();
      if (!t) continue;
      current = t;
      continue;
    }
    // Neuer Absatz: Layout sagt es, oder die vorige Zeile war kurz und endete mit einem Satzende
    const prevShort = prevLen > 0 && prevLen < typicalLen * 0.75;
    if (!numbered && !inNotes && current && /[.!?)]$/.test(current) && (l.paragraphStart || prevShort)) flush();
    prevLen = t.length;
    current = current ? joinWrapped(current, t) : t;
  }
  flush();

  // Ein einziger großer Block ohne Nummern: an Satzenden in Schritte teilen
  if (!numbered && steps.length === 1 && steps[0].length > 280) {
    const sentences = steps[0].match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? [steps[0]];
    const chunks: string[] = [];
    let buf = '';
    for (const s of sentences) {
      if (buf && (buf + s).length > 220) {
        chunks.push(buf.trim());
        buf = '';
      }
      buf += s;
    }
    if (buf.trim()) chunks.push(buf.trim());
    return { steps: chunks, notes };
  }
  return { steps, notes };
}

function parseIngredients(lines: OcrLine[]): Ingredient[] {
  const out: Ingredient[] = [];
  let group: string | undefined;

  // Spalten-Layout: erst alle Mengen, dann alle Namen → paarweise zusammenführen
  const pure = lines.filter((l) => isPureQuantity(l.text));
  if (pure.length >= 3) {
    const nonPure = lines.filter((l) => !isPureQuantity(l.text) && !GROUP_HEADER.test(l.text));
    const firstPure = lines.findIndex((l) => isPureQuantity(l.text));
    const allPureFirst = lines.slice(firstPure, firstPure + pure.length).every((l) => isPureQuantity(l.text));
    if (allPureFirst && nonPure.length === pure.length) {
      return pure.map((p, i) => parseIngredientLine(`${normalizeOcrLine(p.text)} ${nonPure[i].text}`));
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const t = normalizeOcrLine(reorderColumns(lines[i].text));
    // Menge und Name in getrennten Zeilen: „200 g“ / „Mehl“
    if (isPureQuantity(t) && i + 1 < lines.length && !startsWithQuantity(lines[i + 1].text)) {
      out.push(parseIngredientLine(`${normalizeOcrLine(t)} ${lines[i + 1].text}`, group));
      i++;
      continue;
    }
    if (!startsWithQuantity(t) && GROUP_HEADER.test(t) && t.length < 40 && /:$|^für /i.test(t)) {
      group = t.replace(/:$/, '').trim();
      continue;
    }
    // Fortsetzung der vorherigen Zeile (beginnt klein, z. B. „gehackt“)
    if (out.length && /^[a-zäöüß(]/.test(t) && !/^(?:etwas|salz|pfeffer|evtl|n\.\s?b|nach)/i.test(t)) {
      const prev = out[out.length - 1];
      const paren = t.match(/^\((.*?)\)?$/);
      if (paren) prev.note = prev.note ? `${prev.note}, ${paren[1]}` : paren[1];
      else if (prev.note) prev.note = joinWrapped(prev.note, t);
      else prev.name = joinWrapped(prev.name, t);
      continue;
    }
    out.push(parseIngredientLine(t, group));
  }
  return out.filter((i) => i.name.length > 1);
}

/** „1. Hirse mit Wasser …“ – nummerierter Schritt (keine Zutat wie „1 Ei“) */
const NUMBERED_STEP = /^(?:schritt\s*)?\d{1,2}[.)]\s+\p{Lu}/iu;
function isNumberedStep(t: string): boolean {
  if (!NUMBERED_STEP.test(t.trim())) return false;
  const word = t.trim().replace(/^(?:schritt\s*)?\d{1,2}[.)]\s+/i, '').split(/\s/)[0] ?? '';
  return !lookupUnit(word);
}

/** „So bereitest du den Hirse-Apfel-Brei zu:“, „Rezept für Pfannkuchen:“ → Titel */
const TITLE_PHRASE =
  /(?:so (?:bereitest|machst|kochst|backst|zauberst) (?:du|ihr) (?:den|die|das|deinen|deine|dein|euren|eure|euer)|(?:hier ist )?(?:ein |mein |das )?rezept für (?:den |die |das |einen |eine |ein )?|zutaten für (?:den|die|das))\s+(.+?)(?:\s+zu)?\s*[:.!]?\s*$/i;

/** Hauptfunktion: aus OCR-Zeilen einen Rezeptentwurf erstellen. */
export function parseRecipe(rawLines: OcrLine[]): RecipeDraft {
  const ocrText = rawLines.map((l) => l.text).join('\n');
  const lines = cleanLines(rawLines);

  const ingHeader = lines.findIndex((l) => isIngHeader(l.text));
  const stepHeader = lines.findIndex((l, i) => i > ingHeader && isStepHeader(l.text));
  const isMeta = (t: string) => /\b(?:min\.?|minuten|std\.?|portionen|personen|kcal)\b/i.test(t);

  // Beginn der Zutaten: nach „Zutaten“-Überschrift, sonst erste Zeile mit Mengenangabe
  let ingFrom =
    ingHeader !== -1 ? ingHeader + 1 : lines.findIndex((l) => startsWithQuantity(l.text) && !isMeta(l.text) && !isNumberedStep(l.text));
  let ingTo: number;
  let stepFrom: number;
  if (stepHeader !== -1) {
    ingTo = stepHeader;
    stepFrom = stepHeader + 1;
    if (ingFrom === -1 || ingFrom > stepHeader) ingFrom = -1;
  } else if (ingFrom !== -1) {
    // Ohne „Zubereitung“-Überschrift: Zutaten enden bei der ersten langen Satzzeile
    let i = ingFrom;
    // Ein Satz (≥4 Wörter oder Satzzeichen am Ende, ohne Menge vorne) beginnt die Zubereitung
    const isSentence = (t: string) => !startsWithQuantity(reorderColumns(t)) && !/^[(a-zäöü]/.test(t) && (t.split(/\s+/).length >= 4 || /[.!?]$/.test(t));
    while (i < lines.length && !isSentence(lines[i].text) && !isNumberedStep(lines[i].text) && lines[i].text.length < 60) i++;
    ingTo = i;
    stepFrom = i;
  } else {
    ingTo = -1;
    stepFrom = -1;
  }

  const headerEnd = ingHeader !== -1 ? ingHeader : ingFrom !== -1 ? ingFrom : Math.min(lines.length, 6);
  let { title, used } = findTitle(lines, Math.max(headerEnd, 1) + 1);
  // Titel aus einer Einleitung wie „So bereitest du den Hirse-Apfel-Brei zu:“ (Chat-Antworten, Blogs)
  for (let i = Math.min(headerEnd, lines.length - 1); i >= 0 && i >= headerEnd - 4; i--) {
    const m = lines[i]?.text.match(TITLE_PHRASE);
    if (m && m[1].length >= 3 && m[1].length <= 60) {
      title = m[1].replace(/\s+/g, ' ').trim();
      used = new Set([i]);
      break;
    }
  }
  const { servings, label } = parseServings(lines);
  const timeMinutes = parseTime(lines.slice(0, Math.max(headerEnd + 2, 8)));
  if (stepFrom === -1) stepFrom = Math.max(...used, -1) + 1;

  const ingLines = ingFrom === -1 ? [] : lines.slice(ingFrom, ingTo).filter((l, idx) => {
    const t = l.text;
    if (used.has(ingFrom + idx)) return false;
    // Portionen-/Zeitzeilen gehören nicht zu den Zutaten
    if ((SERVINGS_STRONG.test(t) || SERVINGS_WEAK.test(t)) && t.length < 40) return false;
    if (isIngHeader(t)) return false;
    return true;
  });
  const ingredients = parseIngredients(ingLines);
  const { steps, notes } = parseSteps(lines.slice(stepFrom).filter((l) => !isStepHeader(l.text) || l.text.length > 30));

  const withQty = ingredients.filter((i) => i.quantity != null).length;
  const confidence =
    (title ? 0.25 : 0) +
    (ingredients.length ? 0.25 * Math.min(1, withQty / Math.max(1, ingredients.length * 0.6)) : 0) +
    (steps.length ? 0.25 : 0) +
    (servings ? 0.1 : 0) +
    (lines.some((l) => isIngHeader(l.text)) ? 0.075 : 0) +
    (lines.some((l) => isStepHeader(l.text)) ? 0.075 : 0);

  return {
    title: title || 'Neues Rezept',
    servings,
    servingsLabel: label,
    ingredients,
    steps,
    notes: notes.join('\n\n') || undefined,
    timeMinutes,
    categoryIds: [],
    ocrText,
    confidence,
  };
}
