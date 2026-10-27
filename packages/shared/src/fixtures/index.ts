/**
 * Typed Frame fixtures for UI/engine-projection work (W1). Every fixture is a COMPLETE per-recipient Frame; viewer is `you`.
 * Names/stacks are invented (U-A* artwork/data placeholders). TableViewModel fixtures are produced by W4's deriveViewModel
 * from these frames (W4 tests assert on them); `fixtureVMInputs` lists the (frame, prev) pairs.
 * Timestamps are absolute; `meta.now = FIXTURE_NOW`.
 */
import type { Frame, PlayerInfo } from "../frame.js";
import type { CardCode } from "../cards.js";
import { FIXTURE_NOW as N, makeFrame, makeHand, makeTurn, deepMerge, type DeepPartial, type FrameInput } from "../testing/index.js";

const hidden = [{ value: null, showing: false }, { value: null, showing: false }];
const own = (a: CardCode, b: CardCode) => [{ value: a, showing: false }, { value: b, showing: false }];
const shown = (a: CardCode, b: CardCode) => [{ value: a, showing: true }, { value: b, showing: true }];

const P4: Array<[number, string, string, number]> = [[1, "p1", "Alice", 980], [3, "p2", "Bob", 1000], [5, "p3", "Carol", 1020], [8, "p4", "Dave", 1000]];
const playing = (extra: FrameInput = {}): Frame => makeFrame(deepMerge({
  _players: P4,
  table: { status: "inProgress", handNumber: 7 },
  hand: makeHand({ handNumber: 7, dealerSeat: 8, dealerId: "p4", smallBlindId: "p1", bigBlindId: "p2", inHandIds: ["p1", "p2", "p3", "p4"], playerStatus: { p1: "inGame", p2: "inGame", p3: "inGame", p4: "inGame" }, pot: 0, bets: { p1: 10, p2: 20 }, highestBet: 20, minRaise: 20, maxBet: 1000 }),
  turn: makeTurn({ playerId: "p3", taking: "p3", actionStartedAt: N - 3000, deadlineNoBank: N + 17000, deadlineWithBank: N + 27000, nextStep: "FCPFS", bankMs: { p1: 10000, p2: 10000, p3: 10000, p4: 10000 } }),
  cards: { p1: { cards: own("Ah", "Kd") }, p2: { cards: hidden }, p3: { cards: hidden }, p4: { cards: hidden } }
} as FrameInput, extra));

export const fixtures: Record<string, Frame> = {
  "waiting-alone": makeFrame({ table: { waitingMessage: null } }),
  "waiting-2-players": makeFrame({ _players: [[1, "p1", "Alice", 1000], [4, "p2", "Bob", 1000]] }),
  "preflop-your-turn": playing({ you: { id: "p3", name: "Carol", isOwner: false }, cards: { p1: { cards: hidden }, p3: { cards: own("Qs", "Qh") } } }),
  "off-turn-preaction": playing(),
  "facing-bet-raise-panel": playing({
    you: { id: "p3", name: "Carol", isOwner: false }, cards: { p1: { cards: hidden }, p3: { cards: own("Qs", "Qh") } },
    hand: { bets: { p1: 10, p2: 60 }, highestBet: 60, minRaise: 40 }
  }),
  flop: playing({ hand: { street: { run: 1, stage: 1 }, board: { "1": ["7c", "2d", "Js"] }, pot: 120, bets: {}, highestBet: 0, minRaise: 20 } }),
  turn: playing({ hand: { street: { run: 1, stage: 2 }, board: { "1": ["7c", "2d", "Js", "9h"] }, pot: 240, bets: { p2: 50 }, highestBet: 50, minRaise: 50 } }),
  river: playing({ hand: { street: { run: 1, stage: 3 }, board: { "1": ["7c", "2d", "Js", "9h", "3s"] }, pot: 400, bets: {}, highestBet: 0 } }),
  "showdown-two-runs": playing({
    hand: { street: { run: 2, stage: 5 }, runs: 2, board: { "1": ["7c", "2d", "Js", "9h", "3s"], "2": ["7c", "2d", "Js", "Ad", "Ac"] }, pot: 0, bets: {}, directToNext: true, winningBoardCards: ["Ad", "Ac"], playerStatus: { p1: "allIn", p2: "allIn", p3: "fold", p4: "fold" } },
    turn: { playerId: null, taking: null, nextStep: "NSAGRS", nextStepAt: N + 6000 },
    cards: { p1: { cards: shown("Ah", "Kd"), name1: "pair (J)", name2: "full house (A over J)" }, p2: { cards: shown("Jh", "Jd"), name1: "three of a kind (J)", name2: "full house (J over A)" }, p3: { cards: [] }, p4: { cards: [] } },
    result: { p1: { runs: { "1": { hc: ["Ah", "Kd"], position: 1 }, "2": { hc: ["Ah", "Ad", "Ac"], position: 1, winning: true } }, gained: 300 }, p2: { runs: { "1": { hc: ["Jh", "Jd"], position: 1, winning: true } }, gained: 300 } }
  }),
  "all-in-equity": playing({
    hand: { street: { run: 1, stage: 1 }, board: { "1": ["7c", "2d", "Js"] }, pot: 2000, directToNext: true, bets: {}, playerStatus: { p1: "allIn", p2: "allIn", p3: "fold", p4: "fold" } },
    turn: { playerId: null, taking: null, nextStep: "NSAAD", nextStepAt: N + 4000 },
    cards: { p1: { cards: shown("Ah", "Kd"), name1: "high card (A)", prob1: 61.5 }, p2: { cards: shown("Jh", "Jd"), name1: "three of a kind (J)", prob1: 38.5 }, p3: { cards: [] }, p4: { cards: [] } }
  }),
  "rit-prompt": playing({
    hand: { directToNext: true, playerStatus: { p1: "allIn", p2: "allIn", p3: "fold", p4: "fold" }, pot: 2000, bets: {} },
    turn: { playerId: null, taking: null, nextStep: "NSARD", nextStepAt: N + 10000, ritWaiting: true, ritVotes: { p2: true } },
    table: { config: { runItTwice: "ask_players" } }
  }),
  "rabbit-available": playing({
    table: { config: { rabbitHunt: true } },
    hand: { street: { run: 1, stage: 5 }, board: { "1": ["7c", "2d", "Js"] }, pot: 0, bets: {}, playerStatus: { p1: "fold", p2: "inGame", p3: "fold", p4: "fold" } },
    turn: { playerId: null, taking: null, nextStep: "NSAGR", nextStepAt: N + 3000 },
    cards: { p1: { cards: [] }, p2: { cards: hidden }, p3: { cards: [] }, p4: { cards: [] } },
    result: { p2: { runs: { "1": { hc: [], position: 1 } }, gained: 90 } },
    rabbit: { enabled: true, hunters: [], cards: null }
  }),
  folded: playing({ hand: { playerStatus: { p1: "fold", p2: "inGame", p3: "inGame", p4: "inGame" }, bets: { p2: 20 } }, cards: { p1: { cards: [] } } }),
  away: playing({ players: { p1: { away: true } } as never }),
  offline: playing({ players: { p3: { disconnectedSince: N - 15000 } } as never, turn: { playerId: "p3", taking: "p3" } }),
  spectator: playing({
    _players: [...P4, [null, "s1", "Spectator", 0]] as never, table: { spectatorMode: true },
    you: { id: "s1", name: "Spectator", isOwner: false }, cards: { p1: { cards: shown("Ah", "Kd") }, p2: { cards: hidden }, p3: { cards: hidden }, p4: { cards: hidden } }
  }),
  "phone-4-opponents": playing({
    _players: [[1, "p1", "Alice", 980], [2, "p2", "Bob", 1000], [4, "p3", "Carol", 1020], [6, "p4", "Dave", 1000], [9, "p5", "Erin", 640]] as never,
    hand: { inHandIds: ["p1", "p2", "p3", "p4", "p5"], playerStatus: { p5: "inGame" }, dealerId: "p5", dealerSeat: 9 }, cards: { p5: { cards: hidden } }
  }),
  "10-seats-full": (() => {
    const names = ["Alice", "Bob", "Carol", "Dave", "Erin", "Frank", "Grace", "Heidi", "Ivan", "Judy"];
    const ids = names.map((_, i) => `p${i + 1}`);
    return playing({
      _players: names.map((n, i) => [i + 1, ids[i]!, n, 1000 + i * 25]) as never,
      hand: { dealerSeat: 10, dealerId: "p10", smallBlindId: "p1", bigBlindId: "p2", inHandIds: ids, playerStatus: Object.fromEntries(ids.map((i) => [i, "inGame"])) as never },
      cards: Object.fromEntries(ids.map((i) => [i, { cards: i === "p1" ? own("Ah", "Kd") : hidden }])) as never,
      turn: { playerId: "p3", taking: "p3" }
    });
  })(),
  /** hero (you) sits at seat 6: exercises the rotation rule (SPEC 4.4) */
  "rotated-hero-seat-6": playing({
    _players: [[2, "p1", "Alice", 980], [4, "p2", "Bob", 1000], [6, "p3", "Carol", 1020], [9, "p4", "Dave", 1000]] as never,
    you: { id: "p3", name: "Carol", isOwner: false }, cards: { p1: { cards: hidden }, p3: { cards: own("Qs", "Qh") } }
  })
};


/* ---- fixtures built from the research transcripts (SPEC 15.2 / research 06, 07): real names, ids, stacks, cards ----
 * yash lOCSAx0p23, Bob 2nQAu2OoHX, Carol nMe7gmdcCM are the ids printed in the transcript. Dave's id is NOT in the
 * transcript: "Dv3kQ9xLmP" is invented (U-A: placeholder). */
const YASH = "lOCSAx0p23", BOB = "2nQAu2OoHX", CAROL = "nMe7gmdcCM", DAVE = "Dv3kQ9xLmP";
const HAND1 = "jxmorahjxvqp";
const yashView = { id: YASH, name: "yash", isOwner: true, mutedIds: [], straddling: false };
const T4: Array<[number, string, string, number]> = [[1, YASH, "yash", 1000], [2, BOB, "Bob", 1000], [3, CAROL, "Carol", 1000], [4, DAVE, "Dave", 1000]];
const transcript = (extra: FrameInput = {}): Frame => makeFrame(deepMerge({
  _players: T4, you: yashView,
  table: { ownerId: YASH, status: "inProgress", handNumber: 1 },
  hand: makeHand({ handNumber: 1, handId: HAND1, dealerSeat: 3, dealerId: CAROL, smallBlindId: DAVE, bigBlindId: YASH, inHandIds: [YASH, BOB, CAROL, DAVE], playerStatus: { [YASH]: "inGame", [BOB]: "fold", [CAROL]: "inGame", [DAVE]: "inGame" }, bets: { [DAVE]: 10, [YASH]: 20 }, highestBet: 20, minRaise: 20, maxBet: 1000 }),
  turn: makeTurn({ bankMs: { [YASH]: 10000, [BOB]: 10000, [CAROL]: 10000, [DAVE]: 10000 } }),
  cards: { [YASH]: { cards: own("6h", "8d") }, [BOB]: { cards: [] }, [CAROL]: { cards: hidden }, [DAVE]: { cards: hidden } }
} as FrameInput, extra));

Object.assign(fixtures, {
  /** SPEC 15.2 first hand, preflop BB option: yash (BB) may check; Dave posted SB; Carol called */
  "transcript-bb-option": transcript({
    hand: { bets: { [DAVE]: 10, [CAROL]: 20, [YASH]: 20 }, optionIds: [YASH], noReraiseIds: [CAROL], bigBlindChecked: false },
    turn: { playerId: YASH, taking: YASH, actionStartedAt: N - 1000, deadlineNoBank: N + 19000, deadlineWithBank: N + 29000, nextStep: "FCPFS" }
  }),
  /** SPEC 15.2: river 7s 9c 5d 9s 6c, yash collected 120 with Straight 9 High; Dave showed 3d Qh */
  "transcript-showdown-straight": transcript({
    hand: { street: { run: 1, stage: 5 }, bigBlindChecked: true, board: { "1": ["7s", "9c", "5d", "9s", "6c"] }, pot: 0, bets: {}, highestBet: 0, winningBoardCards: ["5d", "6c", "7s", "9s"], playerStatus: { [YASH]: "inGame", [BOB]: "fold", [CAROL]: "fold", [DAVE]: "inGame" } },
    turn: { nextStep: "NSAGRS", nextStepAt: N + 6000 },
    cards: { [YASH]: { cards: shown("6h", "8d"), name1: "straight (9)" }, [DAVE]: { cards: shown("3d", "Qh"), name1: "pair (9)" }, [CAROL]: { cards: [] } },
    result: { [YASH]: { runs: { "1": { hc: ["5d", "6c", "7s", "8d", "9s"], position: 1, winning: true } }, gained: 120 }, [DAVE]: { runs: { "1": { hc: ["3d", "Qh", "9c", "9s", "7s"], position: 2 } }, gained: -60 } },
    players: { [YASH]: { winCount: 1 } }
  }),
  /** research 07: Bob 880 / Carol 1770 / Dave 1180 all-in, uncalled 590 returned to Carol, run it twice; Bob wins both main pots (1320+1320), Dave both side pots (300x2) */
  "transcript-rit-two-runs": makeFrame({
    _players: [[2, BOB, "Bob", 0], [3, CAROL, "Carol", 590], [4, DAVE, "Dave", 0]],
    you: { id: BOB, name: "Bob", isOwner: true, mutedIds: [], straddling: false }, table: { ownerId: BOB, status: "inProgress", handNumber: 4, config: { runItTwice: "ask_players" } },
    hand: makeHand({ handNumber: 4, handId: "rit0example1", dealerSeat: 4, dealerId: DAVE, inHandIds: [BOB, CAROL, DAVE], playerStatus: { [BOB]: "allIn", [CAROL]: "allIn", [DAVE]: "allIn" }, street: { run: 2, stage: 5 }, runs: 2, directToNext: true,
      board: { "1": ["5d", "6d", "7d", "9s", "Kh"], "2": ["Ts", "Jc", "Qc", "Kc", "As"] }, winningBoardCards: ["Ts", "Jc", "Qc", "Kc", "As"] }),
    turn: { nextStep: "NSAGRS", nextStepAt: N + 6000, ritVotes: { [BOB]: true, [CAROL]: true, [DAVE]: true } },
    cards: { [BOB]: { cards: shown("2d", "Jd"), name1: "flush (J)", name2: "straight (A)" }, [CAROL]: { cards: shown("4s", "4c"), name1: "pair (4)", name2: "straight (A)" }, [DAVE]: { cards: shown("4h", "4d"), name1: "pair (4)", name2: "straight (A)" } },
    result: {
      [BOB]: { runs: { "1": { hc: ["2d", "5d", "6d", "7d", "Jd"], position: 1, winning: true }, "2": { hc: ["Ts", "Jc", "Qc", "Kc", "As"], position: 1, winning: true } }, gained: 2640 },
      [DAVE]: { runs: { "1": { hc: ["4h", "4d", "5d", "7d", "Kh"], position: 2 }, "2": { hc: ["Ts", "Jc", "Qc", "Kc", "As"], position: 1 } }, gained: 600 }, [CAROL]: { runs: {}, gained: 0 }
    }
  }),
  /** research 07: fold-ended hand, rabbit hunt requested by the viewer (RH chip data present) */
  "transcript-rabbit-revealed": transcript({
    table: { config: { rabbitHunt: true } },
    hand: { street: { run: 1, stage: 5 }, board: { "1": [] }, pot: 0, bets: {}, highestBet: 0, playerStatus: { [YASH]: "inGame", [BOB]: "fold", [CAROL]: "fold", [DAVE]: "fold" } },
    turn: { nextStep: "NSAGR", nextStepAt: N + 3000 },
    cards: { [YASH]: { cards: own("6h", "8d"), name1RH: "pair (9)" }, [DAVE]: { cards: [] }, [CAROL]: { cards: [] } },
    result: { [YASH]: { runs: { "1": { hc: [], position: 1 } }, gained: 30 } },
    rabbit: { enabled: true, hunters: [YASH], cards: { "1": ["Ah", "9s", "4s", "3h", "Jd"] } }
  }),
  /** owner view: paused, stop queued, queued config, 2 blind levels with antes, god mode, emoji, spectators, mixed player statuses */
  "owner-admin-state": transcript({
    _players: [...T4, [5, "Er1nQwErT5", "Erin", 500], [null, "Fr4nkWtch1", "Frank", 0], [null, "Gr4c3Reqst", "Grace", 0], [null, "Hd1Qu1tz00", "Heidi", 0]] as never,
    table: { pausedAt: N - 5000, stopQueued: true, configQueued: true, nextBlindAt: N + 600000, nextBlind: { sb: 25, bb: 50, ante: 5 }, blinds: { sb: 10, bb: 20, ante: null, level: 1 }, spectatorMode: true, spectatorCount: 2, godModeIds: ["Fr4nkWtch1"],
      config: { antes: true, spectatorMode: true, countdownMode: "c", blindResetLevel: 1, blindLevels: [{ sb: 10, bb: 20, ante: null, durationMin: 10 }, { sb: 25, bb: 50, ante: 5, durationMin: null }] } },
    players: {
      Er1nQwErT5: { status: "waitingNextGameToEnter", rebuyCount: 1, emoji: "\u{1F602}" }, [CAROL]: { status: "standingUp", away: true }, [DAVE]: { quitNextHand: true, status: "quiting", quitCount: 2, winCount: 4 },
      [BOB]: { disconnectedSince: N - 30000, allowSpectator: true }, Fr4nkWtch1: { spectator: true }, Gr4c3Reqst: { status: "requestedGameIngress", intendedSeat: 6, requestedStack: 1500 }, Hd1Qu1tz00: { status: "watching" }
    } as never
  }),
  "waiting-owner-deal": { ...transcript({ table: { status: "waiting", waitingMessage: "Waiting for the owner to deal the next hand.", config: { autoDeal: false } } }), hand: null, cards: {} },
  /** straddle posted by Carol (UTG), you pre-selected auto-straddle, dead button */
  "straddle-dead-button": transcript({
    you: { straddling: true }, table: { config: { straddleAllowed: true } },
    hand: { deadButton: true, straddleId: CAROL, bets: { [DAVE]: 10, [YASH]: 20, [CAROL]: 40 }, highestBet: 40, minRaise: 40 }
  }),
  "rebuy-decision": transcript({ turn: { nextStep: "NSARB", nextStepAt: N + 30000, rebuyPromptIds: [DAVE], rebuy: { phase: "decision", deadlineAt: N + 30000, requests: {} } }, table: { config: { allowRebuy: true } }, players: { [DAVE]: { stack: 0 } } as never }),
  "rebuy-approval": transcript({ turn: { nextStep: "FOAR", nextStepAt: N + 30000, rebuyPromptIds: [DAVE], rebuy: { phase: "approval", deadlineAt: N + 30000, requests: { [DAVE]: 1000 } } }, table: { config: { allowRebuy: true } }, players: { [DAVE]: { stack: 0 } } as never }),
  /** disconnected actor with the offline bar deadline (U-T6 length placeholder) and muted chat */
  "offline-actor-muted": transcript({
    you: { mutedIds: [BOB] }, players: { [CAROL]: { disconnectedSince: N - 4000 } } as never,
    turn: { playerId: CAROL, taking: CAROL, actionStartedAt: N - 4000, deadlineNoBank: N + 16000, deadlineWithBank: N + 26000, nextStep: "FCPFS", offlineLimitAt: N + 26000 }
  }),
  /** unseated spectator with god mode sees an allowing player's cards; hunters do not include viewer */
  "god-mode-spectator": transcript({
    _players: [...T4, [null, "Fr4nkWtch1", "Frank", 0]] as never, you: { id: "Fr4nkWtch1", name: "Frank", isOwner: false, mutedIds: [], straddling: false },
    table: { spectatorMode: true, godModeIds: ["Fr4nkWtch1"], spectatorCount: 1 }, players: { Fr4nkWtch1: { spectator: true }, [YASH]: { allowSpectator: true } } as never,
    cards: { [YASH]: { cards: shown("6h", "8d").map((c) => ({ ...c, showing: false })) }, [BOB]: { cards: [] }, [CAROL]: { cards: hidden }, [DAVE]: { cards: hidden } }
  })
});

export type FixtureName = keyof typeof fixtures;
export const fixtureNames = Object.keys(fixtures) as FixtureName[];

/** (prev, next) pairs for transition tests (flip stagger, deltas, winner states). */
export const fixtureTransitions: Array<[FixtureName, FixtureName]> = [
  ["waiting-2-players", "preflop-your-turn"], ["preflop-your-turn", "flop"], ["flop", "turn"], ["turn", "river"],
  ["all-in-equity", "showdown-two-runs"], ["off-turn-preaction", "facing-bet-raise-panel"]
];
export type { PlayerInfo };
