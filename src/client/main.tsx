import { createRoot } from 'react-dom/client';
import { useEffect } from 'react';
import './styles/canvas.css';
import './styles/shell.css';
import './styles/shell-overlays.css';
import { matchRoute, usePath } from './shell/router';
import { LandingPage } from './shell/pages/Landing';
import { HomePage } from './shell/pages/Home';
import { StartGamePage } from './shell/pages/StartGame';
import { GamePage } from './shell/pages/GamePage';
import { DevTablePage } from './shell/pages/DevTablePage';
import { LegalPage } from './shell/pages/Legal';
import { uiStore, ui } from './state/ui';
import { appStore } from './state/store';
import { prefsStore } from './state/prefs';

/** Pathname router (research/01 §1): `/` landing, `/home` hub, `/start-game`, `/games/:id`, `/__dev/table`. Unknown -> landing. */
function App() {
  const route = matchRoute(usePath());
  const canvasPage = route.name === 'start' || route.name === 'game' || route.name === 'devtable';

  // Leaving a canvas page must reset html font-size/classes (Canvas only owns them while mounted)
  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle('doc-page', !canvasPage);
    if (!canvasPage) {
      html.classList.remove('portrait', 'landscape');
      html.style.fontSize = '';
      html.style.height = '';
      html.style.removeProperty('--table-design-system-zoom');
      window.scrollTo(0, 0);
    }
  }, [canvasPage, route.name]);

  switch (route.name) {
    case 'home': return <HomePage />;
    case 'start': return <StartGamePage />;
    case 'game': return <GamePage key={route.id} gameId={route.id} />;
    case 'devtable': return <DevTablePage />;
    case 'legal': return <LegalPage kind={route.kind} />;
    default: return <LandingPage />;
  }
}

// Test / dev hooks (Playwright scripts drive overlays through these): only with ?devhooks or ?mock in the URL
if (/[?&](devhooks|mock)\b/.test(location.search) || location.pathname.startsWith('/__dev')) {
  (window as unknown as Record<string, unknown>).__pt = { ui, uiStore, appStore, prefsStore };
}

createRoot(document.getElementById('root')!).render(<App />);
