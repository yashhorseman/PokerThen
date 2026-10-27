/** Hand-built TableViewModel scenarios for W6 tests and the phone/desktop harness (W1 fixtures not required). */
import { defaultGameConfig, type ActionBarVM, type PlayerVM, type SeatVM, type TableViewModel } from "@pokerthen/shared";
import { computeBetPanel } from "../../src/actions/deriveBetPanel";

export const noopServerNow = () => Date.now();

export function emptyBar(over: Partial<ActionBarVM> = {}): ActionBarVM {
  return {
    visible: true,
    yourTurn: false,
    low: true,
    call: null,
    raise: { label: "Bet", enabled: false, highlighted: false },
    check: { enabled: false, highlighted: false },
    fold: { enabled: false, highlighted: false, needsConfirmation: false },
    checkOrFold: { visible: false, highlighted: false },
    timeBank: { visible: false, activated: false, secondsLeft: 0 },
    lockedUntil: 0,
    iAmBack: false,
    cancelIngress: false,
    showHand: null,
    rit: null,
    ...over
  };
}

export function player(over: Partial<PlayerVM> & { id: string; name: string }): PlayerVM {
  return {
    isYou: false,
    isOwner: false,
    stackText: "1000",
    stackIsAllIn: false,
    statusLabel: null,
    away: false,
    offline: false,
    quitting: false,
    folded: false,
    isDealer: false,
    isDecision: false,
    isWinner: false,
    gainedText: null,
    gainedNegative: false,
    bet: null,
    cards: [
      { code: null, faceUp: false, up: false, dim: false, sneak: false },
      { code: null, faceUp: false, up: false, dim: false, sneak: false }
    ],
    cardsFolded: false,
    handChip: null,
    equity: null,
    timer: null,
    winCount: 0,
    quitCount: 0,
    emoji: null,
    bubble: null,
    ...over
  };
}

/** Hero PhoneP at position 1 with 4 opponents (research phone-ui hand): yash 830, Bob 20, Carol 1270, Dave 4670. */
export function baseVM(over: Partial<TableViewModel> = {}): TableViewModel {
  const hero = player({
    id: "hero",
    name: "PhoneP",
    isYou: true,
    stackText: "990",
    bet: { text: "10", check: false },
    cards: [
      { code: "5h", faceUp: true, up: false, dim: false, sneak: false },
      { code: "Td", faceUp: true, up: false, dim: false, sneak: false }
    ],
    handChip: { rows: [{ text: "PAIR (10)" }], twoRuns: false, tone: "red", rabbit: false }
  });
  const byPos: Record<number, PlayerVM> = {
    1: hero,
    6: player({ id: "yash", name: "yash", isOwner: true, stackText: "830", bet: { text: "20", check: false } }),
    8: player({ id: "bob", name: "Bob", stackText: "20", isDecision: false }),
    9: player({ id: "carol", name: "Carol", stackText: "1270" }),
    10: player({ id: "dave", name: "Dave", stackText: "4670", isDealer: true })
  };
  const seats: SeatVM[] = Array.from({ length: 10 }, (_, i) => ({
    position: i + 1,
    seatNo: ((i + 5) % 10) + 1,
    player: byPos[i + 1] ?? null,
    canSit: false,
    requestedByYou: false
  }));
  const vm: TableViewModel = {
    orientation: "portrait",
    connection: { status: "connected" },
    gameId: "gharness",
    youId: "hero",
    youSeated: true,
    seats,
    board: { run1: [], run2: [], rabbitSlots: 0, rabbitAvailable: false, rabbitMessage: false },
    dealer: { dealerPosition: 10, dead: false, straddlePosition: null },
    pot: { mainText: "0", totalText: "total 30" },
    info: { ownerName: "yash", typeLabel: "NLH", blindsText: "10 / 20", anteText: null, nextBlindText: null },
    center: { kind: "none", text: null, seconds: null },
    action: emptyBar(),
    owner: { isOwner: false, canStart: false, canNextHand: false, canPause: false, paused: false, canStop: false, stopQueued: false, pendingRequests: 0, quickAcceptQueue: [] },
    config: defaultGameConfig(),
    waitingBanner: false,
    tableStatus: "inProgress",
    nextStep: "FCPFS",
    spectatorCount: 0,
    spectatorMode: false,
    fourColor: false,
    bbMode: false,
    handNumber: 1,
    ...over
  };
  return vm;
}

export function withBetPanel(vm: TableViewModel, stack = 990, highestBet = 20, minRaise = 40, pot = 30, otherBets = 20): TableViewModel & { betPanel: ReturnType<typeof computeBetPanel> } {
  return { ...vm, betPanel: computeBetPanel({ stack, highestBet, minRaise, maxBet: null, pot, otherBets, bigBlind: 20, showAsBB: vm.bbMode }) };
}

export type ScenarioName =
  | "offturn-callpre"
  | "offturn-checkorfold"
  | "turn-facing-bet"
  | "turn-free-check"
  | "turn-timebank"
  | "allin-call"
  | "rit"
  | "showhand"
  | "away"
  | "result-away-showhand"
  | "cancel-ingress"
  | "flop";

/** Scenario table used by the screenshots script and the harness. */
export function scenario(name: ScenarioName): TableViewModel {
  const vm = baseVM();
  const dec = (id: string) => {
    vm.seats = vm.seats.map((s) => (s.player && s.player.id === id ? { ...s, player: { ...s.player, isDecision: true } } : s));
  };
  switch (name) {
    case "offturn-callpre":
      dec("bob");
      vm.action = emptyBar({
        call: { label: "Call 10", enabled: true, highlighted: false, allIn: false, amount: 10 },
        raise: { label: "Raise", enabled: false, highlighted: false },
        check: { enabled: false, highlighted: false },
        fold: { enabled: true, highlighted: false, needsConfirmation: false }
      });
      return vm;
    case "offturn-checkorfold":
      dec("bob");
      vm.action = emptyBar({
        raise: { label: "Bet", enabled: false, highlighted: false },
        check: { enabled: true, highlighted: false },
        fold: { enabled: true, highlighted: false, needsConfirmation: false },
        checkOrFold: { visible: true, highlighted: false }
      });
      return vm;
    case "turn-facing-bet":
      dec("hero");
      vm.action = emptyBar({
        yourTurn: true,
        low: false,
        call: { label: "Call 10", enabled: true, highlighted: false, allIn: false, amount: 10 },
        raise: { label: "Raise", enabled: true, highlighted: false },
        check: { enabled: false, highlighted: false },
        fold: { enabled: true, highlighted: false, needsConfirmation: false }
      });
      return withBetPanel(vm);
    case "turn-free-check":
      dec("hero");
      vm.action = emptyBar({
        yourTurn: true,
        low: false,
        call: { label: "Bet 20", enabled: true, highlighted: false, allIn: false, amount: 0 },
        raise: { label: "Bet", enabled: true, highlighted: false },
        check: { enabled: true, highlighted: false },
        fold: { enabled: true, highlighted: false, needsConfirmation: true }
      });
      return withBetPanel(vm, 990, 0, 20, 30, 0);
    case "turn-timebank":
      dec("hero");
      vm.action = emptyBar({
        yourTurn: true,
        low: false,
        call: { label: "Call 10", enabled: true, highlighted: false, allIn: false, amount: 10 },
        raise: { label: "Raise", enabled: true, highlighted: false },
        check: { enabled: false, highlighted: false },
        fold: { enabled: true, highlighted: false, needsConfirmation: false },
        timeBank: { visible: true, activated: true, secondsLeft: 10 }
      });
      return withBetPanel(vm);
    case "allin-call":
      dec("hero");
      vm.action = emptyBar({
        yourTurn: true,
        low: false,
        call: { label: "All In 990", enabled: true, highlighted: false, allIn: true, amount: 990 },
        raise: { label: "Raise", enabled: false, highlighted: false },
        check: { enabled: false, highlighted: false },
        fold: { enabled: true, highlighted: false, needsConfirmation: false }
      });
      return vm;
    case "rit":
      vm.action = emptyBar({ visible: false, rit: { visible: true, answered: null } });
      return vm;
    case "showhand":
      vm.action = emptyBar({ visible: false, showHand: { visible: true, until: Date.now() + 3600_000, cards: ["4h", "4s"] } });
      return vm;
    case "away":
      vm.action = emptyBar({ visible: false, iAmBack: true });
      return vm;
    case "result-away-showhand":
      vm.action = emptyBar({ visible: false, iAmBack: true, showHand: { visible: true, until: Date.now() + 3600_000, cards: ["7c", "9s"] } });
      return vm;
    case "cancel-ingress":
      vm.youSeated = false;
      vm.action = emptyBar({ visible: false, cancelIngress: true });
      return vm;
    case "flop":
      vm.board = {
        ...vm.board,
        run1: ["As", "7d", "2c"].map((code) => ({ code: code as never, flipped: true, highlighted: false, semiHide: false, rabbit: false, afterPadding: false }))
      };
      return vm;
  }
}
