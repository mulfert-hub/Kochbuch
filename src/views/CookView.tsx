// Kochmodus: ein Schritt pro Bildschirm, große Schrift, Bildschirm bleibt an,
// passende Zutaten mit Mengen direkt beim Schritt, Timer per Knopf.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { back } from '../router';
import { Icon } from '../components/Icon';
import { TimerChips } from '../components/StepText';
import { formatAmount } from '../lib/quantity';
import { inflectName } from '../lib/units';
import type { Ingredient } from '../types';
import { ingredientsInStep } from '../lib/cookMatch';
import { parseCookCommand } from '../lib/spoken';
import { speak, speechSupported, stopSpeaking, useContinuousListening } from '../cook/voice';
import { startTimer, stopFinished } from '../cook/timers';
import { findDurations, formatDurationShort } from '../lib/durations';

function useWakeLock() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        lock = (await navigator.wakeLock?.request('screen')) ?? null;
        if (cancelled) await lock?.release();
        else setActive(!!lock);
        lock?.addEventListener('release', () => setActive(false));
      } catch {
        setActive(false);
      }
    };
    void request();
    const onVis = () => document.visibilityState === 'visible' && void request();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release();
    };
  }, []);
  return active;
}

export function CookView({ id, servings }: { id: string; servings: number | null }) {
  const recipe = useLiveQuery(() => db.recipes.get(id), [id]);
  const [page, setPage] = useState(0);
  const wake = useWakeLock();
  const touch = useRef<{ x: number; y: number } | null>(null);
  const steps = recipe?.steps ?? [];
  const total = steps.length + 1; // Seite 0 = Zutaten
  const factor = recipe?.servings && servings ? servings / recipe.servings : 1;

  const amount = (i: Ingredient) => formatAmount(i.quantity, i.quantityMax, i.unit, factor);
  const name = (i: Ingredient) => inflectName(i.name, i.unit, i.quantity == null ? null : i.quantity * factor);
  const go = (d: number) => setPage((p) => Math.min(total, Math.max(0, p + d)));

  // ---------- Sprachsteuerung ----------
  const [voiceOn, setVoiceOn] = useState(false);
  const [heard, setHeard] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const pageRef = useRef(page);
  pageRef.current = page;
  const pageText = (p: number) => {
    if (!recipe) return '';
    if (p === 0) return `Zutaten: ${recipe.ingredients.map((i) => `${amount(i)} ${name(i)}`.trim()).join(', ')}.`;
    if (p > steps.length) return 'Fertig. Guten Appetit!';
    return `Schritt ${p}. ${steps[p - 1]}`;
  };
  const say = (text: string) => {
    voice.pause();
    // kurz warten, bis das iPhone vom Mikrofon auf den Lautsprecher umgeschaltet hat
    window.setTimeout(() => speak(text, () => voice.resume()), 350);
  };
  const [voiceStarting, setVoiceStarting] = useState(false);
  const startingRef = useRef(false);
  const voice = useContinuousListening(
    voiceOn,
    (text) => {
      const cmd = parseCookCommand(text);
      setHeard(cmd ? text : `„${text}“ – nicht verstanden`);
      if (!cmd) return;
      const p = pageRef.current;
      if (cmd.type === 'next' || cmd.type === 'prev') {
        const target = Math.min(total, Math.max(0, p + (cmd.type === 'next' ? 1 : -1)));
        setPage(target);
        say(pageText(target));
      } else if (cmd.type === 'read') say(pageText(p));
      else if (cmd.type === 'ingredients') {
        setPage(0);
        say(pageText(0));
      } else if (cmd.type === 'timer') {
        startTimer(`${recipe?.title ?? 'Timer'}`, cmd.seconds, id);
        say(`Timer ${formatDurationShort(cmd.seconds).replace('Min.', 'Minuten').replace('Std.', 'Stunden').replace('Sek.', 'Sekunden')} gestartet.`);
      } else if (cmd.type === 'stepTimer') {
        const d = p > 0 && p <= steps.length ? findDurations(steps[p - 1])[0] : undefined;
        if (d) {
          startTimer(`${recipe?.title ?? 'Rezept'} – Schritt ${p}`, d.seconds, id);
          say(`Timer ${formatDurationShort(d.seconds).replace('Min.', 'Minuten').replace('Std.', 'Stunden')} gestartet.`);
        } else say('In diesem Schritt steht keine Zeit. Sag zum Beispiel: Timer zehn Minuten.');
      } else if (cmd.type === 'stopAlarm') stopFinished();
      else if (cmd.type === 'stopListening') setVoiceOn(false);
    },
    (msg) => {
      setVoiceError(msg);
      setVoiceOn(false);
    },
  );
  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') go(1);
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'Escape') back(`/rezepte/${id}`);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  const stepIngredients = useMemo(
    () => steps.map((s) => ingredientsInStep(s, recipe?.ingredients ?? [])),
    [steps, recipe?.ingredients],
  );

  if (recipe === undefined) return null;
  if (!recipe) return <div className="page"><div className="empty"><h2>Rezept nicht gefunden</h2></div></div>;

  const isEnd = page === total;

  return (
    <div
      className="cook"
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const t = touch.current;
        touch.current = null;
        if (!t) return;
        const dx = e.changedTouches[0].clientX - t.x;
        const dy = e.changedTouches[0].clientY - t.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
      }}
    >
      <header className="cook-head">
        <button className="icon-btn" onClick={() => back(`/rezepte/${id}`)} aria-label="Kochmodus beenden">
          <Icon name="close" />
        </button>
        <div className="cook-title">
          <strong>{recipe.title}</strong>
          <span>
            {page === 0 ? 'Zutaten' : isEnd ? 'Fertig' : `Schritt ${page} von ${steps.length}`}
            {servings ? ` · ${String(servings).replace('.', ',')} ${recipe.servingsLabel ?? 'Portionen'}` : ''}
          </span>
        </div>
        <span className={`cook-wake${wake ? ' is-on' : ''}`} title={wake ? 'Bildschirm bleibt an' : 'Bildschirm kann ausgehen'}>
          {wake ? 'Bildschirm bleibt an' : ''}
        </span>
        {speechSupported() && (
          <button
            className={`icon-btn cook-mic${voiceOn || voiceStarting ? ' is-on' : ''}`}
            onClick={() => {
              setVoiceError(null);
              setHeard(null);
              if (voiceOn || voiceStarting) {
                setVoiceOn(false);
                setVoiceStarting(false);
                startingRef.current = false;
                stopSpeaking();
              } else {
                // Erst vorlesen (durch Antippen erlaubt das iPhone das Vorlesen), danach das Mikrofon einschalten
                setVoiceStarting(true);
                startingRef.current = true;
                speak(pageText(page), () => {
                  if (!startingRef.current) return;
                  startingRef.current = false;
                  setVoiceStarting(false);
                  setVoiceOn(true);
                });
              }
            }}
            aria-pressed={voiceOn || voiceStarting}
            aria-label={voiceOn || voiceStarting ? 'Sprachsteuerung aus' : 'Sprachsteuerung an'}
          >
            <Icon name="mic" />
          </button>
        )}
      </header>
      {(voiceOn || voiceStarting || voiceError) && (
        <div className={`cook-voice${voiceError ? ' is-error' : ''}`} role="status">
          {voiceError ?? (
            <>
              <strong>{voiceStarting ? 'Ich lese vor …' : voice.listening ? 'Ich höre zu.' : 'Mikrofon startet …'}</strong>
              <span>Sag „weiter“, „zurück“, „vorlesen“, „Timer 10 Minuten“, „Timer stellen“ oder „Stopp“.</span>
              {heard && <span className="cook-heard">{heard}</span>}
            </>
          )}
        </div>
      )}
      <div className="cook-progress">
        <i style={{ width: `${(page / total) * 100}%` }} />
      </div>

      <main className="cook-body" key={page}>
        {page === 0 && (
          <>
            <h1 className="cook-step-no">Zutaten</h1>
            <ul className="cook-ings">
              {recipe.ingredients.map((i) => (
                <li key={i.id}>
                  <span className="ing-amount">{amount(i)}</span> <span>{name(i)}{i.note ? `, ${i.note}` : ''}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {page > 0 && !isEnd && (
          <>
            <div className="cook-step-no">{page}</div>
            <p className="cook-step-text">{steps[page - 1]}</p>
            <TimerChips text={steps[page - 1]} label={`${recipe.title} – Schritt ${page}`} recipeId={recipe.id} large />
            {stepIngredients[page - 1].length > 0 && (
              <div className="cook-step-ings">
                <span className="eyebrow">Dafür</span>
                {stepIngredients[page - 1].map((i) => (
                  <span key={i.id} className="cook-ing-chip">
                    <strong>{amount(i)}</strong> {name(i)}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
        {isEnd && (
          <div className="cook-end">
            <div className="cook-step-no">Guten Appetit!</div>
            <button className="btn btn-primary btn-lg" onClick={() => back(`/rezepte/${id}`)}>
              <Icon name="check" /> Fertig
            </button>
          </div>
        )}
      </main>

      <footer className="cook-nav">
        <button className="btn btn-lg" onClick={() => go(-1)} disabled={page === 0}>
          <Icon name="back" /> Zurück
        </button>
        <button className="btn btn-primary btn-lg" onClick={() => go(1)} disabled={isEnd}>
          {page === 0 ? "Los geht's" : page === steps.length ? 'Fertig' : 'Weiter'} <Icon name="next" />
        </button>
      </footer>
    </div>
  );
}
