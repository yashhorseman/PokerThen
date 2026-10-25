import { getPrefs } from './prefs';

let ctx: AudioContext | null = null;

/** Tiny synthesized cues — no audio files. Never throws: if the browser blocks audio, play continues silently. */
function tone(freq: number, ms: number, when = 0, gain = 1) {
  const vol = getPrefs().volume / 100;
  if (!vol) return;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = freq;
    const t0 = ctx.currentTime + when;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.18 * vol * gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
    o.connect(g); g.connect(ctx.destination);
    o.start(t0); o.stop(t0 + ms / 1000 + 0.05);
  } catch { /* ignore */ }
}

export const sounds = {
  turn() { tone(740, 130); tone(988, 160, 0.12); },
  win() { tone(523, 120); tone(659, 120, 0.1); tone(784, 220, 0.2); },
  chat() { if (getPrefs().chatBeep) tone(1200, 70, 0, 0.6); },
  deal() { tone(300, 40, 0, 0.5); },
};
