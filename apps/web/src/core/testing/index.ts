/**
 * core/testing: TableViewModel fixtures derived from the W1 Frame fixtures (W5/W6/W7 render these).
 * Import: `import { vmFixtures, deriveFixtureVM } from "../core/testing"`.
 */
import { DEFAULT_PREFS, type Frame, type Orientation, type Prefs, type TableViewModel } from "@pokerthen/shared";
import { fixtureNames, fixtureTransitions, fixtures, type FixtureName } from "@pokerthen/shared/fixtures";
import { deriveViewModel, type DeriveCtx } from "../viewModel/derive";

export { fixtureNames, fixtureTransitions, fixtures };
export type { FixtureName };

export function fixtureCtx(frame: Frame, over: Partial<DeriveCtx> = {}): DeriveCtx {
  return {
    prefs: { ...DEFAULT_PREFS } as Prefs,
    serverNow: () => frame.meta.sN,
    orientation: "landscape" as Orientation,
    connection: { status: "connected" },
    gameId: frame.meta.id,
    emojis: {},
    bubbles: {},
    intent: null,
    lockedUntil: 0,
    ownCards: null,
    ritLocal: null,
    muted: frame.you?.mutedIds ?? [],
    ...over
  };
}

export function deriveFixtureVM(name: FixtureName | string, over: Partial<DeriveCtx> = {}, prev: Frame | null = null): TableViewModel {
  const frame = fixtures[name];
  if (!frame) throw new Error(`unknown fixture ${name}`);
  return deriveViewModel(frame, prev, fixtureCtx(frame, over));
}

/** every fixture, landscape + default prefs */
export function vmFixtures(over: Partial<DeriveCtx> = {}): Record<string, TableViewModel> {
  return Object.fromEntries(fixtureNames.map((n) => [n, deriveFixtureVM(n, over)]));
}
