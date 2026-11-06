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
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/db';

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
      view = sub === 'bearbeiten' && id ? <EditView id={id} /> : <LibraryView recipeId={id} />;
      break;
    case 'inhalt':
      view = <TocView />;
      break;
    case 'einkauf':
      view = <ShoppingView />;
      break;
    case 'import':
      view = id === 'pruefen' ? <ReviewView /> : <ImportView shared={query.has('shared')} />;
      break;
    case 'mehr':
      view = <MoreView />;
      break;
  }

  return (
    <div className={`app section-${section ?? 'buch'}`}>
      <Nav section={section ?? 'buch'} />
      <main className="app-main">{view}</main>
      <ToastHost />
      <ConfirmHost />
    </div>
  );
}
