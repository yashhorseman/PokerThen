import { useEffect, useRef, useState } from "react";
import { VOLUME_CYCLE, type TableViewModel } from "@pokerthen/shared";
import {
  Button1, Logo, OptionsBadge, OptionsPopover, showAlert, showConfirm, toggleOptions,
  useAudio, useFrame, useHotkey, useOrientation, usePrefs, useTableActions, useTableVM
} from "./deps";
import { TIcon } from "./TIcon";
import { withCountdown } from "./logic";
import { useTick } from "./useTick";

/** showConfirm resolves to boolean (core/ui) or {ok} (menus/dialogs); accept both. */
const confirmed = (r: boolean | { ok: boolean }): boolean => (typeof r === "boolean" ? r : r.ok);

const throttle = (ms: number) => {
  let last = 0;
  return (fn: () => void) => () => {
    const n = Date.now();
    if (n - last < ms) return;
    last = n;
    fn();
  };
};
const awayThrottle = throttle(300);
const leaveThrottle = throttle(200);

function useYou(vm: TableViewModel) {
  for (const s of vm.seats) if (s.player?.isYou) return s.player;
  return null;
}

/* ---------- top-left column ---------- */
export function TopLeftButtons() {
  const vm = useTableVM();
  const actions = useTableActions();
  const you = useYou(vm);
  const seated = vm.youSeated && !!you;

  const leave = leaveThrottle(async () => {
    if (!you) return;
    if (you.quitting) return actions.leaveSeat(true); // armed -> click again cancels
    const ok = confirmed(await showConfirm({
      message: "Are you sure that you want to leave your seat?\nYou will enter in check/fold mode until the hand's end.",
      confirmLabel: "Confirm",
      cancelLabel: "Cancel"
    }));
    if (ok) actions.leaveSeat();
  });
  const away = awayThrottle(() => {
    if (!you) return;
    if (you.away) {
      if (/^0(\.0+)?$/.test(you.stackText)) {
        showAlert("You can't sit back without chips. Please add chips or request the game host to add chips for you.");
        return;
      }
      actions.sitBack();
    } else actions.away();
  });
  return (
    <div className="top-buttons">
      <button type="button" className="top-buttons-button options" onClick={toggleOptions}>
        <TIcon name="options" className="top-buttons-icon" />
        <span className="top-buttons-label">Options</span>
        <OptionsBadge />
      </button>
      <OptionsPopover />
      {seated && (
        <>
          <button type="button" className={`top-buttons-button leave-seat${you!.quitting ? " highlight" : ""}`} onClick={leave}>
            <TIcon name="leave-seat" className="top-buttons-icon" />
            <span className="top-buttons-label">Leave Seat</span>
          </button>
          <button type="button" className={`top-buttons-button away${you!.away ? " im-back highlight" : ""}`} onClick={away}>
            <TIcon name={you!.away ? "im-back" : "away"} className="top-buttons-icon" />
            <span className="top-buttons-label">{you!.away ? "I'm Back" : "Away"}</span>
          </button>
        </>
      )}
    </div>
  );
}

/* ---------- top-right column ---------- */
export function TopRightButtons() {
  const vm = useTableVM();
  const actions = useTableActions();
  const audio = useAudio();
  const [prefs, prefsApi] = usePrefs();
  const [eye, setEye] = useState(false);
  const own = useRef<HTMLDivElement>(null);
  const level = prefs.sound;
  const cycle = () => {
    const next = VOLUME_CYCLE[(VOLUME_CYCLE.indexOf(level) + 1) % VOLUME_CYCLE.length]!;
    audio.unlock();
    prefsApi.set({ sound: next });
    audio.setVolume(next);
  };
  const togglePause = () => (vm.owner.paused ? actions.unpause() : actions.pause());
  useHotkey("p", () => { if (vm.owner.canPause) togglePause(); });
  const stop = async () => {
    if (vm.owner.stopQueued) return actions.stopGame(false);
    const ok = confirmed(await showConfirm({
      message: "You are about to stop the game. When restarting the game, the dealer will be randomly assigned and the missed blinds will be forgiven.",
      confirmLabel: "Stop Game on Next Hand",
      cancelLabel: "Cancel"
    }));
    if (ok) actions.stopGame(true);
  };
  return (
    <div className="top-right-buttons" ref={own}>
      <button type="button" className={`top-right-button sound sound-${level}`} title="Sound" onClick={cycle}>
        <TIcon name={`sound-${level}` as "sound-off"} />
      </button>
      {vm.spectatorMode && (
        <button type="button" className="top-right-button spectators" title="Not seated players" onClick={() => setEye((v) => !v)}>
          <TIcon name="eye" />
          {eye && <SpectatorList />}
        </button>
      )}
      {vm.owner.canPause && (
        <button type="button" className={`top-right-button pause${vm.owner.paused ? " paused" : ""}`} title={vm.owner.paused ? "Toggle Pause" : "Pause the Game"} onClick={togglePause}>
          <TIcon name={vm.owner.paused ? "play" : "pause"} />
          <span className="pt-tip">p</span>
        </button>
      )}
      {vm.owner.canStop && (
        <button type="button" className={`top-right-button stop${vm.owner.stopQueued ? " red" : ""}`} title={vm.owner.stopQueued ? "Cancel Game Stop" : "Stop Game on Next Hand"} onClick={stop}>
          <TIcon name="stop" />
        </button>
      )}
    </div>
  );
}

/* ---------- spectators ---------- */
function SpectatorList() {
  const frame = useFrame();
  const list = Object.values(frame?.players ?? {}).filter((p) => p.spectator);
  return (
    <div className="popover-1 spectators-popover" onClick={(e) => e.stopPropagation()}>
      <span className="popover-arrow" />
      {list.length ? list.map((p) => <div key={p.id} className="spectators-row">{`${p.name} (ID: ${p.id})`}</div>) : <div className="spectators-row">No spectator seeing the hole cards.</div>}
    </div>
  );
}
export function SpectatorCount() {
  const vm = useTableVM();
  const [open, setOpen] = useState(false);
  if (!vm.spectatorMode) return null;
  return (
    <div className="spectators-count-ctn" onClick={() => setOpen((v) => !v)}>
      <TIcon name="eye" className="spectators-eye" />
      <span className="spectators-count">{`${vm.spectatorCount} seeing the hole cards`}</span>
      {open && <SpectatorList />}
    </div>
  );
}

/* ---------- info (top right) ---------- */
export function GameInfos() {
  const { info } = useTableVM();
  return (
    <div className="game-infos">
      {info.ownerName && <div className="game-infos-owner">{`Owner: ${info.ownerName}`}</div>}
      <div className="game-infos-blinds">
        <span className="game-infos-type">{info.typeLabel}</span> <span className="game-infos-tilde">~</span> {info.blindsText}
        {info.anteText ? <span className="game-infos-ante">{` ${info.anteText}`}</span> : null}
      </div>
      {info.nextBlindText && <div className="game-infos-next-blind">{info.nextBlindText}</div>}
    </div>
  );
}

export function GameTypeWatermark() {
  return <div className="table-game-type">No Limit Texas Hold'em</div>;
}

export function LogoTag() {
  return <div className="pt-logo-tag"><Logo variant="full" tone="dark" height="1.08rem" /></div>;
}

/* ---------- full screen ---------- */
export function FullscreenButton() {
  const orientation = useOrientation();
  const [fs, setFs] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  if (!document.fullscreenEnabled) return null;
  const mobile = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (orientation === "portrait" && (!mobile || fs)) return null;
  const toggle = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen().catch(() => undefined); };
  return (
    <button type="button" className="full-screen-button" onClick={toggle} title="Full Screen">
      <TIcon name={fs ? "fullscreen-exit" : "fullscreen"} />
    </button>
  );
}

/* ---------- centre messages ---------- */
export function CenterMessages() {
  const vm = useTableVM();
  const { center, board } = vm;
  const base = useRef<{ seconds: number; at: number } | null>(null);
  const live = center.seconds != null;
  useEffect(() => { base.current = center.seconds != null ? { seconds: center.seconds, at: Date.now() } : null; }, [center.kind, center.seconds]);
  useTick(80, live);
  let text = center.text;
  if (text && live && base.current) {
    text = withCountdown(text, base.current.seconds - Math.floor((Date.now() - base.current.at) / 1000));
  }
  const rabbit = board.rabbitMessage || center.kind === "rabbit";
  return (
    <>
      {center.kind !== "none" && center.kind !== "rabbit" && text && (
        <div className={`room-owner-paused kind-${center.kind}`}>
          {text}
          {center.kind === "spectatorMode" && <> <a className="pt-how-link" href="#" onClick={(e) => e.preventDefault() /* U-G4 target */}>How does it works?</a></>}
        </div>
      )}
      {center.kind === "spectatorMode" && !text && (
        <div className="room-owner-paused kind-spectatorMode">Spectator Mode Activated <a className="pt-how-link" href="#" onClick={(e) => e.preventDefault()}>How does it works?</a></div>
      )}
      {rabbit && <div className="rh-message">Some players are seeing the undealt cards.</div>}
    </>
  );
}

/* ---------- waiting banner ---------- */
export function WaitingBanner() {
  const vm = useTableVM();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  if (!vm.waitingBanner) return null;
  const copy = async () => {
    try { await navigator.clipboard.writeText(location.href); } catch {
      const ta = document.createElement("textarea"); ta.value = location.href; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      ta.remove();
    }
    setCopied(true);
  };
  return (
    <div className="table-warning-ctn waiting-players-ctn">
      <div className="table-warning-title"><TIcon name="clock" className="warning-clock" />Waiting for others</div>
      <div className="table-warning-body">
        <div className="table-warning-text">Share this link with <b>your friends!</b></div>
        <button type="button" className="button-1 green highlighted pt-copy-link" onClick={copy}>{copied ? "Copied!" : "Copy Link"}</button>
      </div>
    </div>
  );
}

/* ---------- next hand / start / shuffle ---------- */
export function NextHandButton() {
  const vm = useTableVM();
  const actions = useTableActions();
  if (!vm.owner.canNextHand) return null;
  return (
    <Button1 className="next-hand-button" hotkey="Enter" badge="enter" throttleMs={750} onClick={() => actions.nextHand()}>
      {"Next Hand »"}
    </Button1>
  );
}

export function StartGameButtons() {
  const vm = useTableVM();
  const actions = useTableActions();
  if (!vm.owner.canStart || vm.tableStatus !== "waiting") return null;
  const start = async () => {
    try { await actions.startGame(); } catch (e) { window.alert(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div className="pt-start-buttons">
      <Button1 color="gray" className="action-button" onClick={() => actions.shuffleSeats()} throttleMs={750}>Shuffle Seats</Button1>
      <Button1 color="green" highlighted className="action-button start-game-button" onClick={start} throttleMs={750}>Start Game</Button1>
    </div>
  );
}

export function DisconnectBanner() {
  const vm = useTableVM();
  const actions = useTableActions();
  if (vm.connection.status !== "disconnected") return null;
  return (
    <div className="disconnect-warning" role="button" onClick={() => actions.reconnect()}>
      {/* U-L2: wording between the two known fragments is a placeholder */}
      Disconnected from the server because of inactivity, click here to reconnect.
    </div>
  );
}
