import { ui, useUi } from '../state/ui';
import { BRAND } from './lib';

/** hydrate the "accepted" flag once (localStorage `acceptedTOS` = ISO date, research/01 §3) */
let hydrated = false;
export function hydrateTos() {
  if (hydrated) return; hydrated = true;
  try { if (localStorage.getItem('acceptedTOS')) ui.set({ tosAccepted: true }); } catch { /* storage unavailable */ }
}

/** `.tos-agreement` - fixed bottom white bar (research/01 §3).  Brand reworded to PokerThen. */
export function TosBar() {
  hydrateTos();
  const accepted = useUi((s) => s.tosAccepted);
  if (accepted) return null;
  return (
    <div className="sh-tos">
      <span>
        <b>Important:</b> by using {BRAND} platform you accept our{' '}
        <a href="/terms" target="_blank" rel="noopener">Terms of Service</a> and{' '}
        <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.
      </span>
      <button
        type="button"
        className="sh-btn green small"
        onClick={() => {
          try { localStorage.setItem('acceptedTOS', new Date().toISOString()); } catch { /* ignore */ }
          ui.set({ tosAccepted: true });
        }}
      >Got it!</button>
    </div>
  );
}
