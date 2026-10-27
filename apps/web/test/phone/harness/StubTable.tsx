/** Minimal stand-in for W5's <Table/> following the SPEC 4 DOM/class contract (only used by the W6 harness). */
import type { TableViewModel, SeatVM } from "@pokerthen/shared";
import { cardText } from "@pokerthen/shared";

function Card({ code, size }: { code: string | null; size: "med" | "big" }) {
  return (
    <div className={`card-container ${size}`}>
      <div className={"card" + (code ? " face" : " back")}>{code ? cardText(code as never) : ""}</div>
    </div>
  );
}

function Seat({ s }: { s: SeatVM }) {
  const p = s.player;
  if (!p)
    return (
      <div className={`table-player table-player-seat table-player-${s.position}`}>
        <div className="table-player-seat-position-number">{s.seatNo}</div>
        <div className="table-player-seat-button">Sit</div>
      </div>
    );
  return (
    <div className={`table-player table-player-${s.position}` + (p.isDecision ? " decision-current" : "")}>
      <div className="table-player-cards">
        {p.cards.map((c, i) => (
          <Card key={i} code={c.faceUp ? c.code : null} size="med" />
        ))}
      </div>
      <div className="table-player-infos-ctn">
        <div className="table-player-name">{p.name}</div>
        <div className="table-player-stack">{p.stackText}</div>
        {p.isDecision && (
          <div className="time-to-talk">
            <span className="time-bank" />
            <span className="normal-time" />
          </div>
        )}
      </div>
      {p.handChip && <div className="player-hand-message-ctn">{p.handChip.rows[0]?.text}</div>}
      {p.bet && <div className="table-player-bet-value">{p.bet.text}</div>}
    </div>
  );
}

export function StubTable({ vm }: { vm: TableViewModel }) {
  return (
    <>
      <div className="table">
        <div className="table-game-type">No Limit Texas Hold'em</div>
        <div className="table-pot-size">
          {vm.pot.totalText && <div className="add-on">{vm.pot.totalText}</div>}
          <div className="main-value">{vm.pot.mainText}</div>
        </div>
        <div className="table-cards run-1">
          {vm.board.run1.map((c, i) => (
            <Card key={i} code={c.code} size="big" />
          ))}
        </div>
        {vm.board.run2.length > 0 && (
          <div className="table-cards run-2">
            {vm.board.run2.map((c, i) => (
              <Card key={i} code={c.code} size="big" />
            ))}
          </div>
        )}
        {vm.seats.map((s) => (
          <Seat key={s.position} s={s} />
        ))}
        {vm.dealer.dealerPosition && (
          <div className={`dealer-button-ctn dealer-slot-${vm.dealer.dealerPosition}`}>
            <div className="dealer-button">D</div>
          </div>
        )}
        <div className="game-infos">
          <div className="owner-table-name">OWNER: {vm.info.ownerName}</div>
          <div className="blind-value">
            <span className="game-type">{vm.info.typeLabel}</span> ~ {vm.info.blindsText}
          </div>
        </div>
      </div>
      <div className="top-buttons">
        <div className="top-buttons-button options">Options</div>
        {vm.youSeated && <div className="top-buttons-button leave">Leave Seat</div>}
        {vm.youSeated && <div className="top-buttons-button away">{vm.action.iAmBack ? "I'm Back" : "Away"}</div>}
      </div>
      <div className="top-right-buttons">
        <div className="top-right-button">&#9835;</div>
      </div>
      <div className="aux-chat-bottom-buttons-ctn">
        <div className="show-chat-button">Chat</div>
        <div className="show-log-button">Log</div>
      </div>
      <div className="full-screen-button">&#x26F6;</div>
    </>
  );
}
