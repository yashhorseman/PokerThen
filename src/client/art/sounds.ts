/**
 * PokerThen sound effects - 100% synthesised with WebAudio (no files, nothing copied from any other product).
 * Names/roles follow research/02 §13.  API (stable): unlockAudio, setMasterVolume, playSound, isSecondarySound.
 *
 * Design notes
 *  - everything routes through  master gain -> soft limiter (DynamicsCompressor) -> destination
 *  - the context is created on the first user gesture (listeners are attached automatically on import)
 *  - playSound is a silent no-op until unlocked, never throws, and drops an identical sound re-triggered within 30 ms
 */
import type { SoundName } from './index';
export type { SoundName };

type Ctx = AudioContext;

let ctx: Ctx | null = null;
let master: GainNode | null = null;
let volume = 0.45; // "med" (research/02 §13: off 0 / low .15 / med .45 / high 1)
let noiseBuf: AudioBuffer | null = null;
const lastPlayed: Partial<Record<SoundName, number>> = {};

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function createContext(): Ctx | null {
  try {
    const AC: typeof AudioContext | undefined = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const c = new AC();
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 12;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    master = c.createGain();
    master.gain.value = volume;
    master.connect(limiter);
    limiter.connect(c.destination);
    // 1 s of white noise, shared by all noise based sounds
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let seed = 0x9e3779b9; // deterministic xorshift so every playback has the same texture
    for (let i = 0; i < d.length; i++) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      d[i] = ((seed >>> 0) / 0xffffffff) * 2 - 1;
    }
    return c;
  } catch {
    return null;
  }
}

/** Create/resume the AudioContext.  Must be called from (or after) a user gesture; auto-attached on import. */
export function unlockAudio(): void {
  try {
    if (!ctx) {
      ctx = createContext();
      if (ctx) {
        // silent one-sample buffer: unlocks iOS Safari
        const b = ctx.createBuffer(1, 1, 22050);
        const s = ctx.createBufferSource();
        s.buffer = b;
        s.connect(ctx.destination);
        s.start(0);
      }
    }
    if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  } catch {
    /* audio is optional */
  }
}

/** master volume 0..1 (off 0 / low .15 / med .45 / high 1) */
export function setMasterVolume(v: number): void {
  volume = Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
  try {
    if (master && ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.01);
  } catch { /* ignore */ }
}

/** secondary = fold/check/bet/card sounds that "Disable Secondary Sound Effects?" mutes */
export function isSecondarySound(name: SoundName): boolean {
  return name === 'two-taps' || name === 'chips' || name === 'fold' || name === 'card-place';
}

// ---------------------------------------------------------------------------------------------------------------------
// building blocks (all times relative to `t`, the context time at which the sound starts)

/** exponential-ish decay envelope: quick linear attack to `peak`, then exponential fall to ~0 after `dur` */
function envelope(g: GainNode, t: number, peak: number, attack: number, dur: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
}

function osc(c: Ctx, out: AudioNode, type: OscillatorType, f0: number, f1: number | null, t: number, attack: number, dur: number, peak: number): void {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== null) o.frequency.exponentialRampToValueAtTime(f1, t + attack + dur);
  envelope(g, t, peak, attack, dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

/** filtered noise burst; `f1` (optional) sweeps the filter frequency */
function noise(c: Ctx, out: AudioNode, type: BiquadFilterType, f0: number, f1: number | null, q: number, t: number, attack: number, dur: number, peak: number, offset = 0): void {
  if (!noiseBuf) return;
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const f = c.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== null) f.frequency.exponentialRampToValueAtTime(f1, t + attack + dur);
  const g = c.createGain();
  envelope(g, t, peak, attack, dur);
  s.connect(f).connect(g).connect(out);
  s.start(t, offset % 0.8);
  s.stop(t + attack + dur + 0.05);
}

/** one soft wooden knock (used by two-taps) */
function knock(c: Ctx, out: AudioNode, t: number, pitch: number, gain: number): void {
  osc(c, out, 'sine', pitch * 1.9, pitch * 0.62, t, 0.002, 0.075, gain);
  osc(c, out, 'triangle', pitch * 3.1, pitch * 1.4, t, 0.001, 0.03, gain * 0.28);
  noise(c, out, 'lowpass', 1500, 500, 0.7, t, 0.001, 0.025, gain * 0.55);
}

/** one ceramic chip click: bright noise tick + a few inharmonic ringing partials */
function chipClick(c: Ctx, out: AudioNode, t: number, base: number, gain: number, seed: number): void {
  noise(c, out, 'bandpass', 4200 + seed * 900, null, 3.5, t, 0.0008, 0.012, gain * 0.9, seed * 0.173);
  const partials = [1, 1.52, 2.31, 3.17];
  partials.forEach((r, i) => osc(c, out, 'sine', base * r, null, t, 0.0008, 0.05 / (1 + i * 0.55), gain * 0.36 / (1 + i * 0.7)));
}

/** pleasant bell-ish note (sine + stretched partials) */
function bell(c: Ctx, out: AudioNode, t: number, f: number, dur: number, gain: number): void {
  osc(c, out, 'sine', f, null, t, 0.008, dur, gain);
  osc(c, out, 'sine', f * 2, null, t, 0.006, dur * 0.55, gain * 0.28);
  osc(c, out, 'sine', f * 2.76, null, t, 0.004, dur * 0.22, gain * 0.1);
  osc(c, out, 'sine', f * 4.1, null, t, 0.003, dur * 0.12, gain * 0.05);
}

const RECIPES: Record<SoundName, (c: Ctx, out: AudioNode, t: number) => void> = {
  // check: two soft knocks on the table
  'two-taps': (c, o, t) => { knock(c, o, t, 150, 0.55); knock(c, o, t + 0.115, 135, 0.45); },

  // bet / call / raise: short ceramic chip clatter (5 clicks, uneven spacing, decreasing level)
  chips: (c, o, t) => {
    const hits: [number, number, number, number][] = [[0, 2300, 0.5, 0], [0.034, 2750, 0.42, 1], [0.063, 2050, 0.4, 2], [0.1, 3050, 0.3, 3], [0.138, 2500, 0.24, 4]];
    hits.forEach(([dt, f, g, s]) => chipClick(c, o, t + dt, f, g, s));
    noise(c, o, 'lowpass', 900, 400, 0.5, t, 0.002, 0.1, 0.1); // body of the stack landing
  },

  // fold: card slid across felt - airy swish with a tiny flick at the start
  fold: (c, o, t) => {
    noise(c, o, 'bandpass', 3400, 900, 0.9, t, 0.03, 0.17, 0.5, 0.31);
    noise(c, o, 'highpass', 5200, null, 0.5, t, 0.002, 0.03, 0.16);
  },

  // you win: three rising bell notes (C5 E5 G5) with a final soft octave shimmer
  winner: (c, o, t) => {
    bell(c, o, t, 523.25, 0.9, 0.34);
    bell(c, o, t + 0.13, 659.25, 0.9, 0.34);
    bell(c, o, t + 0.26, 783.99, 1.2, 0.36);
    bell(c, o, t + 0.26, 1567.98, 0.8, 0.08);
  },

  // board card turned: crisp snap
  'card-place': (c, o, t) => {
    noise(c, o, 'highpass', 2200, null, 0.7, t, 0.001, 0.035, 0.5, 0.52);
    noise(c, o, 'bandpass', 1300, 700, 1.2, t + 0.004, 0.002, 0.04, 0.3, 0.1);
    osc(c, o, 'sine', 780, 240, t, 0.001, 0.035, 0.28);
  },

  // your turn: single clear tone
  beep: (c, o, t) => {
    osc(c, o, 'sine', 880, null, t, 0.01, 0.22, 0.5);
    osc(c, o, 'sine', 1760, null, t, 0.01, 0.1, 0.1);
  },

  // time running out: urgent double beep
  'warning-beep': (c, o, t) => {
    [0, 0.17].forEach((dt) => {
      osc(c, o, 'triangle', 1175, null, t + dt, 0.004, 0.09, 0.5);
      osc(c, o, 'sine', 2350, null, t + dt, 0.004, 0.05, 0.1);
    });
  },

  // chat message from someone else: soft blip
  'chat-beep': (c, o, t) => {
    osc(c, o, 'sine', 1240, 1480, t, 0.004, 0.07, 0.28);
    osc(c, o, 'sine', 2480, null, t, 0.004, 0.03, 0.05);
  },

  // someone wants to join: two rising notes
  'new-player-beep': (c, o, t) => {
    osc(c, o, 'sine', 659.25, null, t, 0.006, 0.12, 0.38);
    osc(c, o, 'sine', 987.77, null, t + 0.11, 0.006, 0.2, 0.4);
    osc(c, o, 'sine', 1975.5, null, t + 0.11, 0.006, 0.08, 0.06);
  },
};

/** play a sound by name.  No-op until the audio context is unlocked/running; never throws. */
export function playSound(name: SoundName): void {
  try {
    const c = ctx;
    if (!c || !master) { return; }
    if (volume <= 0) return;
    if (c.state !== 'running') { void c.resume().catch(() => undefined); return; }
    const recipe = RECIPES[name];
    if (!recipe) return;
    const tNow = now();
    const last = lastPlayed[name];
    if (last !== undefined && tNow - last < 30) return;
    lastPlayed[name] = tNow;
    recipe(c, master, c.currentTime + 0.005);
  } catch {
    /* audio must never break the game */
  }
}

// auto-unlock on the first gesture
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  const once = () => {
    unlockAudio();
    for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) window.removeEventListener(ev, once, true);
  };
  for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) window.addEventListener(ev, once, { capture: true, passive: true } as AddEventListenerOptions);
}
