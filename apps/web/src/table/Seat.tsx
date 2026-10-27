import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PLACEHOLDERS, type HandChipVM, type PlayerVM, type SeatVM, type TimerVM } from "@pokerthen/shared";
import { SitPopover, openEditPlayer, useTableVM, useChatVM, useOrientation, usePrefs, useServerNow, useTableActions } from "./deps";
import { HoleCards } from "./Cards";
import { TIcon } from "./TIcon";
import { nameShrinkClass, timerSegments, truncateBubble } from "./logic";
import { useTick } from "./useTick";

/* ---------- timer bar (SPEC 7.3) ---------- */
export function TimerBar({ timer, long }: { timer: TimerVM; long?: boolean }) {
  const paused = useRef<number | null>(null);
  const frozenAt = timer.paused ? (paused.current ??= timer.serverNow()) : (paused.current = null);
  useTick(100, !timer.paused);
  const now = frozenAt ?? timer.serverNow();
  const s = timerSegments(timer, now, timer.offline);
  return (
    <div className={`time-to-talk${long ? " long" : ""}`}>
      {s.bankPct > 0 && <div className={`time-bank${s.bankRed ? " red" : ""}`} style={{ width: `${s.bankPct}%` }} />}
      <div className={`normal-time${s.normalRed ? " red" : ""}${timer.offline ? " time-bank" : ""}`} style={{ width: `${s.normalPct}%` }} />
    </div>
  );
}

/* ---------- equity pill (SPEC 13.3) ---------- */
export function EquityPill({ equity }: { equity: NonNullable<PlayerVM["equity"]> }) {
  return (
    <div className="win-odds-container">
      <p className={`win-odds numbers-signal${equity.gray ? " gray" : equity.leader ? " leader" : " trailer"}`}>{Math.round(equity.pct)}%</p>
    </div>
  );
}

/* ---------- hand chip (SPEC 4.8) ---------- */
export function HandChip({ chip }: { chip: HandChipVM }) {
  return (
    <div className={`player-hand-message-ctn tone-${chip.tone}${chip.twoRuns ? " two-runs" : ""}${chip.rabbit ? " rabbit" : ""}`}>
      {chip.rows.map((r, i) => (
        <div key={i} className={`hand-message-row${r.active ? " active" : ""}`}>
          {chip.twoRuns && <span className={`run-tag run-tag-${r.run ?? i + 1}`}>{`#${r.run ?? i + 1}`}</span>}
          <span className="hand-message-text">{r.text}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- chat bubble ---------- */
function Bubble({ bubble }: { bubble: NonNullable<PlayerVM["bubble"]> }) {
  const serverNow = useServerNow();
  const [, force] = useState(0);
  useEffect(() => {
    const ms = bubble.until - serverNow();
    if (ms <= 0) return;
    const t = setTimeout(() => force((n) => n + 1), ms + 5);
    return () => clearTimeout(t);
  }, [bubble.until]);
  if (serverNow() >= bubble.until) return null;
  return <div className="table-player-chat-message"><span className="table-player-chat-tail" />{truncateBubble(bubble.text)}</div>;
}

/* ---------- status text ---------- */
function statusCaption(p: PlayerVM): string | null {
  const base = p.statusLabel;
  if (!base && p.offline) return "Offline";
  if (!base) return null;
  let t: string = base;
  if (p.away && base !== "Away") t += " (Away)";
  if (p.offline) t += " (Offline)";
  return t;
}
const STATUS_ICON: Record<string, "fold" | "clock" | "away" | "exit"> = { Fold: "fold", Waiting: "clock", Away: "away", "In Next Hand": "clock", Quitting: "exit" };

/* ---------- occupied seat ---------- */
export const Plate = memo(function Plate({ position, p }: { position: number; p: PlayerVM }) {
  const orientation = useOrientation();
  const [prefs] = usePrefs();
  const actions = useTableActions();
  const chat = useChatVM();
  const isOwner = useTableVM().owner.isOwner;
  const nameRef = useRef<HTMLDivElement>(null);
  const [shrink, setShrink] = useState("");
  const [menu, setMenu] = useState(false);
  const [emojiMenu, setEmojiMenu] = useState(false);
  const [avatarHidden, setAvatarHidden] = useState(false);
  const seatRef = useRef<HTMLDivElement>(null);

  // name auto-shrink, measured at mount / name change (SPEC 4.5)
  useLayoutEffect(() => {
    const el = nameRef.current;
    if (!el) return;
    el.classList.remove("shrink-1", "shrink-2", "shrink-3");
    setShrink(nameShrinkClass(el.scrollWidth - el.offsetWidth));
  }, [p.name]);

  useEffect(() => {
    if (!menu && !emojiMenu) return;
    const down = (e: Event) => { if (!seatRef.current?.contains(e.target as Node)) { setMenu(false); setEmojiMenu(false); } };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, [menu, emojiMenu]);

  const caption = statusCaption(p);
  const showAwayChip = !p.handChip && p.cards.length > 0 && (p.away || p.offline);
  const muted = chat.mutedIds.includes(p.id);
  // reference: `forceSubSuit = (orientation === "portrait")` for EVERY player's hole cards (not only the viewer's), so opponents' shown cards also carry the small suit under the rank
  const subSuit = orientation === "portrait";
  const cls = [
    "table-player", `table-player-${position}`,
    p.isYou ? "you" : "", p.offline ? "offline" : "", p.folded ? "folded" : "", p.away ? "away" : "",
    p.isDecision ? "has-decision" : ""
  ].filter(Boolean).join(" ");
  const showBadges = !prefs.hideBadges && !prefs.hideAchivementBadges;
  const showEmoji = !prefs.hideMoodEmojis && !avatarHidden;
  return (
    <div ref={seatRef} className={cls} data-seat={position}>
      <div
        className={`table-player-infos-ctn${p.isDecision ? " decision-current" : ""}${p.isWinner ? " winner" : ""}${p.isYou ? " you" : ""}${p.statusLabel ? " dimmed" : ""}${p.cards.length ? "" : " no-cards"}`}
        onClick={() => { if (!p.isYou) setMenu((m) => !m); }}
      >
        {caption && (
          <div className="table-player-status-icon">
            {p.statusLabel && STATUS_ICON[p.statusLabel] && <TIcon name={STATUS_ICON[p.statusLabel]!} className="status-glyph" />}
            <span className="status-caption">{caption}</span>
          </div>
        )}
        <div ref={nameRef} className={`table-player-name ${shrink}`} title={undefined}>{p.name}</div>
        <div className="table-player-stack">
          <span className={`stack-text${p.stackIsAllIn ? " all-in" : ""}`}>{p.stackText}</span>
          {p.gainedText && <span className={`table-player-stack-prize${p.gainedNegative ? " negative" : ""}`}>{p.gainedText}</span>}
        </div>
        {p.timer && <TimerBar timer={p.timer} />}
      </div>
      <HoleCards cards={p.cards} folded={p.cardsFolded} subSuit={subSuit} />
      {p.equity && <EquityPill equity={p.equity} />}
      {p.handChip ? <HandChip chip={p.handChip} /> : showAwayChip ? (
        <div className="player-hand-message-ctn tone-red status-chip"><div className="hand-message-row"><span className="hand-message-text">{p.offline && p.away ? "Offline & Away" : p.offline ? "Offline" : "Away"}</span></div></div>
      ) : null}
      {showBadges && (p.winCount > 0 || p.quitCount > 0) && (
        <div className="player-table-signals-container top">
          {p.winCount > 0 && <span className="signal signal-win"><TIcon name="trophy" />{p.winCount}</span>}
          {p.quitCount > 0 && <span className="signal signal-quit"><TIcon name="exit" />{p.quitCount}</span>}
        </div>
      )}
      {p.emoji && showEmoji && <div className="emoji-container">{p.emoji}</div>}
      {p.isYou && !prefs.hideMoodEmojis && (
        <>
          <button type="button" className="emoji-picker-button" onClick={() => setEmojiMenu((m) => !m)}>Select</button>
          {emojiMenu && (
            <div className="pt-emoji-menu">
              {PLACEHOLDERS.EMOJI /* U-E1 */.map((e) => (
                <button key={e} type="button" onClick={() => { actions.setEmoji(e); setEmojiMenu(false); }}>{e}</button>
              ))}
              <button type="button" className="clear" onClick={() => { actions.setEmoji(null); setEmojiMenu(false); }}>{"×"}</button>
            </div>
          )}
        </>
      )}
      {p.bet && <div className={`table-player-bet-value${p.bet.check ? " check" : ""}`}>{p.bet.text}</div>}
      {p.bubble && <Bubble bubble={p.bubble} />}
      {menu && (
        <div className="popover-1 player-controls-popover">
          <span className="popover-arrow" />
          <button type="button" className="button-1 gray" onClick={() => { setAvatarHidden((v) => !v); setMenu(false); }}>
            {avatarHidden ? "Show Avatar" : "Hide Avatar"}
          </button>
          <button type="button" className="button-1 gray" onClick={() => { actions.toggleMute(p.id); setMenu(false); }}>
            {muted ? "Unmute Chat" : "Mute Chat"}
          </button>
          {isOwner && (
            <button type="button" className="button-1 gray" onClick={() => { openEditPlayer(p.id); setMenu(false); }}>
              Edit Player
            </button>
          )}
        </div>
      )}
    </div>
  );
});

/* ---------- empty seat ---------- */
export function EmptySeat({ seat }: { seat: SeatVM }) {
  const [open, setOpen] = useState(false);
  const selected = open || seat.requestedByYou;
  return (
    <div className={`table-player table-player-${seat.position} empty`} data-seat={seat.position}>
      <div className={`table-player-seat${selected ? " selected" : ""}`} onClick={seat.viewOnly ? undefined : () => setOpen(true)}>
        <span className="table-player-seat-position-number">{seat.seatNo}</span>
        {!seat.viewOnly && <span className="table-player-seat-button">Sit</span>}
      </div>
      {open && !seat.viewOnly && <SitPopover seatNo={seat.seatNo} position={seat.position} onClose={() => setOpen(false)} />}
    </div>
  );
}
