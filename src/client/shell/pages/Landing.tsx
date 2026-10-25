import { Logo } from '../../art';
import { Footer } from '../Footer';
import { Link } from '../Link';

/** `/` - small marketing page (research/01 §1: "Play poker online with your friends / no download required") */
export function LandingPage() {
  return (
    <div className="landing">
      <header className="landing-bar">
        <Link href="/" className="pn-logo" aria-label="PokerThen"><Logo variant="full" /></Link>
        <Link href="/home" className="landing-signin">Home</Link>
      </header>
      <section className="landing-hero">
        <h1>Play poker online with your friends</h1>
        <p className="landing-sub">no download required</p>
        <Link href="/start-game" className="hub-btn olive big">START A NEW GAME</Link>
        <p className="landing-blurb">Free private poker home game with play money. No registration needed. Up to 10 people.</p>
      </section>
      <Footer dark />
    </div>
  );
}
