import { SECONDARY_SOUNDS, VOLUME_VALUE, type AudioApi, type SoundName, type VolumeLevel } from "@pokerthen/shared";
import { renderSound } from "./synth";

export { renderSound, MAX_SECONDS } from "./synth";

type Ctx = AudioContext;

/**
 * AudioApi implementation (ARCH 10.1). Sounds are synthesised on demand (src/audio/synth.ts), cached as AudioBuffers.
 * Everything is muted until a first user gesture unlocks audio by playing the silent `dumb-sound` (SPEC 18.1).
 */
export class PokerThenAudio implements AudioApi {
  private ctx: Ctx | null = null;
  private gain: GainNode | null = null;
  private unlocked = false;
  private level: VolumeLevel = "med";
  private secondaryDisabled = false;
  private chatBeepDisabled = false;
  private cache = new Map<SoundName, AudioBuffer>();
  private listening = false;
  /** names played (for tests / diagnostics) */
  readonly log: SoundName[] = [];

  /** Hook first-gesture listeners; also callable directly from a click handler. */
  installGestureUnlock(target: Document | undefined = typeof document !== "undefined" ? document : undefined): void {
    if (this.listening || !target) return;
    this.listening = true;
    const go = () => { this.unlock(); if (this.unlocked) for (const e of ["pointerdown", "keydown", "touchend"]) target.removeEventListener(e, go, true); };
    for (const e of ["pointerdown", "keydown", "touchend"]) target.addEventListener(e, go, true);
  }

  unlock(): void {
    if (this.unlocked) return;
    try {
      const AC = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
        (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = this.ctx ?? new AC();
      this.gain = this.ctx.createGain();
      this.gain.gain.value = VOLUME_VALUE[this.level];
      this.gain.connect(this.ctx.destination);
      void this.ctx.resume?.();
      this.unlocked = true;
      this.start("dumb-sound");
    } catch { /* audio unavailable: stay silent */ }
  }

  setVolume(level: VolumeLevel): void {
    this.level = level;
    if (this.gain) this.gain.gain.value = VOLUME_VALUE[level];
  }
  setSecondaryDisabled(v: boolean): void { this.secondaryDisabled = v; }
  setChatBeepDisabled(v: boolean): void { this.chatBeepDisabled = v; }

  /** Whether `name` would currently make noise (volume, class mute, unlock). */
  wouldPlay(name: SoundName): boolean {
    if (name === "dumb-sound") return false;
    if (VOLUME_VALUE[this.level] <= 0) return false;
    if (this.secondaryDisabled && SECONDARY_SOUNDS.includes(name)) return false;
    if (this.chatBeepDisabled && name === "chat-beep") return false;
    return true;
  }

  play(name: SoundName): void {
    if (!this.unlocked || !this.wouldPlay(name)) return;
    this.start(name);
  }

  private start(name: SoundName): void {
    const ctx = this.ctx, gain = this.gain;
    if (!ctx || !gain) return;
    try {
      let buf = this.cache.get(name);
      if (!buf) {
        const data = renderSound(name, ctx.sampleRate);
        buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
        buf.getChannelData(0).set(data);
        this.cache.set(name, buf);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(gain);
      src.start();
      this.log.push(name);
      if (this.log.length > 200) this.log.shift();
    } catch { /* ignore */ }
  }
}

/** Shared instance for the app; W4 exposes it through `useAudio()`. */
export const audio = new PokerThenAudio();
audio.installGestureUnlock();
