import { useEffect } from 'react';
import { navigate, useRoute } from './router';
import { Icon, type IconName } from './components/Icon';
import { ConfirmHost, ToastHost } from './components/ui';
import { BookView } from './views/BookView';
import { LibraryView } from './views/LibraryView';
import { TocView } from './views/TocView';
import { ShoppingView } from './views/ShoppingView';
import { ImportView } from './views/ImportView';
import { ReviewView } from './views/ReviewView';
import { EditView } from './views/EditView';
import { MoreView } from './views/MoreView';
import { CookView } from './views/CookView';
import { TodayView } from './views/TodayView';
import { TimerBar } from './components/TimerBar';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/db';
import './styles/family.css';

const NAV: { to: string; label: string; icon: IconName; match: string }[] = [
  { to: '/buch', label: 'Buch', icon: 'book', match: 'buch' },
  { to: '/inhalt', label: 'Inhalt', icon: 'toc', match: 'inhalt' },
  { to: '/import', label: 'Import', icon: 'plus', match: 'import' },
  { to: '/rezepte', label: 'Rezepte', icon: 'list', match: 'rezepte' },
  { to: '/einkauf', label: 'Einkauf', icon: 'cart', match: 'einkauf' },
];

function Nav({ section }: { section: string }) {
  const open = useLiveQuery(() => db.shopping.filter((i) => !i.checked).count(), []);
  return (
    <nav className="nav" aria-label="Hauptnavigation">
      <div className="nav-brand">
        Koch<span>buch</span>
      </div>
      {NAV.map((n) =>
        n.match === 'import' ? (
          <a key={n.to} href={`#${n.to}`} className="nav-add" aria-label="Rezept importieren" aria-current={section === n.match ? 'page' : undefined}>
            <Icon name="plus" />
            <span className="nav-add-label">Importieren</span>
          </a>
        ) : (
          <a key={n.to} href={`#${n.to}`} className="nav-item" aria-current={section === n.match ? 'page' : undefined}>
            <Icon name={n.icon} />
            <span>{n.label}</span>
            {n.match === 'einkauf' && !!open && <span className="nav-badge">{open}</span>}
          </a>
        ),
      )}
      <a href="#/mehr" className="nav-item nav-more" aria-current={section === 'mehr' ? 'page' : undefined}>
        <Icon name="gear" />
        <span>Mehr</span>
      </a>
    </nav>
  );
}

/** Zurück zur Familien-App – nur sichtbar, wenn beim Bauen VITE_FAMILIE_URL gesetzt ist
 *  (z. B. `VITE_FAMILIE_URL=https://… npm run build`; der eigene GitHub-Pages-Deploy setzt sie nicht) */
const FAMILIE_URL = (import.meta.env.VITE_FAMILIE_URL ?? '').trim();

function FamilyBack() {
  if (!FAMILIE_URL) return null;
  return (
    <div className="family-back">
      <a href={FAMILIE_URL} className="family-back-link">
        ← Familie Ulfert
      </a>
    </div>
  );
}

export function App() {
  const { segments, query } = useRoute();
  const [section, id, sub] = segments;

  useEffect(() => {
    if (!section) navigate('/buch', { replace: true });
  }, [section]);

  // Beim Seitenwechsel nach oben scrollen (außer im Buch)
  useEffect(() => {
    if (section !== 'buch') window.scrollTo({ top: 0 });
  }, [section, id, sub]);

  let view: React.ReactNode = null;
  switch (section) {
    case 'buch':
      view = <BookView recipeId={id} />;
      break;
    case 'rezepte':
      view = sub === 'bearbeiten' && id ? <EditView id={id} /> : <LibraryView recipeId={id} tagParam={query.get('tag')} />;
      break;
    case 'inhalt':
      view = <TocView />;
      break;
    case 'einkauf':
      view = <ShoppingView />;
      break;
    case 'import':
      view = id === 'pruefen' ? <ReviewView /> : <ImportView shared={query.has('shared')} link={query.get('link')} />;
      break;
    case 'mehr':
      view = <MoreView />;
      break;
    case 'heute':
      view = <TodayView />;
      break;
    case 'kochen':
      if (id) return (
        <>
          <CookView id={id} servings={query.get('p') ? Number(query.get('p')) : null} />
          <TimerBar />
          <ToastHost />
        </>
      );
      break;
  }

  return (
    <div className={`app section-${section ?? 'buch'}${FAMILIE_URL ? ' has-family' : ''}`}>
      <Nav section={section ?? 'buch'} />
      <main className="app-main">
        <FamilyBack />
        {view}
      </main>
      <TimerBar />
      <ToastHost />
      <ConfirmHost />
    </div>
  );
}
