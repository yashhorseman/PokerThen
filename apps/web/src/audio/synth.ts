/**
 * PokerThen original sounds: pure-DSP synthesis into Float32Array (deterministic, testable in Node,
 * played through a WebAudio AudioBufferSourceNode). U-A1: reference durations unknown; ours are short (<=600 ms, winner <=1.5 s).
 */
import type { SoundName } from "@pokerthen/shared";

export const MAX_SECONDS: Record<SoundName, number> = {
  "two-taps": 0.6, chips: 0.6, fold: 0.6, winner: 1.5, "card-place": 0.6, beep: 0.6,
  "warning-beep": 0.6, "chat-beep": 0.6, "new-player-beep": 0.6, lost: 0.6, "dumb-sound": 0.6
};
const PEAK = 0.8; // final peak after normalisation (no clipping)

class Rng {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0 || 1; }
  next(): number { this.s = (Math.imul(this.s, 1664525) + 1013904223) >>> 0; return this.s / 4294967296; }
  signed(): number { return this.next() * 2 - 1; }
}

type Buf = Float32Array;
const TAU = Math.PI * 2;

/** exponentially decaying sine partial(s) starting at `at` seconds */
function tone(b: Buf, sr: number, at: number, freq: number, dur: number, amp: number, decay: number, partials: [number, number][] = [[1, 1]], attack = 0.003, glideTo?: number) {
  const n = Math.min(b.length - Math.floor(at * sr), Math.floor(dur * sr));
  const s0 = Math.floor(at * sr);
  let phase = new Array(partials.length).fill(0) as number[];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.min(1, t / attack) * Math.exp(-t * decay) * Math.min(1, (dur - t) / 0.01);
    const f = glideTo ? freq + (glideTo - freq) * (t / dur) : freq;
    let v = 0;
    for (let k = 0; k < partials.length; k++) {
      phase[k]! += (TAU * f * partials[k]![0]) / sr;
      v += Math.sin(phase[k]!) * partials[k]![1];
    }
    b[s0 + i]! += v * env * amp;
  }
}

/** band-limited noise burst (one-pole high/low pass mix) */
function noise(b: Buf, sr: number, at: number, dur: number, amp: number, decay: number, rng: Rng, lp: number, sweepTo?: number, hp = 0) {
  const s0 = Math.floor(at * sr);
  const n = Math.min(b.length - s0, Math.floor(dur * sr));
  let y = 0, hpPrev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const cutoff = sweepTo ? lp + (sweepTo - lp) * (t / dur) : lp;
    const a = 1 - Math.exp((-TAU * cutoff) / sr);
    y += a * (rng.signed() - y);
    const hpv = y - hpPrev; hpPrev += hp * hpv;
    const env = Math.min(1, t / 0.002) * Math.exp(-t * decay) * Math.min(1, (dur - t) / 0.01);
    b[s0 + i]! += (hp ? y - hpPrev : y) * env * amp;
  }
}

function normalise(b: Buf, peak = PEAK) {
  let m = 0;
  for (let i = 0; i < b.length; i++) m = Math.max(m, Math.abs(b[i]!));
  if (m === 0) return;
  const g = peak / m;
  for (let i = 0; i < b.length; i++) b[i]! *= g;
}

const NOTE = (semi: number) => 440 * Math.pow(2, semi / 12); // semitones from A4

export function renderSound(name: SoundName, sr = 44100): Float32Array {
  const rng = new Rng(name.length * 7919 + name.charCodeAt(0));
  const len = (s: number) => new Float32Array(Math.ceil(s * sr));
  let b: Buf;
  switch (name) {
    case "two-taps": { // two soft wood taps
      b = len(0.3);
      for (const at of [0, 0.12]) { tone(b, sr, at, 760, 0.1, 1, 38, [[1, 1], [2.4, 0.4]]); noise(b, sr, at, 0.03, 0.5, 120, rng, 3500); }
      break;
    }
    case "chips": { // stack of ceramic clicks
      b = len(0.45);
      const hits = [0, 0.045, 0.09, 0.15, 0.2, 0.27];
      hits.forEach((at, i) => {
        const f = 2300 + rng.next() * 1800;
        tone(b, sr, at, f, 0.08, 0.7 - i * 0.05, 55, [[1, 1], [1.51, 0.5], [2.2, 0.3]]);
        noise(b, sr, at, 0.02, 0.3, 200, rng, 6000);
      });
      break;
    }
    case "fold": { // downward paper swish
      b = len(0.28);
      noise(b, sr, 0, 0.26, 1, 9, rng, 5200, 600);
      tone(b, sr, 0, 190, 0.12, 0.25, 30, [[1, 1]], 0.004, 120);
      break;
    }
    case "winner": { // bright rising arpeggio with bell partials, held chord
      b = len(1.45);
      const notes = [0, 4, 7, 12, 16].map((s) => NOTE(s - 9)); // C5 E5 G5 C6 E6
      notes.forEach((f, i) => tone(b, sr, i * 0.09, f, 1.0, 0.55, 3.2, [[1, 1], [2, 0.35], [3, 0.2], [4.2, 0.12]], 0.004));
      [0, 7, 12].forEach((s) => tone(b, sr, 0.45, NOTE(s - 21), 0.95, 0.3, 2.4, [[1, 1], [2, 0.3]], 0.02));
      break;
    }
    case "card-place": { // snap of card on felt
      b = len(0.14);
      noise(b, sr, 0, 0.05, 1, 85, rng, 4200, 1800);
      tone(b, sr, 0, 150, 0.1, 0.9, 40, [[1, 1], [2, 0.3]], 0.001, 90);
      break;
    }
    case "beep": { // your turn: two rising notes
      b = len(0.3);
      tone(b, sr, 0, NOTE(3), 0.12, 0.8, 8, [[1, 1], [2, 0.15]], 0.004);
      tone(b, sr, 0.13, NOTE(10), 0.17, 0.9, 7, [[1, 1], [2, 0.15]], 0.004);
      break;
    }
    case "warning-beep": { // three quick pulses
      b = len(0.4);
      [0, 0.13, 0.26].forEach((at) => tone(b, sr, at, 1240, 0.08, 0.8, 14, [[1, 1], [3, 0.12]], 0.002));
      break;
    }
    case "chat-beep": { // soft pop
      b = len(0.16);
      tone(b, sr, 0, 620, 0.13, 0.9, 22, [[1, 1]], 0.003, 930);
      break;
    }
    case "new-player-beep": { // doorbell-like two notes
      b = len(0.5);
      tone(b, sr, 0, NOTE(-4), 0.2, 0.8, 7, [[1, 1], [2.76, 0.25]], 0.004);
      tone(b, sr, 0.17, NOTE(-9), 0.3, 0.8, 6, [[1, 1], [2.76, 0.25]], 0.004);
      break;
    }
    case "lost": { // sinking minor third
      b = len(0.55);
      tone(b, sr, 0, NOTE(-2), 0.22, 0.8, 6, [[1, 1], [2, 0.3]], 0.006);
      tone(b, sr, 0.2, NOTE(-5), 0.3, 0.8, 5, [[1, 1], [2, 0.3]], 0.006, NOTE(-6));
      break;
    }
    case "dumb-sound":
      return new Float32Array(Math.ceil(0.05 * sr));
  }
  normalise(b);
  return b;
}
