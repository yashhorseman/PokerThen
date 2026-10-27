import {
  closeSync, fsyncSync, ftruncateSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeSync, existsSync
} from "node:fs";
import { dirname } from "node:path";

/**
 * Every durable disk operation the server performs goes through this interface so tests can inject faults
 * (fail after N writes) and prove "persist before ack".
 */
export interface DurableFs {
  mkdirp(dir: string): void;
  /** append lines (each already newline-free JSON) and fsync; returns the file size BEFORE the append */
  appendDurable(file: string, lines: string[]): number;
  /** atomic replace: tmp write + fsync + rename + fsync(dir). Mode 0600. */
  writeAtomic(file: string, data: string): void;
  truncate(file: string, size: number): void;
  size(file: string): number;
  read(file: string): string | null;
  exists(path: string): boolean;
  list(dir: string): string[];
  rename(from: string, to: string): void;
  remove(path: string): void;
}

/** SECURITY (Phase C): write(2) may be SHORT on a full disk / quota / RLIMIT_FSIZE and writeSync does not retry; a torn append or a torn state.json.tmp renamed over state.json loses the table. Loop and throw instead. */
function writeAll(fd: number, text: string): void {
  const buf = Buffer.from(text, "utf8");
  let off = 0;
  while (off < buf.length) {
    const n = writeSync(fd, buf, off, buf.length - off);
    if (n <= 0) throw new Error("short write: no progress");
    off += n;
  }
}

function fsyncDir(dir: string): void {
  try {
    const fd = openSync(dir, "r");
    try { fsyncSync(fd); } finally { closeSync(fd); }
  } catch { /* some platforms cannot fsync a directory */ }
}

export const nodeFs: DurableFs = {
  mkdirp: (dir) => { mkdirSync(dir, { recursive: true, mode: 0o700 }); },
  appendDurable(file, lines) {
    const before = existsSync(file) ? statSync(file).size : 0;
    const fd = openSync(file, "a", 0o600);
    try {
      writeAll(fd, lines.map((l) => l + "\n").join(""));
      fsyncSync(fd);
    } finally { closeSync(fd); }
    if (before === 0) fsyncDir(dirname(file));
    return before;
  },
  writeAtomic(file, data) {
    const tmp = file + ".tmp";
    const fd = openSync(tmp, "w", 0o600);
    try {
      writeAll(fd, data);
      fsyncSync(fd);
    } catch (e) {
      try { closeSync(fd); } catch { /* ignore */ }
      try { rmSync(tmp, { force: true }); } catch { /* ignore */ }
      throw e;
    }
    closeSync(fd);
    renameSync(tmp, file);
    fsyncDir(dirname(file));
  },
  truncate(file, size) {
    const fd = openSync(file, "r+");
    try { ftruncateSync(fd, size); fsyncSync(fd); } finally { closeSync(fd); }
  },
  size: (file) => (existsSync(file) ? statSync(file).size : 0),
  read: (file) => (existsSync(file) ? readFileSync(file, "utf8") : null),
  exists: (p) => existsSync(p),
  list: (dir) => (existsSync(dir) ? readdirSync(dir) : []),
  rename: (a, b) => { renameSync(a, b); },
  remove: (p) => { rmSync(p, { recursive: true, force: true }); }
};

/** Test helper: wraps a DurableFs and throws on the Nth mutating call (1-based) and every call after it. */
export function faultyFs(base: DurableFs, failAfter: { n: number }): DurableFs & { calls: number } {
  const w: DurableFs & { calls: number } = { ...base, calls: 0 };
  const guard = <A extends unknown[], R>(f: (...a: A) => R) => (...a: A): R => {
    w.calls++;
    if (failAfter.n >= 0 && w.calls > failAfter.n) throw new Error("injected fs failure");
    return f(...a);
  };
  w.appendDurable = guard(base.appendDurable);
  w.writeAtomic = guard(base.writeAtomic);
  return w;
}
