// Küchen-Timer: laufen über Seitenwechsel hinweg, überleben ein Neuladen (Endzeit gespeichert)
// und klingeln mit Ton + Vibration. Hinweis: Bei gesperrtem iPhone pausiert der Browser die App –
// im Kochmodus bleibt der Bildschirm deshalb an.
import { useEffect, useState, useSyncExternalStore } from 'react';

export interface KitchenTimer {
  id: string;
  label: string;
  endsAt: number;
  seconds: number;
  recipeId?: string;
}

const KEY = 'kochbuch-timers';
let timers: KitchenTimer[] = load();
const listeners = new Set<() => void>();

function load(): KitchenTimer[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(timers));
  } catch {
    /* ignorieren */
  }
  listeners.forEach((l) => l());
}

export function useTimers(): KitchenTimer[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => timers,
  );
}

/** Aktuelle Zeit, aktualisiert jede Sekunde (nur solange Timer laufen) */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

export function startTimer(label: string, seconds: number, recipeId?: string) {
  unlockAudio();
  timers = [...timers, { id: crypto.randomUUID(), label, seconds, endsAt: Date.now() + seconds * 1000, recipeId }];
  save();
}

export function stopTimer(id: string) {
  timers = timers.filter((t) => t.id !== id);
  save();
  if (!timers.some((t) => t.endsAt <= Date.now())) stopAlarm();
}

/** Alle abgelaufenen Timer beenden (Sprachbefehl „Stopp“) */
export function stopFinished() {
  timers = timers.filter((t) => t.endsAt > Date.now());
  save();
  stopAlarm();
}

export function addTime(id: string, seconds: number) {
  timers = timers.map((t) => (t.id === id ? { ...t, endsAt: Math.max(Date.now(), t.endsAt) + seconds * 1000 } : t));
  save();
  if (!timers.some((t) => t.endsAt <= Date.now())) stopAlarm();
}

// ---------- Alarm ----------
let ctx: AudioContext | null = null;
let alarm: number | undefined;

/** iOS erlaubt Ton nur nach einer Berührung – beim Starten eines Timers freischalten */
function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* kein Ton verfügbar */
  }
}

function beep() {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  for (const [i, f] of [880, 1175, 880].entries()) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = f;
    o.type = 'sine';
    g.gain.setValueAtTime(0.0001, t0 + i * 0.22);
    g.gain.exponentialRampToValueAtTime(0.4, t0 + i * 0.22 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.22 + 0.2);
    o.connect(g).connect(ctx.destination);
    o.start(t0 + i * 0.22);
    o.stop(t0 + i * 0.22 + 0.21);
  }
  navigator.vibrate?.([300, 150, 300]);
}

function startAlarm() {
  if (alarm) return;
  beep();
  alarm = window.setInterval(beep, 1600);
}
function stopAlarm() {
  window.clearInterval(alarm);
  alarm = undefined;
}

// Prüfen, ob ein Timer abgelaufen ist
window.setInterval(() => {
  if (timers.some((t) => t.endsAt <= Date.now())) startAlarm();
}, 500);
