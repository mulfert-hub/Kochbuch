// Laufende Timer als schwebende Leiste über der Navigation – auf jeder Seite sichtbar.
import { addTime, stopTimer, useNow, useTimers } from '../cook/timers';
import { formatClock } from '../lib/durations';
import { Icon } from './Icon';

export function TimerBar() {
  const timers = useTimers();
  const now = useNow(timers.length > 0);
  if (!timers.length) return null;
  return (
    <div className="timer-bar" role="region" aria-label="Laufende Timer">
      {timers.map((t) => {
        void now; // löst die sekündliche Aktualisierung aus
        const left = (t.endsAt - Date.now()) / 1000;
        const done = left <= 0;
        return (
          <div key={t.id} className={`timer${done ? ' is-done' : ''}`} role={done ? 'alert' : undefined}>
            <Icon name="clock" />
            <span className="timer-label">{t.label}</span>
            <strong className="timer-time">{done ? 'Fertig!' : formatClock(left)}</strong>
            {!done && (
              <button className="icon-btn sm" onClick={() => addTime(t.id, 60)} aria-label="Eine Minute mehr">
                +1
              </button>
            )}
            <button className="icon-btn sm" onClick={() => stopTimer(t.id)} aria-label={done ? 'Alarm beenden' : 'Timer abbrechen'}>
              <Icon name={done ? 'check' : 'close'} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
