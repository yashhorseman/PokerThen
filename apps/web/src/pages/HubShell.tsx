import { useEffect, useState, type ReactNode } from "react";
import { Icon, Logo } from "../art";
import { lsGet, lsSet } from "./usePageMeta";

export type HubNav = "home" | "new-game" | "none";

export function HubFooter() {
  return (
    <footer className="main-footer">
      <div className="pt-footer-copy">© PokerThen 2026</div>
      <nav className="pt-footer-links">
        {/* U-H1: Terms / Privacy documents are not written yet; links go to placeholders */}
        <a href="/terms">Terms of Service</a>
        <a href="/privacy">Privacy Policy</a>
      </nav>
    </footer>
  );
}

/** Sidebar (desktop) / top bar + drawer (<= 1024px) shared by Home, Tutorial and Verify. SPEC 1.2. */
export function HubShell({ active, title, icon = "house", children }: { active: HubNav; title: string; icon?: "house" | "shield" | "info"; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => lsGet("ptSidebarCollapsed") === "1");
  const [drawer, setDrawer] = useState(false);
  useEffect(() => { lsSet("ptSidebarCollapsed", collapsed ? "1" : "0"); }, [collapsed]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawer(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);

  const nav = (
    <nav className="pt-sidebar-nav" aria-label="Main">
      <a className={"pt-nav-item" + (active === "home" ? " active" : "")} href="/home"><Icon name="house" size="1.2em" /><span className="pt-nav-label">Home</span></a>
      <div className="pt-nav-group">Play with Friends</div>
      <a className={"pt-nav-item" + (active === "new-game" ? " active" : "")} href="/start-game"><Icon name="plus" size="1.2em" /><span className="pt-nav-label">New Game</span></a>
    </nav>
  );

  return (
    <div className={"pt-hub" + (collapsed ? " collapsed" : "")}>
      <aside className="pt-sidebar">
        <div className="pt-sidebar-head">
          <a href="/" className="pt-sidebar-logo" aria-label="PokerThen home"><Logo variant={collapsed ? "mark" : "full"} height={collapsed ? 28 : 28} /></a>
          <button type="button" className="pt-collapse" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed((c) => !c)}>
            <Icon name={collapsed ? "chevron-right" : "chevron-left"} size={18} />
          </button>
        </div>
        {nav}
      </aside>

      <header className="pt-appbar">
        <a href="/" className="pt-sidebar-logo" aria-label="PokerThen home"><Logo height={28} /></a>
        <button type="button" className="pt-hamburger" aria-label="Open menu" aria-expanded={drawer} onClick={() => setDrawer(true)}><Icon name="menu" size={22} /></button>
      </header>

      {drawer && (
        <div className="pt-drawer-scrim" onClick={() => setDrawer(false)}>
          <div className="pt-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="pt-drawer-head">
              <Logo height={28} />
              <button type="button" className="pt-hamburger" aria-label="Close menu" onClick={() => setDrawer(false)}><Icon name="close" size={22} /></button>
            </div>
            {nav}
          </div>
        </div>
      )}

      <main className="pt-hub-main">
        <div className="hub-title-bar"><Icon name={icon} size={20} /><h2>{title}</h2></div>
        {children}
        <HubFooter />
      </main>
    </div>
  );
}
