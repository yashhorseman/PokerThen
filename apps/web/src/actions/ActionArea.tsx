import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionKind } from "@pokerthen/shared";
import { showConfirm, useBetPanelVM, useHotkey, useOrientation, usePrefs, useServerNow, useTableActions, useTableVM } from "./deps";
import { BetPanel } from "./BetPanel";
import { RitPrompt } from "./RitPrompt";
import { ShowHandButtons } from "./ShowHandButtons";
import { LOCK_MS, buildActionButtons, clickEffect, timeBankLabel } from "./buttons";
import { useLock, useTickAt } from "./useTickAt";

/** session-global "Do not show this again in this session?" for the unnecessary-fold confirm (SPEC 6.1) */
let skipFoldConfirm = false;
export function resetFoldConfirmFlag() {
  skipFoldConfirm = false;
}

const MOBILE_UA = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

async function askUnnecessaryFold(): Promise<boolean> {
  // typo is verbatim (SPEC 6.1). The confirm primitive comes from core/ui (ARCHITECTURE 10.1).
  const r: unknown = await showConfirm({
    message: "Are you sure that you want do an unnecessary fold?",
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
    checkbox: "Do not show this again in this session?"
  });
  const obj = (r ?? {}) as { confirmed?: boolean; checked?: boolean };
  const ok = r === true || obj.confirmed === true;
  if (ok && obj.checked) skipFoldConfirm = true;
  return ok;
}

/** Root exported to TableScreen (ARCHITECTURE 10.1). Renders in the `.game-decisions-ctn` slot. */
export function ActionArea() {
  const vm = useTableVM();
  const actions = useTableActions();
  const [prefs] = usePrefs();
  const serverNow = useServerNow();
  const orientation = useOrientation();
  const bar = vm.action;
  const betPanelVM = useBetPanelVM();
  const [betOpen, setBetOpen] = useState(false);
  const [lockedLocal, lock, unlock] = useLock();
  const locked = lockedLocal || bar.lockedUntil > serverNow();

  // SPEC 6.1: re-enabled sooner on a new turn
  const prevTurn = useRef(bar.yourTurn);
  useEffect(() => {
    if (bar.yourTurn && !prevTurn.current) unlock();
    prevTurn.current = bar.yourTurn;
    if (!bar.yourTurn) setBetOpen(false);
  }, [bar.yourTurn, unlock]);

  // Auto-activate extra time (pref default Yes) once per turn when the decision limit has EXPIRED (research 06/08: the button reads
  // "Activate Extra Time (Ns)" while the clock runs and flips at expiry), only when no action is queued (SPEC 6.1).
  const autoDone = useRef(false);
  useEffect(() => {
    if (!bar.yourTurn) {
      autoDone.current = false;
      return;
    }
    const queued = bar.call?.highlighted || bar.check.highlighted || bar.fold.highlighted || bar.checkOrFold.highlighted;
    if (autoDone.current || !prefs.autoActivateTimeBank || !bar.timeBank.visible || bar.timeBank.activated || queued) return;
    const wait = bar.timeBank.limitAt == null ? 0 : Math.max(0, bar.timeBank.limitAt - serverNow());
    const id = setTimeout(() => {
      autoDone.current = true;
      actions.activateTimeBank();
    }, wait);
    return () => clearTimeout(id);
  }, [bar.yourTurn, bar.timeBank.visible, bar.timeBank.activated, bar.timeBank.limitAt, prefs.autoActivateTimeBank, actions, serverNow, bar.call?.highlighted, bar.check.highlighted, bar.fold.highlighted, bar.checkOrFold.highlighted]);

  const showHandOver = useTickAt(bar.showHand?.until, serverNow);
  const showHand = bar.showHand && bar.showHand.visible && !showHandOver ? bar.showHand : null;

  const click = useCallback(
    async (key: "call" | "raise" | "check" | "fold" | "checkOrFold") => {
      const eff = clickEffect(bar, key, { locked, skipFoldConfirm });
      switch (eff.kind) {
        case "ignore":
          return;
        case "openPanel":
          setBetOpen(true);
          return;
        case "clearIntent":
          actions.setIntendedAction(null);
          return;
        case "queue":
          actions.setIntendedAction(eff.intent as ActionKind);
          return;
        case "confirmFold":
          if (!(await askUnnecessaryFold())) return;
          lock(LOCK_MS);
          actions.fold();
          return;
        case "send":
          lock(LOCK_MS);
          actions[eff.action]();
      }
    },
    [bar, locked, actions, lock]
  );

  // Hotkeys (SPEC 6.4): core/hotkeys disables them on mobile UA / modals; handlers re-check button state.
  useHotkey("k", () => void click("check"));
  useHotkey("c", () => void click("call"));
  useHotkey("r", () => void click("raise"));
  useHotkey("f", () => void click("fold"));
  useHotkey("i", () => void click("checkOrFold"));
  useHotkey("t", () => {
    if (bar.timeBank.visible && !bar.timeBank.activated) actions.activateTimeBank();
  });
  useHotkey("s", () => {
    if (showHand) actions.showHand("all");
  });
  useHotkey("1", () => {
    if (showHand?.cards[0] && !showHand.shown?.includes(showHand.cards[0])) actions.showHand(showHand.cards[0]);
  });
  useHotkey("2", () => {
    if (showHand?.cards[1] && !showHand.shown?.includes(showHand.cards[1])) actions.showHand(showHand.cards[1]);
  });

  // Esc returns from the bet panel (SPEC 6.3)
  useEffect(() => {
    if (!betOpen) return;
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.keyCode === 27) setBetOpen(false);
    };
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  }, [betOpen]);

  // ---- Cancel ingress (SPEC 2.4): red full-width bottom button while the viewer's request is pending
  if (bar.cancelIngress) {
    return (
      <div className="game-decisions-ctn">
        <button type="button" className="button-1 action-button red highlighted cancel-request-ingress" onClick={() => actions.cancelIngress()}>
          Cancel Game Ingress Request
        </button>
      </div>
    );
  }

  const rit = bar.rit && bar.rit.visible ? bar.rit : null;
  const anything = bar.visible || bar.iAmBack || showHand || rit;
  if (!anything) return null;

  const panel = betPanelVM;
  const showPanel = betOpen && bar.yourTurn && !!panel;
  const buttons = buildActionButtons(bar, locked);
  const tip: Record<string, string> = { call: "c", raise: "r", check: "k", fold: "f" };

  return (
    <div className={"game-decisions-ctn" + (bar.low && bar.visible && !rit && !showHand && !bar.iAmBack ? " low" : "") + (showPanel ? " bet-open" : "")}>
      {bar.yourTurn && !showPanel && (
        <div className="action-signal your-turn">
          <span className="blinker-dot" />
          <span className="action-signal-text">Your Turn</span>
        </div>
      )}
      {bar.timeBank.visible && bar.yourTurn && (
        <button
          type="button"
          className={"button-1 time-bank suspended-action with-tip" + (bar.timeBank.activated ? " highlighted" : "") + (showPanel ? " high" : "")}
          data-tip="t"
          disabled={bar.timeBank.activated}
          onClick={() => actions.activateTimeBank()}
        >
          {timeBankLabel(bar.timeBank)}
        </button>
      )}
      {bar.checkOrFold.visible && !bar.yourTurn && (
        <button
          type="button"
          className={"button-1 check-or-fold suspended-action with-tip" + (bar.checkOrFold.highlighted ? " highlighted" : "")}
          data-tip="i"
          onClick={() => void click("checkOrFold")}
        >
          Check or Fold
        </button>
      )}

      {rit ? (
        <RitPrompt answered={rit.answered} onVote={(d) => actions.voteRunItTwice(d)} />
      ) : showPanel && panel ? (
        <BetPanel
          panel={panel}
          centsMode={vm.config.centsMode}
          autoFocus={orientation === "landscape" && !MOBILE_UA.test(typeof navigator === "undefined" ? "" : navigator.userAgent)}
          onBack={() => setBetOpen(false)}
          onSubmit={(v) => {
            setBetOpen(false);
            lock(LOCK_MS);
            if (v > panel.highestBet) actions.raise(v);
            else actions.call();
          }}
        />
      ) : (
        <>
          {bar.iAmBack && (
            <button type="button" className="button-1 action-button green highlighted iamback" onClick={() => actions.sitBack()}>
              I'm Back
            </button>
          )}
          {showHand && <ShowHandButtons cards={showHand.cards} shown={showHand.shown} onShow={(w) => actions.showHand(w)} />}
          {bar.visible && !showHand && !bar.iAmBack && (
            <div className="action-buttons">
              {buttons.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  className={`button-1 action-button with-tip ${b.color} ${b.className}` + (b.highlighted ? " highlighted" : "")}
                  data-tip={tip[b.key]}
                  disabled={!b.enabled}
                  onClick={() => void click(b.key)}
                >
                  {b.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
