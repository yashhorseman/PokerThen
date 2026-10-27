import type { EngineApi, Entropy, PlayerId } from "@pokerthen/shared";
import { DEFAULT_BB, DEFAULT_SB, DEFAULT_STACK } from "@pokerthen/shared";
import type { ProfanityFilter } from "../chat/chat.js";
import type { DurableFs } from "../persistence/fsio.js";
import { recoverAll } from "../persistence/recovery.js";
import { LIMITS } from "../limits.js";
import { GAME_ID_RE, newGameId } from "../session.js";
import { TableRunner, type RunnerDeps } from "./runner.js";

export interface RegistryOpts {
  engine: EngineApi;
  entropy: Entropy;
  clock: () => number;
  fs: DurableFs;
  dataDir: string;
  profanity: ProfanityFilter;
  log: (msg: string, err?: unknown) => void;
}

export class Registry {
  private tables = new Map<string, TableRunner>();
  private deps: RunnerDeps;
  constructor(private o: RegistryOpts) {
    this.deps = { ...o };
  }

  get size(): number { return this.tables.size; }
  all(): Iterable<TableRunner> { return this.tables.values(); }
  get(id: string): TableRunner | undefined { return GAME_ID_RE.test(id) ? this.tables.get(id) : undefined; }

  /** ARCH 7 boot recovery. Returns a short report for the log. */
  load(): { loaded: number; quarantined: number; droppedLines: number } {
    const rep = recoverAll(this.o.dataDir, this.o.fs, this.o.clock());
    for (const t of rep.loaded) {
      try {
        this.tables.set(t.id, TableRunner.recover(t.id, this.deps, t.doc, t));
      } catch (e) {
        this.o.log(`[recovery] table ${t.id} failed to start; leaving it on disk`, e);
      }
    }
    return { loaded: this.tables.size, quarantined: rep.quarantined.length, droppedLines: rep.droppedLines };
  }

  /** POST /new-game: owner seated with the chosen stack (default 1000), blinds 10/20 (SPEC 1.3; the stack choice is an owner-approved difference). */
  create(ownerId: PlayerId, ownerName: string, stack: number = DEFAULT_STACK): TableRunner {
    if (this.tables.size >= LIMITS.MAX_TABLES) throw new Error("table limit reached");
    let id = newGameId();
    while (this.tables.has(id)) id = newGameId();
    const r = TableRunner.create(id, this.deps, { ownerId, ownerName, stack, sb: DEFAULT_SB, bb: DEFAULT_BB });
    this.tables.set(id, r);
    return r;
  }

  disposeAll(): void { for (const t of this.tables.values()) t.dispose(); }
}
