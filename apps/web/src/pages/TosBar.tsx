import { useState } from "react";
import { lsGet, lsSet } from "./usePageMeta";

/** `.tos-agreement` bar (SPEC 1.3): shown on /start-game and on tables until `Got it!` stores localStorage `acceptedTOS`. */
export function TosBar() {
  const [accepted, setAccepted] = useState(() => lsGet("acceptedTOS") !== null);
  if (accepted) return null;
  return (
    <div className="tos-agreement">
      <span>
        <b>Important:</b> by using PokerThen you accept our <a href="/terms" target="_blank" rel="noreferrer">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
      </span>
      <button type="button" className="button-1 green small-button pt-tos-ok" onClick={() => { lsSet("acceptedTOS", new Date().toISOString()); setAccepted(true); }}>
        Got it!
      </button>
    </div>
  );
}
