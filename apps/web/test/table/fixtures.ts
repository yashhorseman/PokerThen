/** Throwaway dev fixtures for the W5 harness (W1 fixtures were not available at build time). */
import { defaultGameConfig, type CardCode, type HoleCardVM, type PlayerVM, type SeatVM, type TableViewModel, type BoardCardVM } from "@pokerthen/shared";

export interface Opts {
  players?: number;
  seats?: number[];
  youSeat?: number | null; // null = spectator (unseated)
  owner?: boolean;
  street?: "pre" | "flop" | "turn" | "river" | "showdown" | "twoRuns" | "rabbit" | "allin";
  dealerSeat?: number | null;
  decisionSeat?: number | null;
  tableStatus?: "waiting" | "inProgress";
  longName?: boolean;
  /** every occupied seat posts a bet and nobody folds (geometry runs) */
  allBets?: boolean;
}

const NAMES = ["yash", "Bob", "Carol", "Dave", "Eve", "Frank", "Grace", "Heidi", "Ivan", "Judy"];
const HOLE: CardCode[][] = [["5s", "9d"], ["Ah", "Kd"], ["7c", "7h"], ["Qs", "Jd"], ["2c", "3c"], ["Tc", "9c"], ["8s", "8d"], ["Ad", "Ac"], ["6h", "5h"], ["Kc", "Qc"]];

const card = (code: CardCode, flipped = true, extra: Partial<BoardCardVM> = {}): BoardCardVM => ({
  code, flipped, highlighted: false, semiHide: false, rabbit: false, afterPadding: false, ...extra
});

export function buildVM(o: Opts = {}): TableViewModel {
  const seatsOcc = o.seats ?? Array.from({ length: o.players ?? 4 }, (_, i) => i + 1);
  const youSeat = o.youSeat === undefined ? seatsOcc[0]! : o.youSeat;
  const inProgress = (o.tableStatus ?? "inProgress") === "inProgress" && seatsOcc.length > 1;
  const street = o.street ?? "pre";
  const rot = (p: number): number => (youSeat ? ((youSeat - 1 + p - 1) % 10) + 1 : p);
  const posOf = (seatNo: number): number => (youSeat ? ((seatNo - youSeat + 10) % 10) + 1 : seatNo);
  const dealerSeat = o.dealerSeat === undefined ? seatsOcc[0]! : o.dealerSeat;
  const decision = o.decisionSeat === undefined ? seatsOcc[Math.min(2, seatsOcc.length - 1)]! : o.decisionSeat;
  const showdown = street === "showdown" || street === "twoRuns" || street === "rabbit" || street === "allin";
  const nowT = Date.now();
  const seats: SeatVM[] = [];
  for (let p = 1; p <= 10; p++) {
    const seatNo = rot(p);
    const occ = seatsOcc.includes(seatNo);
    let player: PlayerVM | null = null;
    if (occ) {
      const idx = seatNo - 1;
      const isYou = seatNo === youSeat;
      const folded = inProgress && idx % 4 === 3 && !showdown && !o.allBets;
      const hole: HoleCardVM[] = inProgress && !folded
        ? HOLE[idx]!.map((c) => ({ code: isYou || showdown ? c : null, faceUp: isYou || showdown, up: showdown && idx === 0, dim: false, sneak: false }))
        : [];
      const winner = showdown && idx === 0;
      const isDecision = inProgress && !showdown && seatNo === decision;
      player = {
        id: `p${seatNo}`.padEnd(10, "x"),
        name: o.longName && seatNo === 2 ? "VeryLongPlayer" : NAMES[idx]!,
        isYou,
        isOwner: seatNo === 1,
        stackText: street === "allin" && idx < 3 ? "All In" : String(1000 - idx * 40),
        stackIsAllIn: street === "allin" && idx < 3,
        statusLabel: !inProgress ? "Waiting" : folded ? "Fold" : null,
        away: false, offline: seatNo === 5, quitting: false, folded,
        isDealer: seatNo === dealerSeat,
        isDecision, isWinner: winner,
        gainedText: winner ? "+50" : null, gainedNegative: false,
        bet: o.allBets ? { text: String(20 + idx), check: false } : inProgress && !showdown && !folded ? (idx === 1 ? { text: "10", check: false } : idx === 2 ? { text: "20", check: false } : idx === 0 ? { text: "check", check: true } : null) : null,
        cards: hole,
        cardsFolded: folded,
        handChip: showdown && hole.length ? { rows: street === "twoRuns" ? [{ text: "pair (A)", run: 1 as const, active: true }, { text: "two pair (A,7)", run: 2 as const }] : [{ text: idx === 0 ? "two pair (A,7)" : "pair (6)" }], twoRuns: street === "twoRuns", tone: idx === 0 ? "red" : "blue", rabbit: false } : isYou && street !== "pre" && inProgress ? { rows: [{ text: "pair (9)" }], twoRuns: false, tone: "red", rabbit: false } : null,
        equity: street === "allin" && hole.length ? { pct: [56, 35, 9][idx] ?? 0, leader: idx === 0, gray: false } : null,
        timer: isDecision ? { actionStartedAt: nowT - 4000, deadlineNoBank: nowT + 16000, deadlineWithBank: nowT + 26000, serverNow: () => Date.now(), paused: false, offline: false, bankMs: 10000 } : null,
        winCount: idx === 1 ? 4 : idx === 3 ? 8 : 0,
        quitCount: idx === 1 ? 2 : 0,
        emoji: idx === 2 ? "\u{1F60E}" : null,
        bubble: idx === 3 ? { text: "good luck everyone, this is a very long chat message", until: nowT + 600000 } : null
      };
    }
    seats.push({ position: p, seatNo, player, canSit: !occ && youSeat === null, requestedByYou: false });
  }
  const full: CardCode[] = ["Ad", "7s", "4h", "9d", "Ac"];
  const n = street === "pre" ? 0 : street === "flop" ? 3 : street === "turn" ? 4 : 5;
  const run1 = full.slice(0, street === "rabbit" ? 3 : n).map((c, i) => card(c, true, showdown ? { highlighted: i < 2 || i === 4, semiHide: !(i < 2 || i === 4) } : {}));
  const run2 = street === "twoRuns" ? (["Ad", "7s", "4h", "Jc", "2d"] as CardCode[]).map((c) => card(c, true, { afterPadding: true })) : [];
  if (street === "twoRuns") run1.forEach((c) => (c.semiHide = true));
  const isOwner = o.owner ?? youSeat === 1;
  const vm: TableViewModel = {
    orientation: "landscape",
    connection: { status: "connected" },
    gameId: "ptltest",
    youId: youSeat ? `p${youSeat}`.padEnd(10, "x") : "spectatorid",
    youSeated: youSeat !== null,
    seats,
    board: { run1, run2, rabbitSlots: street === "rabbit" ? 2 : 0, rabbitAvailable: street === "rabbit", rabbitMessage: false },
    dealer: { dealerPosition: dealerSeat && inProgress ? posOf(dealerSeat) : null, dead: false, straddlePosition: inProgress && seatsOcc.length > 3 ? posOf(seatsOcc[2]!) : null },
    pot: { mainText: street === "pre" ? "0" : "70", totalText: street === "pre" && inProgress ? "total 70" : null },
    info: { ownerName: "yash", typeLabel: "NLH", blindsText: "10 / 20", anteText: null, nextBlindText: null },
    center: { kind: "none", text: null, seconds: null },
    action: { visible: false } as TableViewModel["action"],
    owner: { isOwner, canStart: isOwner && !inProgress && seatsOcc.length > 1, canNextHand: false, canPause: isOwner && inProgress, paused: false, canStop: isOwner && inProgress, stopQueued: false, pendingRequests: 0, quickAcceptQueue: [] },
    config: defaultGameConfig(),
    waitingBanner: isOwner && seatsOcc.length < 2,
    tableStatus: inProgress ? "inProgress" : "waiting",
    nextStep: null,
    spectatorCount: 0,
    spectatorMode: false,
    fourColor: false,
    bbMode: false,
    handNumber: 7
  };
  return vm;
}
