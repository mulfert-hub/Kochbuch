// Gesprochenes verstehen: Kochmodus-Befehle und Einkaufslisten („Milch, zwei Zitronen und ein Stück Butter“).
import { fold } from './search';

const NUMBER_WORDS: Record<string, number> = {
  null: 0, ein: 1, eine: 1, einen: 1, einem: 1, einer: 1, eins: 1, zwei: 2, zwo: 2, drei: 3, vier: 4, funf: 5, sechs: 6, sieben: 7, acht: 8,
  neun: 9, zehn: 10, elf: 11, zwolf: 12, dreizehn: 13, vierzehn: 14, funfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18,
  neunzehn: 19, zwanzig: 20, funfundzwanzig: 25, dreissig: 30, vierzig: 40, funfundvierzig: 45, funfzig: 50, sechzig: 60, neunzig: 90,
  hundert: 100, einhundert: 100, zweihundert: 200, dreihundert: 300, vierhundert: 400, funfhundert: 500, tausend: 1000,
  halb: 0.5, halbe: 0.5, halben: 0.5, halbes: 0.5, halber: 0.5, anderthalb: 1.5, eineinhalb: 1.5, zweieinhalb: 2.5, viertel: 0.25, dreiviertel: 0.75,
};

/** „zwanzig“ → 20, „12“ → 12, „1,5“ → 1.5 */
export function spokenNumber(word: string): number | null {
  const w = fold(word).replace(/[.,]$/, '');
  if (/^\d+([.,]\d+)?$/.test(w)) return Number(w.replace(',', '.'));
  return NUMBER_WORDS[w] ?? null;
}

export type CookCommand =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'read' }
  | { type: 'ingredients' }
  | { type: 'timer'; seconds: number }
  | { type: 'stepTimer' }
  | { type: 'stopAlarm' }
  | { type: 'stopListening' };

/** Befehl aus einem gesprochenen Satz – null, wenn nichts erkannt wurde */
export function parseCookCommand(text: string): CookCommand | null {
  const t = ` ${fold(text).replace(/[^a-z0-9ß,. ]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  // Timer mit Dauer – egal in welcher Reihenfolge: „Timer zehn Minuten“, „stell einen Timer auf eine halbe Stunde“,
  // „10-Minuten-Timer“, „Wecker in 5 Minuten“, oder nur „zehn Minuten“
  const d = t.match(/ (eine halbe|ne halbe|halbe|[a-z0-9,.]+(?: und (?:eine )?halb| und [a-z0-9]+)?) (stunden?|std|minuten?|min|sekunden?|sek)\b/);
  const timerWord = /(timer|teimer|taimer|wecker|erinner|stell|klingel| uhr )/.test(t);
  if (d && (timerWord || t.trim().split(' ').length <= 3)) {
    const words = d[1].split(' ');
    let n = /halbe$/.test(d[1]) && words.length <= 2 ? 0.5 : spokenNumber(words[0]);
    if (n != null && / halb$/.test(d[1])) n += 0.5;
    else if (n != null && words.length === 3 && words[1] === 'und') n = spokenNumber(d[1].replace(/ /g, '')) ?? n;
    if (n == null) n = spokenNumber(d[1].replace(/ /g, ''));
    if (n != null && n > 0) {
      const unit = d[2].startsWith('st') ? 3600 : d[2].startsWith('sek') ? 1 : 60;
      return { type: 'timer', seconds: Math.round(n * unit) };
    }
  }
  if (/ (timer|teimer|taimer|wecker) (starten|start|an|stellen|setzen)\b| (start(e)?|stell(e)?|setz(e)?) (den |einen |ein |mal )?(timer|teimer|taimer|wecker)|^ (timer|teimer|taimer|wecker) $/.test(t)) return { type: 'stepTimer' };
  if (/ (stopp?|alarm aus|ruhe|aus) $|alarm (aus|stopp?|beenden)|timer (aus|stopp?|beenden)/.test(t)) return { type: 'stopAlarm' };
  if (/ (zuhoren beenden|mikrofon aus|nicht mehr zuhoren|horen aufhoren) /.test(t)) return { type: 'stopListening' };
  if (/ (vorlesen|lies|nochmal|noch mal|wiederholen|was jetzt|was muss ich) /.test(t)) return { type: 'read' };
  if (/ (weiter|nachster|nachste|naechster|vorwarts|next|okay weiter|fertig) /.test(t)) return { type: 'next' };
  if (/ (zuruck|vorheriger|vorherige|davor|back) /.test(t)) return { type: 'prev' };
  if (/ (zutaten|was brauche ich) /.test(t)) return { type: 'ingredients' };
  return null;
}

/** „Milch, zwei Zitronen und ein halbes Kilo Mehl“ → ["Milch", "2 Zitronen", "0,5 Kilo Mehl"] */
export function parseSpokenList(text: string): string[] {
  return text
    .split(/,|;|\.\s|\n|\s+(?:und|sowie|plus|außerdem|ausserdem|dann noch|noch)\s+/i)
    .map((part) => part.trim().replace(/^(?:und|noch|bitte|dann)\s+/i, '').replace(/[.!?]+$/, ''))
    .filter((p) => p.length > 1)
    .map((part) => {
      const words = part.split(/\s+/);
      const n = spokenNumber(words[0]);
      // „ein Stück Butter“ → „1 Stück Butter“, „zwei Zitronen“ → „2 Zitronen“ (aber „Eis“ bleibt „Eis“)
      if (n != null && words.length > 1) {
        let rest = words.slice(1);
        let value = n;
        if (rest[0] && fold(rest[0]) === 'halb') rest = rest.slice(1); // „ein halb …“
        if (n === 1 && rest[0] && spokenNumber(rest[0]) === 0.5) {
          value = 0.5;
          rest = rest.slice(1);
        }
        const name = rest.join(' ');
        return `${String(value).replace('.', ',')} ${name.charAt(0).toUpperCase()}${name.slice(1)}`;
      }
      return part.charAt(0).toUpperCase() + part.slice(1);
    });
}
