import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { seal, unseal } from './util';
import type { RoomState } from './room';

/**
 * Durable room storage: one JSON snapshot per room, written atomically (write temp file, rename).
 * The shuffled deck and per-card salts of a hand in progress are encrypted at rest (AES-256-GCM).
 * A command is acknowledged only after its state has been persisted.
 */
export class Store {
  private dir: string;
  constructor(dataDir: string, private key: Buffer) {
    this.dir = join(dataDir, 'rooms');
    mkdirSync(this.dir, { recursive: true });
  }

  private file(id: string) {
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) throw new Error('bad room id');
    return join(this.dir, id + '.json');
  }

  save(state: RoomState) {
    const copy = JSON.parse(JSON.stringify(state)) as RoomState & { sealed?: string };
    const h = copy.table.hand;
    if (h) {
      copy.sealed = seal(JSON.stringify({ deck: h.deck, salts: h.salts }), this.key);
      (h as unknown as Record<string, unknown>).deck = [];
      (h as unknown as Record<string, unknown>).salts = [];
    }
    const f = this.file(state.id);
    writeFileSync(f + '.tmp', JSON.stringify(copy));
    renameSync(f + '.tmp', f);
  }

  loadAll(): RoomState[] {
    const out: RoomState[] = [];
    if (!existsSync(this.dir)) return out;
    for (const name of readdirSync(this.dir)) {
      if (!name.endsWith('.json')) continue;
      try {
        const raw = JSON.parse(readFileSync(join(this.dir, name), 'utf8')) as RoomState & { sealed?: string };
        if (raw.sealed && raw.table.hand) {
          const s = JSON.parse(unseal(raw.sealed, this.key)) as { deck: string[]; salts: string[] };
          raw.table.hand.deck = s.deck;
          raw.table.hand.salts = s.salts;
        }
        delete raw.sealed;
        out.push(raw);
      } catch (e) {
        console.error('failed to load room file', name, e instanceof Error ? e.message : e);
      }
    }
    return out;
  }
}
