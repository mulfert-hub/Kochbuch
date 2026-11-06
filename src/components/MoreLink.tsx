import { Icon } from './Icon';

/** Zahnrad-Link zu „Mehr“ (nur auf dem Handy sichtbar – am Desktop steht es in der Seitenleiste). */
export function MoreLink({ className = '' }: { className?: string }) {
  return (
    <a href="#/mehr" className={`icon-btn mobile-only ${className}`} aria-label="Mehr: Backup & Einstellungen">
      <Icon name="gear" />
    </a>
  );
}
