import { join } from "node:path";
import type { DurableFs } from "./fsio.js";

export interface StateDoc<S = unknown> { v: 1; seq: number; savedAtMs: number; state: S; wake: number | null }

export class PersistenceError extends Error {
  constructor(msg: string, readonly fatal: boolean) { super(msg); }
}

/** One table directory: state.json (atomic), log.jsonl / fairness.jsonl / chat.jsonl (append + fsync). ARCH 8. */
export class TableStore {
  readonly dir: string;
  constructor(root: string, readonly id: string, private fs: DurableFs) {
    this.dir = join(root, "tables", id);
  }
  file(name: "state.json" | "log.jsonl" | "fairness.jsonl" | "chat.jsonl"): string { return join(this.dir, name); }

  init(): void { this.fs.mkdirp(this.dir); }

  /**
   * Durable commit of one command: appends first, then the state file. Any failure rolls the appended files back to their
   * previous size so a retried command cannot leave duplicate or orphan lines. If the rollback itself fails the error is
   * `fatal` (the runner then refuses further commands until a restart, whose recovery drops seq > state.seq lines).
   */
  commit(files: { log?: string[]; fairness?: string[]; chat?: string[] }, stateDocJson: string): void {
    const undo: Array<[string, number]> = [];
    try {
      for (const [name, lines] of [["log.jsonl", files.log], ["fairness.jsonl", files.fairness], ["chat.jsonl", files.chat]] as const) {
        if (!lines || lines.length === 0) continue;
        const f = this.file(name);
        const before = this.fs.appendDurable(f, lines);
        undo.push([f, before]);
      }
      this.fs.writeAtomic(this.file("state.json"), stateDocJson);
    } catch (e) {
      let fatal = false;
      for (const [f, size] of undo.reverse()) {
        try { this.fs.truncate(f, size); } catch { fatal = true; }
      }
      throw new PersistenceError(String((e as Error)?.message ?? e), fatal);
    }
  }

  appendChat(line: string): void {
    this.fs.appendDurable(this.file("chat.jsonl"), [line]);
  }
}
