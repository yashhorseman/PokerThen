import { HubFrame } from '../Sidebar';
import { Footer } from '../Footer';
import { Link } from '../Link';

/** /home - hub for returning users (research/01 §2) */
export function HomePage() {
  return (
    <HubFrame title="Home" icon="home">
      <section className="hub-hero">
        <div className="hub-hero-text">
          <div className="hub-eyebrow">POKERTHEN</div>
          <h2>Ready to play?</h2>
          <p>Start a private table with friends.</p>
        </div>
        <div className="hub-hero-actions">
          <Link href="/start-game" className="hub-btn olive">START A NEW GAME</Link>
        </div>
      </section>
      <div className="hub-spacer" />
      <Footer />
    </HubFrame>
  );
}
