import { Logo } from '../../art';
import { Footer } from '../Footer';
import { Link } from '../Link';
import { BRAND } from '../lib';

/** Minimal Terms / Privacy pages so the TOS bar links resolve (placeholder text - see docs/OPEN-QUESTIONS.md) */
export function LegalPage({ kind }: { kind: 'terms' | 'privacy' }) {
  return (
    <div className="landing">
      <header className="landing-bar">
        <Link href="/" className="pn-logo"><Logo variant="full" /></Link>
      </header>
      <section className="legal">
        {kind === 'terms' ? (
          <>
            <h1>Terms of Service</h1>
            <p>{BRAND} is a free, play-money poker game. No real money is wagered, won or lost, and chips have no cash value.</p>
            <p>Tables are private: only people who receive a table link can join. The table owner decides who may sit, and may remove players.</p>
            <p>Please be respectful in the table chat. We may remove tables or block access that abuse the service.</p>
          </>
        ) : (
          <>
            <h1>Privacy Policy</h1>
            <p>{BRAND} needs no account. A random identifier is stored in a cookie so that you keep your seat when you reload the page.</p>
            <p>Table state (players' nicknames, hands and chat while chat recording is on) is stored on the server for the lifetime of the table.</p>
            <p>Preferences are stored only in your browser.</p>
          </>
        )}
      </section>
      <Footer dark />
    </div>
  );
}
