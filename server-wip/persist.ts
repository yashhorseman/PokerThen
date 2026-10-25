import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, unlinkSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * Durable storage under DATA_DIR (Azure: /home/data — the only persistent path there).
 * One JSON file per table, written atomically (tmp + fsync + rename) BEFORE a command is acknowledged.
 */
export class Persistence {
  constructor(readonly dir: string) { mkdirSync(join(dir, 'games'), { recursive: true }); }

  private file(id: string) { return join(this.dir, 'games', `${id}.json`); }

  save(id: string, json: string) {
    const tmp = this.file(id) + '.' + randomBytes(4).toString('hex') + '.tmp';
    writeFileSync(tmp, json);
    const fd = openSync(tmp, 'r+'); try { fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(tmp, this.file(id));
  }
  remove(id: string) { try { unlinkSync(this.file(id)); } catch { /* gone */ } }

  loadAll(): Array<{ id: string; json: string }> {
    const out: Array<{ id: string; json: string }> = [];
    for (const f of readdirSync(join(this.dir, 'games'))) {
      if (!f.endsWith('.json')) continue;
      try { out.push({ id: f.slice(0, -5), json: readFileSync(join(this.dir, 'games', f), 'utf8') }); } catch (e) { console.error('cannot read', f, e); }
    }
    return out;
  }

  /** per-installation secret used to derive player ids from the identity cookie (SESSION_SECRET env wins) */
  secret(): string {
    if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
    const p = join(this.dir, '.secret');
    if (existsSync(p)) return readFileSync(p, 'utf8').trim();
    const s = randomBytes(32).toString('hex');
    writeFileSync(p, s, { mode: 0o600 });
    return s;
  }
}
