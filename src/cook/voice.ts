// Spracherkennung (Web Speech API) und Vorlesen (Sprachsynthese) für Kochmodus und Einkaufsliste.
// Hinweis: Auf dem iPhone läuft die Erkennung über Apple (Internet nötig), in Chrome über Google.
import { useEffect, useRef, useState } from 'react';

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>; resultIndex: number }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function createRecognition(): Recognition | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!C) return null;
  const r = new C();
  r.lang = 'de-DE';
  r.interimResults = false;
  r.maxAlternatives = 1;
  return r;
}

export function speechSupported(): boolean {
  const w = window as unknown as Record<string, unknown>;
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function errorMessage(code: string): string {
  if (code === 'not-allowed' || code === 'service-not-allowed') return 'Kein Zugriff aufs Mikrofon – bitte in den Einstellungen erlauben.';
  if (code === 'network') return 'Spracherkennung braucht Internet.';
  if (code === 'audio-capture') return 'Kein Mikrofon gefunden.';
  return 'Spracherkennung hat nicht geklappt.';
}

/** Dauerhaft zuhören (Kochmodus). Startet nach Pausen neu, bis `active` false wird. */
export function useContinuousListening(active: boolean, onText: (text: string) => void, onError: (msg: string) => void) {
  const textRef = useRef(onText);
  const errRef = useRef(onError);
  textRef.current = onText;
  errRef.current = onError;
  const [listening, setListening] = useState(false);
  const paused = useRef(false);

  useEffect(() => {
    if (!active) return;
    const r = createRecognition();
    if (!r) {
      errRef.current('Dieses Gerät unterstützt keine Spracherkennung.');
      return;
    }
    r.continuous = true;
    let stopped = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) textRef.current(e.results[i][0].transcript);
      }
    };
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      stopped = true;
      setListening(false);
      errRef.current(errorMessage(e.error));
    };
    // iOS beendet die Erkennung nach kurzer Stille → neu starten
    r.onend = () => {
      setListening(false);
      if (!stopped && !paused.current) window.setTimeout(() => !stopped && safeStart(), 250);
    };
    const safeStart = () => {
      try {
        r.start();
        setListening(true);
      } catch {
        /* läuft schon */
      }
    };
    controls.current = {
      pause: () => {
        paused.current = true;
        r.abort();
      },
      resume: () => {
        paused.current = false;
        safeStart();
      },
    };
    safeStart();
    return () => {
      stopped = true;
      controls.current = null;
      r.abort();
      setListening(false);
    };
  }, [active]);

  const controls = useRef<{ pause: () => void; resume: () => void } | null>(null);
  return { listening, pause: () => controls.current?.pause(), resume: () => controls.current?.resume() };
}

/** Einmal zuhören (z. B. Einkaufsliste) – liefert den erkannten Satz */
export function listenOnce(): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = createRecognition();
    if (!r) return reject(new Error('Dieses Gerät unterstützt keine Spracherkennung.'));
    r.continuous = false;
    let done = false;
    r.onresult = (e) => {
      done = true;
      resolve(e.results[0][0].transcript);
    };
    r.onerror = (e) => {
      done = true;
      reject(new Error(e.error === 'no-speech' ? 'Nichts verstanden – bitte noch einmal.' : errorMessage(e.error)));
    };
    r.onend = () => {
      if (!done) reject(new Error('Nichts verstanden – bitte noch einmal.'));
    };
    r.start();
  });
}

/** Text vorlesen (deutsche Stimme) – ruft onEnd genau einmal auf, wenn fertig.
 *  iPhone: Vorlesen klappt nur, wenn das erste Vorlesen durch Antippen ausgelöst wurde, und nicht während das
 *  Mikrofon aufnimmt. Deshalb pausiert der Kochmodus das Zuhören vorher. Falls Safari das Ende nicht meldet,
 *  geht es nach einer geschätzten Dauer trotzdem weiter. */
export function speak(text: string, onEnd?: () => void) {
  const synth = window.speechSynthesis;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    window.clearTimeout(safety);
    onEnd?.();
  };
  const safety = window.setTimeout(finish, Math.max(3000, text.length * 95));
  if (!synth) return finish();
  // cancel() direkt vor speak() verschluckt auf dem iPhone manchmal den neuen Text
  if (synth.speaking || synth.pending) synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE';
  const voice = synth.getVoices().find((v) => v.lang.startsWith('de'));
  if (voice) u.voice = voice;
  u.rate = 1;
  u.onend = finish;
  u.onerror = finish;
  synth.speak(u);
  if (synth.paused) synth.resume();
}

export function stopSpeaking() {
  window.speechSynthesis?.cancel();
}
