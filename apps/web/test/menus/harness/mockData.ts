import type { Frame, GameConfig, LedgerResponse, LedgerSession, LogEntry, PlayerInfo } from "@pokerthen/shared";
import { defaultGameConfig } from "@pokerthen/shared";

export const OWNER = "ownerIdAAA";
export const BOB = "bobIdBBBBB";
export const CAROL = "carolIdCCC";
export const DAVE = "daveIdDDDD";
export const GUEST = "guestIdEEE";

const p = (id: string, name: string, o: Partial<PlayerInfo>): PlayerInfo => ({ id, name, status: "inGame", stack: 1000, winCount: 0, quitCount: 0, ...o });

export function makeFrame(over: { you?: string; status?: "waiting" | "inProgress"; config?: Partial<GameConfig>; spectatorMode?: boolean } = {}): Frame {
  const you = over.you ?? OWNER;
  return {
    meta: { id: "ptl_demo", now: 1000, pre: 0, sN: 1000, version: "0.1.0", mEV: 0 },
    table: {
      status: over.status ?? "waiting",
      ownerId: OWNER,
      pausedAt: null,
      stopQueued: false,
      handNumber: 4,
      configQueued: false,
      config: { ...defaultGameConfig(), ...over.config },
      nextBlindAt: null,
      nextBlind: null,
      spectatorMode: over.spectatorMode ?? false,
      godModeIds: [GUEST],
      waitingMessage: null
    },
    seats: [[1, OWNER], [2, BOB], [3, CAROL]],
    players: {
      [DAVE]: p(DAVE, "PhoneP", { status: "requestedGameIngress", intendedSeat: 6, requestedStack: 1000, stack: 0 }),
      [OWNER]: p(OWNER, "Yash", { stack: 1000 }),
      [BOB]: p(BOB, "Bob", { stack: 4000 }),
      [CAROL]: p(CAROL, "Carol", { away: true, stack: 880 }),
      [GUEST]: p(GUEST, "Guest", { status: "watching", stack: 0, spectator: true }),
      xGuestFFFF: p("xGuestFFFF", "Guest", { status: "watching", stack: 0 })
    },
    hand: null,
    turn: { playerId: null, taking: null, actionStartedAt: null, deadlineNoBank: null, deadlineWithBank: null, nextStep: null, nextStepAt: null, bankMs: {}, ritWaiting: false, ritVotes: {}, rebuyPromptIds: [] },
    cards: {},
    result: null,
    rabbit: { enabled: false, hunters: [], cards: null },
    you: { id: you, name: "Yash", mutedIds: [], straddling: false, isOwner: you === OWNER }
  } as unknown as Frame;
}

const t0 = Date.UTC(2026, 9, 26, 21, 0) * 100;
export const LOG: LogEntry[] = [
  `The player "Yash @ ${OWNER}" requested a seat.`,
  `-- starting hand #4 (id: jxmorahjxvqp)  No Limit Texas Hold'em (dealer: "Carol @ ${CAROL}") --`,
  `Hand commitment (SHA-256): 9f2c0d4b7e1a5c3388d1f0a6b2e4c7d9a1b3c5e7f9021324354657687980a1b2`,
  `Player stacks: #1 "Yash @ ${OWNER}" (1000) | #2 "Bob @ ${BOB}" (1000)`,
  `Your hand is 6♥, 8♦`,
  `"Bob @ ${BOB}" posts a small blind of 10`,
  `"Yash @ ${OWNER}" posts a big blind of 20`,
  `"Carol @ ${CAROL}" folds`,
  `"Bob @ ${BOB}" calls 20`,
  `"Yash @ ${OWNER}" checks`,
  `Flop:  [7♠, 9♣, 5♦]`,
  `"Yash @ ${OWNER}" bets 20`,
  `Turn: 7♠, 9♣, 5♦ [9♠]`,
  `"Bob @ ${BOB}" shows a 3♦, Q♥.`,
  `"Yash @ ${OWNER}" collected 120 from pot with Straight, 9 High (combination: 5♦, 6♣, 7♠, 8♦, 9♠)`,
  `-- ending hand #4 --`,
  `Hand reveal: salt 00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff, deck As Ks Qs Js Ts 9s 8s 7s 6s 5s 4s 3s 2s Ah Kh Qh Jh Th 9h 8h 7h 6h 5h 4h 3h 2h Ad Kd Qd Jd Td 9d 8d 7d 6d 5d 4d 3d 2d Ac Kc Qc Jc Tc 9c 8c 7c 6c 5c 4c 3c 2c. Verify`
].map((msg, i) => ({ createdAt: t0 + i * 100, msg }));

export const LEDGER: LedgerResponse = {
  playersInfos: {
    [BOB]: { id: BOB, name: "Bob", buyInSum: 1000, buyOutSum: 0, inGame: 4000, nitEscrow: 0, net: 3000 },
    [CAROL]: { id: CAROL, name: "Carol", buyInSum: 1000, buyOutSum: 0, inGame: 0, nitEscrow: 0, net: -1000 },
    [OWNER]: { id: OWNER, name: "Yash", buyInSum: 1000, buyOutSum: 0, inGame: 0, nitEscrow: 0, net: -1000 }
  },
  buyInTotal: 3000, buyOutTotal: 0, inGameTotal: 4000, nitEscrowTotal: 0, gameHasRake: false, rakedValue: 0, rakedValueWaitingToBeCollected: 0
};
export const SESSIONS: LedgerSession[] = [
  { id: "s1", status: "playing", buy_in: 1000, buy_out: 0, start_hand_number: 1, finish_hand_number: null, movements: [{ kind: "tookSeat", value: 1000 }, { kind: "addStack", value: 500 }] }
];
