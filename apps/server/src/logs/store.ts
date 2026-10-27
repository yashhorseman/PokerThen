import type { EngineEffect, LogEntry, PlayerId } from "@pokerthen/shared";
import { LIMITS } from "../limits.js";

export interface StoredLog { seq: number; createdAt: number; handNumber: number; msg: string; onlyFor?: PlayerId }

/** In-memory index of log.jsonl. createdAt = epoch ms * 100 (SPEC 15.1), strictly increasing per table. */
export class LogStore {
  private all: StoredLog[] = [];
  private byHand = new Map<number, StoredLog[]>();
  lastCreatedAt = 0;

  static fromRows(rows: unknown[]): LogStore {
    const s = new LogStore();
    for (const r of rows as StoredLog[]) s.add(r);
    return s;
  }

  /** Build records for a batch of engine log effects without mutating the store (so a failed persist leaves no trace). */
  plan(seq: number, effects: EngineEffect[]): StoredLog[] {
    let last = this.lastCreatedAt;
    const out: StoredLog[] = [];
    for (const e of effects) {
      if (e.kind !== "log") continue;
      last = Math.max(e.atMs * 100, last + 1);
      const rec: StoredLog = { seq, createdAt: last, handNumber: e.handNumber, msg: e.msg };
      if (e.onlyFor) rec.onlyFor = e.onlyFor;
      out.push(rec);
    }
    return out;
  }

  add(r: StoredLog): void {
    this.all.push(r);
    let h = this.byHand.get(r.handNumber);
    if (!h) this.byHand.set(r.handNumber, (h = []));
    h.push(r);
    if (r.createdAt > this.lastCreatedAt) this.lastCreatedAt = r.createdAt;
  }

  private visible(r: StoredLog, viewer: PlayerId): boolean { return !r.onlyFor || r.onlyFor === viewer; }

  /** log_v3: entries of one hand rendered for the viewer (other players' onlyFor lines are redacted), oldest first. */
  forHand(hand: number, viewer: PlayerId, afterAt?: number): LogEntry[] {
    if (hand <= 0) return [];
    return (this.byHand.get(hand) ?? [])
      .filter((r) => this.visible(r, viewer) && (afterAt === undefined || r.createdAt > afterAt))
      .map((r) => ({ createdAt: r.createdAt, msg: r.msg }));
  }

  /** whole log for the viewer, capped at the newest CSV_MAX_LINES lines. */
  forViewer(viewer: PlayerId): StoredLog[] {
    const v = this.all.filter((r) => this.visible(r, viewer));
    return v.length > LIMITS.CSV_MAX_LINES ? v.slice(v.length - LIMITS.CSV_MAX_LINES) : v;
  }
}

const csvCell = (v: string | number): string => {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const csvRow = (cells: Array<string | number>): string => cells.map(csvCell).join(",");

/** CSV columns are a placeholder (SPEC 22 "CSV exact columns": `entry,at,order`; at = ISO time). */
export function logCsv(rows: StoredLog[]): string {
  const lines = ["entry,at,order"];
  rows.forEach((r, i) => lines.push(csvRow([r.msg, new Date(Math.floor(r.createdAt / 100)).toISOString(), i + 1])));
  return lines.join("\n") + "\n";
}
