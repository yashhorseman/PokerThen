import { useEffect, useState, type ReactNode } from 'react';
import { Icon, Logo } from '../art';
import { Link } from './Link';
import { lsGet, lsSet } from './lib';

/**
 * The hub frame shared by /home (research/01 §2): fixed dark sidebar (240px, collapsible to 64px),
 * main column with a page-title bar.  <= 1024px the sidebar becomes a 48px top app bar + left drawer.
 * Community / upsell items of the reference are intentionally not rendered (SPEC: out of scope).
 */
export function HubFrame({ title, icon, children }: { title: string; icon: 'home'; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState<boolean>(() => lsGet('pnSidebarCollapsed', false));
  const [drawer, setDrawer] = useState(false);
  useEffect(() => { lsSet('pnSidebarCollapsed', collapsed); }, [collapsed]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const logo = (
    <Link href="/" className="pn-logo" aria-label="PokerThen"><Logo variant="full" /></Link>
  );
  return (
    <div className={'hub' + (collapsed ? ' collapsed' : '') + (drawer ? ' drawer-open' : '')}>
      <header className="pn-topbar">
        {logo}
        <button type="button" className="pn-hamburger" aria-label="Menu" onClick={() => setDrawer(true)}><Icon name="hamburger" size="26px" /></button>
      </header>
      <div className="pn-scrim" onClick={() => setDrawer(false)} />
      <aside className="pn-sidebar" aria-label="Main menu">
        <div className="pn-sidebar-head">
          {logo}
          <button type="button" className="pn-collapse" aria-label={collapsed ? 'Expand menu' : 'Collapse menu'} onClick={() => setCollapsed((c) => !c)}><Icon name="collapse" size="24px" /></button>
        </div>
        <nav className="pn-nav">
          <Link href="/home" className="pn-item active" onClick={() => setDrawer(false)}><Icon name="home" size="20px" /><span>Home</span></Link>
          <hr />
          <div className="pn-group">Play with Friends</div>
          <Link href="/start-game" className="pn-item" onClick={() => setDrawer(false)}><Icon name="new-game" size="20px" /><span>New Game</span></Link>
        </nav>
      </aside>
      <main className="hub-main">
        <div className="hub-title"><Icon name={icon} size="22px" /><h1>{title}</h1></div>
        {children}
      </main>
    </div>
  );
}
