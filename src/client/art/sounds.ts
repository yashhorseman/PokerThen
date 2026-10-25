// PLACEHOLDER - the art agent replaces this with WebAudio-synthesised original sounds (same exports).
import type { SoundName } from './index';
export type { SoundName };
export function unlockAudio(): void { /* resume AudioContext on first user gesture */ }
/** master volume 0..1 (off 0 / low .15 / med .45 / high 1) */
export function setMasterVolume(_v: number): void {}
export function playSound(_name: SoundName): void {}
/** secondary = fold/check/bet/card sounds that "Disable Secondary Sound Effects?" mutes */
export function isSecondarySound(name: SoundName): boolean { return name === 'two-taps' || name === 'chips' || name === 'fold' || name === 'card-place'; }
