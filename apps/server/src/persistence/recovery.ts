import { join } from "node:path";
import type { DurableFs } from "./fsio.js";
import type { StateDoc } from "./tableStore.js";

export interface RecoveredTable { id: string; doc: StateDoc; log: unknown[]; fairness: unknown[]; chat: unknown[] }
export interface RecoveryReport { loaded: RecoveredTable[]; quarantined: string[]; droppedLines: number }

function readJsonl(fs: DurableFs, file: string, maxSeq: number): { rows: Array<Record<string, unknown>>; dropped: number } {
  const raw = fs.read(file);
  if (raw === null) return { rows: [], dropped: 0 };
  const rows: Array<Record<string, unknown>> = [];
  let dropped = 0;
  for (const line of raw.split("\n")) {
    if (!line) continue;
    try {
      const o = JSON.parse(line) as Record<string, unknown>;
      if (typeof o.seq !== "number" || o.seq > maxSeq) { dropped++; continue; }
      rows.push(o);
    } catch { dropped++; }
  }
  if (dropped > 0) fs.writeAtomic(file, rows.map((r) => JSON.stringify(r) + "\n").join(""));
  return { rows, dropped };
}

/** Boot recovery (ARCH 7): load every tables/<id>/state.json, drop log/fairness/chat lines with seq > state.seq, quarantine garbage. */
export function recoverAll(root: string, fs: DurableFs, now: number): RecoveryReport {
  fs.mkdirp(join(root, "tables"));
  fs.mkdirp(join(root, "quarantine"));
  if (!fs.exists(join(root, "VERSION"))) fs.writeAtomic(join(root, "VERSION"), "1\n");
  const report: RecoveryReport = { loaded: [], quarantined: [], droppedLines: 0 };
  for (const id of fs.list(join(root, "tables"))) {
    const dir = join(root, "tables", id);
    try {
      const raw = fs.read(join(dir, "state.json"));
      if (raw === null) throw new Error("state.json missing");
      const doc = JSON.parse(raw) as StateDoc;
      if (doc?.v !== 1 || typeof doc.seq !== "number" || typeof doc.state !== "object" || doc.state === null) throw new Error("bad state doc");
      const log = readJsonl(fs, join(dir, "log.jsonl"), doc.seq);
      const fair = readJsonl(fs, join(dir, "fairness.jsonl"), doc.seq);
      const chat = readJsonl(fs, join(dir, "chat.jsonl"), doc.seq);
      report.droppedLines += log.dropped + fair.dropped + chat.dropped;
      report.loaded.push({ id, doc, log: log.rows, fairness: fair.rows, chat: chat.rows });
    } catch (e) {
      report.quarantined.push(id);
      console.error(`[recovery] quarantining table ${id}: ${(e as Error).message}`);
      try { fs.rename(dir, join(root, "quarantine", `${id}-${now}`)); } catch (e2) { console.error("[recovery] quarantine failed", e2); }
    }
  }
  return report;
}
