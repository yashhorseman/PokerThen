import type { EngineEffect } from "@pokerthen/shared";

/**
 * Public fairness records (FAIRNESS-MERKLE.md). The server stores whatever the engine's commit/reveal effects contain
 * (their exact shape is owned by shared/engine) and serves them publicly. Defence in depth: keys that could only ever hold
 * the full deck or the master salt are stripped from anything served, so a buggy engine cannot publish unexposed cards.
 */
export const FORBIDDEN_PUBLIC_KEYS = new Set(["deck", "masterSalt", "master_salt"]);

export interface FairnessRow { seq: number; type: "commit" | "reveal"; handNumber: number; data: Record<string, unknown> }

export function stripForbidden(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripForbidden);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) if (!FORBIDDEN_PUBLIC_KEYS.has(k)) out[k] = stripForbidden(x);
    return out;
  }
  return v;
}

export class FairnessStore {
  private commits = new Map<number, Record<string, unknown>>();
  private reveals = new Map<number, Record<string, unknown>>();

  static fromRows(rows: unknown[]): FairnessStore {
    const s = new FairnessStore();
    for (const r of rows as FairnessRow[]) s.add(r);
    return s;
  }

  /** rows to append for a batch of effects (not yet applied) */
  plan(seq: number, effects: EngineEffect[]): FairnessRow[] {
    const out: FairnessRow[] = [];
    for (const e of effects) {
      if (e.kind === "commit") {
        const { kind: _k, ...rest } = e as Record<string, unknown> & { kind: string };
        out.push({ seq, type: "commit", handNumber: e.handNumber, data: rest });
      } else if (e.kind === "reveal") {
        const reveal = e.reveal as unknown as Record<string, unknown>;
        out.push({ seq, type: "reveal", handNumber: Number(reveal.handNumber), data: reveal });
      }
    }
    return out;
  }

  add(r: FairnessRow): void {
    (r.type === "commit" ? this.commits : this.reveals).set(r.handNumber, r.data);
  }

  /** Persisted line format: {"seq":N,"type":"commit"|"reveal",...fields} (ARCH 8) */
  static toLine(r: FairnessRow): string {
    return JSON.stringify(r.type === "commit" ? { seq: r.seq, type: r.type, ...r.data } : { seq: r.seq, type: r.type, ...r.data });
  }
  static fromLine(o: Record<string, unknown>): FairnessRow {
    const { seq, type, ...rest } = o as { seq: number; type: "commit" | "reveal" } & Record<string, unknown>;
    return { seq, type, handNumber: Number(rest.handNumber), data: rest };
  }

  /** GET /api/games/:id/fairness/:hand body (FairnessRecord superset); null when the hand has no commitment. */
  record(hand: number): Record<string, unknown> | null {
    const c = this.commits.get(hand);
    if (!c) return null;
    const out = stripForbidden(c) as Record<string, unknown>;
    if (out.committedAtMs === undefined) out.committedAtMs = null;
    const rv = this.reveals.get(hand);
    out.reveal = rv ? stripForbidden(rv) : null;
    return out;
  }
}
