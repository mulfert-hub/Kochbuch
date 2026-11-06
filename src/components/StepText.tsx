// Schritttext mit Timer-Knöpfen für erkannte Zeitangaben („20 Minuten“ → ⏱ 20 Min.).
import { startTimer } from '../cook/timers';
import { findDurations, formatDurationShort } from '../lib/durations';
import { toast } from './ui';
import { Icon } from './Icon';

export function TimerChips({ text, label, recipeId, large }: { text: string; label: string; recipeId?: string; large?: boolean }) {
  const found = findDurations(text);
  if (!found.length) return null;
  return (
    <span className={`timer-chips${large ? ' is-large' : ''}`}>
      {found.map((d, i) => (
        <button
          key={i}
          type="button"
          className="timer-chip"
          onClick={(e) => {
            e.stopPropagation();
            startTimer(label, d.seconds, recipeId);
            toast(`Timer ${formatDurationShort(d.seconds)} gestartet`);
          }}
          aria-label={`Timer ${formatDurationShort(d.seconds)} starten`}
        >
          <Icon name="clock" /> {formatDurationShort(d.seconds)}
          {d.maxSeconds ? ` (bis ${formatDurationShort(d.maxSeconds)})` : ''}
        </button>
      ))}
    </span>
  );
}
