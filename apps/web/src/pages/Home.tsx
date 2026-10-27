import { CardBack, FeltDesktop, SuitIcon, type SuitKey } from "../art";
import { HubShell } from "./HubShell";
import { PAGE_TITLES, usePageMeta } from "./usePageMeta";
import "./fonts";

function Face({ rank, suit, red, cls }: { rank: string; suit: SuitKey; red?: boolean; cls: string }) {
  return (
    <div className={`pt-hero-card ${cls}`} style={{ color: red ? "#db3131" : "#2c2c2c" }}>
      <span className="pt-hero-rank">{rank}</span>
      <SuitIcon suit={suit} className="pt-hero-suit" />
    </div>
  );
}

/** `/` and `/home` (SPEC 1.1/1.2). */
export function Home() {
  usePageMeta(PAGE_TITLES.home);
  return (
    <HubShell active="home" title="Home">
      <section className="hub-home__hero">
        <div className="hub-home__hero-copy">
          <div className="hub-home__eyebrow">POKERTHEN</div>
          <h1>Ready to play?</h1>
          <p className="hub-home__lead">Start a private table with friends.</p>
          <div className="hub-home__buttons">
            <a className="hub-home__btn start" href="/start-game">Start a new game</a>
          </div>
        </div>
        <div className="hub-home__art" aria-hidden>
          <FeltDesktop className="pt-hero-felt" />
          <div className="pt-hero-fan">
            <div className="pt-hero-card back c1"><CardBack /></div>
            <div className="pt-hero-card back c2"><CardBack /></div>
            <Face rank="A" suit="s" cls="f1" />
            <Face rank="K" suit="h" red cls="f2" />
          </div>
        </div>
      </section>
    </HubShell>
  );
}
