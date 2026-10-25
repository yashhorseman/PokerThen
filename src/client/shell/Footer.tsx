import { Link } from './Link';
import { BRAND } from './lib';

/** `.main-footer` (research/01 §2): community / social links of the reference are dropped */
export function Footer({ dark = false }: { dark?: boolean }) {
  return (
    <footer className={'main-footer' + (dark ? ' dark' : '')}>
      <span>© {BRAND} {new Date().getFullYear()}</span>
      <Link href="/terms">Terms of Service</Link>
      <Link href="/privacy">Privacy Policy</Link>
    </footer>
  );
}
