import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LogEntry } from "@pokerthen/shared";
import { logTime } from "@pokerthen/shared";
import { HttpError, useMenusData } from "./api";
import { useFrame, useHotkey, useTableVM } from "./deps";
import { ModalLock } from "./dialogs";
import { LedgerView } from "./LedgerView";
import { HandCache, logEntryClass, parseReveal, splitLogNames } from "./logic";
import { closeLog, openLog, setMenuState, useMenuState, type LogTab } from "./store";
import { FUNCS, S } from "./strings";

/** One rendered log line: names -> <abbr title="Player ID: id">Name</abbr>. */
export function LogLine({ entry, gameId, hand: handNo }: { entry: LogEntry; gameId?: string; hand?: number }) {
  const { text, verify } = parseReveal(entry.msg);
  const cls = logEntryClass(entry.msg);
  const hand = /^Hand reveal/.test(entry.msg);
  return (
    <div className={`pt-log-entry${cls ? ` ${cls}` : ""}`}>
      <span className="pt-log-time">{logTime(entry.createdAt)}</span>
      <span className="pt-log-text">
        {splitLogNames(verify ? text : entry.msg).map((p, i) =>
          typeof p === "string" ? p : (
            <abbr key={i} title={FUNCS.playerIdTitle(p.id)}>{p.name}</abbr>
          )
        )}
        {verify && hand ? <>{" "}<a href={`/verify?game=${gameId ?? ""}&hand=${handNo ?? ""}`} target="_blank" rel="noreferrer">{verify}</a></> : null}
      </span>
    </div>
  );
}

type LogState = { status: "loading" } | { status: "ok"; entries: LogEntry[] } | { status: "error"; msg: string };
const errText = (e: unknown) => {
  const s = e instanceof HttpError ? e.status : 0;
  return s === 429 ? S.tooMany : s === 503 ? S.busy : S.logError;
};

function FullLog({ gameId, current }: { gameId: string; current: number }) {
  const [hand, setHand] = useState(current);
  const [st, setSt] = useState<LogState>({ status: "loading" });
  const cache = useRef(new HandCache<LogEntry[]>(50));
  const live = useRef<{ hand: number; entries: LogEntry[] }>({ hand: -1, entries: [] });
  const dataHook = useMenusData();
  const data = useRef(dataHook);
  data.current = dataHook;
  const frame = useFrame();
  const stamp = frame?.meta.now ?? 0;

  const load = useCallback(async () => {
    const api = data.current;
    try {
      if (hand !== current) {
        const c = cache.current.get(hand);
        if (c) return setSt({ status: "ok", entries: c });
        setSt({ status: "loading" });
        const e = hand <= 0 ? [] : await api.loadLog(hand);
        cache.current.set(hand, e);
        return setSt({ status: "ok", entries: e });
      }
      // current hand: incremental poll after the last known createdAt
      if (live.current.hand !== hand) {
        setSt({ status: "loading" });
        const e = hand <= 0 ? [] : await api.loadLog(hand);
        live.current = { hand, entries: e };
      } else {
        const last = live.current.entries[live.current.entries.length - 1]?.createdAt;
        const more = await api.loadLog(hand, last);
        if (more.length) live.current = { hand, entries: [...live.current.entries, ...more.filter((m) => m.createdAt > (last ?? -1))] };
      }
      setSt({ status: "ok", entries: live.current.entries });
    } catch (e) {
      setSt({ status: "error", msg: errText(e) });
    }
  }, [hand, current]);

  useEffect(() => {
    void load();
  }, [load, stamp]);
  // when the hand counter advances the finished hand is cached and the pager follows live
  useEffect(() => {
    if (live.current.hand >= 0 && live.current.hand !== current) {
      cache.current.set(live.current.hand, live.current.entries);
      live.current = { hand: -1, entries: [] };
    }
    setHand(current);
  }, [current]);

  const entries = st.status === "ok" ? [...st.entries].reverse() : [];
  return (
    <>
      <div className="pt-log-list" data-hand={hand}>
        {st.status === "loading" ? <div className="pt-log-state">{S.loading}</div> : null}
        {st.status === "error" ? <div className="pt-log-state">{st.msg}</div> : null}
        {st.status === "ok" && entries.length === 0 ? <div className="pt-log-state">{S.emptyLog}</div> : null}
        {entries.map((e, i) => (
          <LogLine key={`${e.createdAt}-${i}`} entry={e} gameId={gameId} hand={hand} />
        ))}
      </div>
      <div className="pt-log-pager">
        {hand < current ? (
          <button type="button" className="button-1 gray pt-btn" onClick={() => setHand(hand + 1)}>{`« ${FUNCS.handLabel(hand + 1)}`}</button>
        ) : null}
        {hand > 1 ? (
          <button type="button" className="button-1 gray pt-btn" onClick={() => setHand(hand - 1)}>{`${FUNCS.handLabel(hand - 1)} »`}</button>
        ) : null}
      </div>
    </>
  );
}

export function LogModal() {
  const st = useMenuState();
  const vm = useTableVM();
  const api = useMenusData();
  const [tab, setTab] = useState<LogTab>(st.logTab);
  useEffect(() => setTab(st.logTab), [st.logTab, st.logOpen]);
  useEffect(() => {
    if (!st.logOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector(".pt-dialog-layer") && closeLog();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [st.logOpen]);
  const host = typeof document === "undefined" ? null : document.getElementById("canvas") ?? document.body;
  if (!st.logOpen || !host) return null;
  const switchTab = (t: LogTab) => {
    setTab(t);
    setMenuState({ logTab: t });
  };
  return createPortal(
    <div className="pt-modal-layer">
      <ModalLock />
      <div className="pt-scrim" onClick={closeLog} />
      <div className="log-modal modal" role="dialog" aria-modal="true" aria-label={tab === "log" ? S.sessionLog : S.sessionLedger}>
        <button type="button" className="pt-modal-close" aria-label={S.close} onClick={closeLog}>
          <span className="pt-close-landscape">X</span>
        </button>
        <h2 className="pt-modal-title">{tab === "log" ? S.sessionLog : S.sessionLedger}</h2>
        <div className="pt-modal-body">
          {tab === "log" ? <FullLog gameId={vm.gameId} current={vm.handNumber} /> : <LedgerView />}
        </div>
        <div className="pt-modal-foot">
          <div className="pt-foot-left">
            <a className="button-1 green pt-btn pt-download" href={tab === "log" ? api.logCsvUrl() : api.ledgerCsvUrl()} download>
              {S.download}
            </a>
          </div>
          <div className="pt-foot-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "log"} className={`pt-tab${tab === "log" ? " active" : ""}`} onClick={() => switchTab("log")}>{S.fullLog}</button>
            <button type="button" role="tab" aria-selected={tab === "ledger"} className={`pt-tab${tab === "ledger" ? " active" : ""}`} onClick={() => switchTab("ledger")}>{S.ledger}</button>
          </div>
        </div>
      </div>
    </div>,
    host
  );
}

/** Bottom-left `Log / Ledger` (landscape) / `Log` (portrait); hotkey `l`; long-press 500 ms opens the ledger. Also mounts the modal. */
export function LogButton() {
  const vm = useTableVM();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swallow = useRef(false);
  const portrait = vm.orientation === "portrait";
  useHotkey("l", () => openLog("log"), {});
  const down = () => {
    swallow.current = false;
    timer.current = setTimeout(() => {
      swallow.current = true;
      openLog("ledger");
    }, 500);
  };
  const up = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <>
      <button
        type="button"
        className="pt-log-button log-button"
        onPointerDown={down}
        onPointerUp={up}
        onPointerLeave={up}
        onPointerCancel={up}
        onClick={(e) => {
          if (swallow.current) {
            swallow.current = false;
            e.preventDefault();
            return;
          }
          openLog("log");
        }}
      >
        <span className="pt-log-label">{portrait ? S.logPortrait : S.logLandscape}</span>
        {portrait ? null : <span className="pt-hotkey-badge">L</span>}
      </button>
      <LogModal />
    </>
  );
}
