import { Fragment, useEffect, useRef, useState } from "react";
import type { LedgerResponse, LedgerSession } from "@pokerthen/shared";
import { useMenusData } from "./api";
import { useTableVM } from "./deps";
import { DEFAULT_SORT, MOVEMENT_LABEL, arrow, netText, sortLedger, toggleSort, type LedgerCol, type SortState } from "./logic";
import { FUNCS, S } from "./strings";

export function LedgerView({ refreshKey }: { refreshKey?: number }) {
  const vm = useTableVM();
  const dataHook = useMenusData();
  const data$ = useRef(dataHook);
  data$.current = dataHook;
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [err, setErr] = useState(false);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const [open, setOpen] = useState<Record<string, LedgerSession[] | "loading">>({});
  useEffect(() => {
    let live = true;
    data$.current.loadLedger().then((d) => live && setData(d)).catch(() => live && setErr(true));
    return () => {
      live = false;
    };
  }, [vm.gameId, refreshKey]);
  if (err) return <div className="pt-log-state">{S.logError}</div>;
  if (!data) return <div className="pt-log-state">{S.loading}</div>;
  const rows = sortLedger(Object.values(data.playersInfos), sort);
  const head = (col: LedgerCol, label: string) => (
    <a href="#" className="pt-ledger-sort" onClick={(e) => { e.preventDefault(); setSort(toggleSort(sort, col)); }}>
      {label}{arrow(sort, col)}
    </a>
  );
  const toggle = async (id: string) => {
    if (open[id]) {
      const { [id]: _drop, ...rest } = open;
      setOpen(rest);
      return;
    }
    setOpen({ ...open, [id]: "loading" });
    try {
      const s = await data$.current.loadLedgerSessions(id);
      setOpen((o) => ({ ...o, [id]: s }));
    } catch {
      setOpen((o) => ({ ...o, [id]: [] }));
    }
  };
  return (
    <div className="pt-ledger">
      <div className="pt-ledger-head pt-ledger-grid">
        <span className="pt-ledger-name">{head("name", S.tablePlayer)}</span>
        <span />
        {head("buyInSum", S.buyIn)}
        {head("buyOutSum", S.buyOut)}
        {head("inGame", S.stack)}
        {head("net", S.net)}
      </div>
      {rows.map((r) => {
        const sessions = open[r.id];
        return (
          <Fragment key={r.id}>
            <div className="pt-ledger-row pt-ledger-grid" data-player-id={r.id}>
              <span className="pt-ledger-name">
                <b>{r.name}</b> <small>{`@ ${r.id}`}</small>
              </span>
              <button type="button" className="pt-details-btn" onClick={() => toggle(r.id)}>
                {sessions ? S.hideDetails : S.details}
              </button>
              <span>{r.buyInSum}</span>
              <span>{r.buyOutSum}</span>
              <span>{r.inGame}</span>
              <span className={r.net > 0 ? "positive-net" : r.net < 0 ? "negative-net" : ""}>{netText(r.net)}</span>
            </div>
            {sessions === "loading" ? <div className="pt-ledger-details">{S.loading}</div> : null}
            {Array.isArray(sessions) ? (
              <div className="pt-ledger-details">
                {sessions.map((s) => (
                  <div key={s.id} className="pt-session pt-ledger-grid">
                    <span className="pt-session-label">
                      {FUNCS.sessionLabel(s.start_hand_number, s.finish_hand_number)}
                      {s.movements.map((m, i) => (
                        <em key={i} className="pt-chip">{`${MOVEMENT_LABEL[m.kind] ?? m.kind} ${m.value}`}</em>
                      ))}
                    </span>
                    <span />
                    <span>{s.buy_in}</span>
                    <span>{s.buy_out}</span>
                    <span />
                    <span />
                  </div>
                ))}
              </div>
            ) : null}
          </Fragment>
        );
      })}
      <div className="pt-ledger-total pt-ledger-grid">
        <span className="pt-ledger-name">{S.tableTotal}</span>
        <span />
        <span>{data.buyInTotal}</span>
        <span>{data.buyOutTotal}</span>
        <span>{data.inGameTotal}</span>
        <span />
      </div>
    </div>
  );
}
