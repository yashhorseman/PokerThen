/** Every log line (SPEC 15.2, research 06/07/08). `n` arguments are raw `"Name @ id"` strings. Placeholders are tagged U-LOG1/U-LOG2/U-D*. */
import { cardText, type CardCode, type GameConfig } from "@pokerthen/shared";

export const cards = (cs: readonly CardCode[]): string => cs.map(cardText).join(", ");

export const L = {
  requestedSeat: (n: string) => `The player ${n} requested a seat.`,
  approved: (n: string, stack: number) => `The admin approved the player ${n} participation with a stack of ${stack}.`,
  joined: (n: string, stack: number) => `The player ${n} joined the game with a stack of ${stack}.`,
  quits: (n: string, stack: number) => `The player ${n} quits the game with a stack of ${stack}.`,
  standUp: (n: string, stack: number) => `The player ${n} stand up with the stack of ${stack}.`,
  stackUpdated: (n: string, from: number, to: number) => `The admin updated the player ${n} stack from ${from} to ${to}.`,
  stackQueued: (n: string, mode: "ADD" | "REMOVE" | "SET", v: number) =>
    mode === "ADD" ? `WARNING: the admin queued the stack change for the player ${n} adding ${v} chips in the next hand.`
    : mode === "SET" ? `WARNING: the admin queued the stack change for the player ${n} reseting to ${v} chips in the next hand.`
    : `WARNING: the admin queued the stack change for the player ${n} removing ${v} chips in the next hand.`, // REMOVE wording U-LOG1
  removalQueued: (admin: string, n: string) => `The admin ${admin === "" ? "" : ""}enqueued the removal of the player ${n}.`.replace("admin  ", "admin "),
  stopQueued: (admin: string) => `The admin ${admin} enqueued the game stop on next hand.`,
  stopCancelled: (admin: string) => `The admin ${admin} canceled the game stop.`, // U-LOG1 placeholder
  ownership: (admin: string, n: string) => `The admin ${admin} transferred the game ownership to ${n}.`, // U-LOG1 placeholder
  antePost: (n: string, v: number) => `${n} posts an ante of ${v}`,
  sb: (n: string, v: number) => `${n} posts a small blind of ${v}`,
  bb: (n: string, v: number) => `${n} posts a big blind of ${v}`,
  straddle: (n: string, v: number) => `${n} posts a straddle of ${v}`,
  deadSB: "Dead Small Blind",
  missingSB: (n: string, v: number) => `${n} posts a missing small blind of ${v}`,
  fold: (n: string) => `${n} folds`,
  check: (n: string) => `${n} checks`,
  call: (n: string, v: number, allIn: boolean) => `${n} calls ${v}${allIn ? " and go all in" : ""}`,
  bet: (n: string, v: number, allIn: boolean) => `${n} bets ${v}${allIn ? " and go all in" : ""}`,
  raise: (n: string, v: number, allIn: boolean) => `${n} raises to ${v}${allIn ? " and go all in" : ""}`,
  uncalled: (v: number, n: string) => `Uncalled bet of ${v} returned to ${n}`,
  shows: (n: string, cs: readonly CardCode[]) => `${n} shows a ${cards(cs)}.`,
  collected: (n: string, v: number, desc?: { name: string; combo: readonly CardCode[]; run2: boolean }) =>
    desc ? `${n} collected ${v} from pot with ${desc.name}${desc.run2 ? " on the second run" : ""} ${desc.run2 ? " " : ""}(combination: ${cards(desc.combo)})`.replace(/^(.*?)(  )?\(comb/, (_m, a, b) => `${a}${b ?? " "}(comb`) : `${n} collected ${v} from pot`,
  street: (run: 1 | 2, stage: 1 | 2 | 3, prev: readonly CardCode[], add: readonly CardCode[]) => {
    const base = stage === 1 ? "Flop" : stage === 2 ? "Turn" : "River";
    return `${base}${run === 2 ? " (second run)" : ""}: ${prev.length ? cards(prev) + " " : " "}[${cards(add)}]`;
  },
  undealt: (prev: readonly CardCode[], add: readonly CardCode[]) => `Undealt cards: ${prev.length ? cards(prev) + " " : " "}[${cards(add)}]`,
  yourHand: (cs: readonly CardCode[]) => `Your hand is ${cards(cs)}`,
  ritAsk: "Remaining players decide whether to run it twice.",
  ritYes: (n: string) => `${n} chooses to  run it twice.`,
  ritNo: (n: string) => `${n} chooses to not run it twice.`,
  ritAllYes: "All players in hand choose to run it twice.",
  ritSomeNo: "Some players choose to not run it twice.",
  start: (no: number, id: string, dealer: string | null) =>
    `-- starting hand #${no} (id: ${id})  No Limit Texas Hold'em (${dealer === null ? "dead button" : `dealer: ${dealer}`}) --`,
  end: (no: number) => `-- ending hand #${no} --`,
  stacks: (rows: Array<[number, string, number]>) => `Player stacks: ${rows.map(([s, n, v]) => `#${s} ${n} (${v})`).join(" | ")}`,
  anteChanged: (from: number, to: number) => `The game's ante was changed from ${from} to ${to}.`,
  rebuyAsk: "Asking to busted players the rebuy decision.",
  rebuyRequested: (n: string, v: number) => `The player ${n} requested a rebuy of ${v}.`,
  rebought: (n: string, v: number) => `The player ${n} rebought. New stack ${v}.`,
  commitment: (c: string) => `Hand commitment (SHA-256): ${c}`,
  reveal: (root: string, n: number) => `Hand reveal: ${n} exposed cards, root ${root}. Verify`
};

// fix the tiny helper above without regex noise
L.removalQueued = (admin: string, n: string) => `The admin ${admin} enqueued the removal of the player ${n}.`;
L.collected = (n: string, v: number, desc?: { name: string; combo: readonly CardCode[]; run2: boolean }) =>
  desc ? `${n} collected ${v} from pot with ${desc.name}${desc.run2 ? " on the second run " : ""} (combination: ${cards(desc.combo)})` : `${n} collected ${v} from pot`;

const onOff = (b: boolean) => (b ? "on" : "off");
const sec = (v: number | null) => (v === null ? "none" : `${v}s`); // U-LOG2 none-wording
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function scheduleText(c: GameConfig): string {
  return c.blindLevels.map((l, i) => `L${i + 1}: ${l.sb}/${l.bb}${c.antes && l.ante ? ` - ante ${l.ante}` : ""}`).join(", ");
}

/** `Game Config Changes` block lines (names seen live in 08 i; unseen ones use the setting label, U-LOG2). */
export function configChanges(a: GameConfig, b: GameConfig, only?: ReadonlyArray<keyof GameConfig>): string[] {
  const out: string[] = [];
  const want = (k: keyof GameConfig) => !only || only.includes(k);
  const eq = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
  const push = (k: keyof GameConfig, name: string, f: (v: never) => string) => {
    if (want(k) && !eq(a[k], b[k])) out.push(`* ${name}: ${f(a[k] as never)} » ${f(b[k] as never)}`);
  };
  push("straddleAllowed", "Allow Straddle", onOff as never);
  push("allowRebuy", "Allow Rebuy", onOff as never);
  push("rabbitHunt", "Rabbit Hunt", onOff as never);
  push("runItTwice", "Allow Run it Twice", ((v: string) => v.replace("_", " ")) as never);
  push("dealToAway", "Deal Cards to Away Players", onOff as never);
  push("autoDeal", "Auto-Start Next Hand", onOff as never);
  push("guestChat", "Allow Player Guest Chat", onOff as never);
  push("timeBankSec", "Max Time Bank", sec as never);
  push("timeBankFillHands", "Hands to Full Refill Time Bank", ((v: number | null) => (v === null ? "none" : String(v))) as never);
  push("autoTrimBets", "Auto Trim Excess Bets", onOff as never);
  push("recordChat", "Record Chat for Hand Replayer", onOff as never);
  push("decisionLimitSec", "Decision Limit Time", sec as never);
  push("revealAllWhenNoAction", "Show All Hands when Bets Finish in All-in", onOff as never);
  push("showdownTime", "Showdown Speed", cap as never);
  push("centsMode", "Use cents values", onOff as never);
  push("spectatorMode", "Spectator Mode", onOff as never);
  push("countdownMode", "Countdown Mode", String as never);
  if (want("blindLevels") || want("antes")) {
    if (!eq(a.blindLevels, b.blindLevels) || a.antes !== b.antes) out.push(`* Blind Schedule: ${scheduleText(a)} » ${scheduleText(b)}`);
  }
  if (want("blindResetLevel") && b.blindResetLevel !== null && !eq(a.blindResetLevel, b.blindResetLevel)) out.push(`* Restart Blind Schedule at Level: ${a.blindResetLevel ?? "none"} » ${b.blindResetLevel}`);
  return out;
}
