// Preloaded into the REAL server process (node --require) by the security harness.
// Detects prototype pollution: snapshot the own property names of the built-in prototypes at startup and report any change to $PT_PROBE_FILE.
const protos = {
  Object: Object.prototype, Array: Array.prototype, Function: Function.prototype, String: String.prototype,
  Number: Number.prototype, Boolean: Boolean.prototype, Map: Map.prototype, Set: Set.prototype
};
const base = Object.fromEntries(Object.entries(protos).map(([k, p]) => [k, new Set(Reflect.ownKeys(p).map(String))]));
const file = process.env.PT_PROBE_FILE;
const fs = require("node:fs");
const seen = new Set();
setInterval(() => {
  for (const [k, p] of Object.entries(protos)) {
    for (const n of Reflect.ownKeys(p).map(String)) {
      if (!base[k].has(n) && !seen.has(k + "." + n)) {
        seen.add(k + "." + n);
        try { if (file) fs.appendFileSync(file, `POLLUTED ${k}.prototype.${n}\n`); } catch { /* ignore */ }
      }
    }
  }
  // a polluted Object.prototype is also visible through fresh objects
  const probe = {};
  for (const n in probe) { const key = "inherited." + n; if (!seen.has(key)) { seen.add(key); try { if (file) fs.appendFileSync(file, `POLLUTED inherited enumerable ${n}\n`); } catch { /* ignore */ } } }
}, 50).unref();
