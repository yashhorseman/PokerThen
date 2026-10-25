/**
 * ART CONTRACT (owner: art agent).  Everything is ORIGINAL artwork (never copy the reference site's images/fonts/svg).
 * Other agents import ONLY from '../art' (this file).  The exports below are the stable API; the art agent replaces
 * the placeholder bodies with real SVG and may add exports (additive only).
 */
import type { CSSProperties } from 'react';

export type IconName =
  | 'options' | 'leave-seat' | 'away' | 'im-back' | 'sound-off' | 'sound-low' | 'sound-med' | 'sound-high'
  | 'spectators' | 'pause' | 'play' | 'stop' | 'fullscreen' | 'balloon' | 'clock' | 'fold' | 'quitting'
  | 'trophy' | 'reentry' | 'home' | 'new-game' | 'hamburger' | 'close' | 'copy' | 'chevron-up' | 'chevron-down'
  | 'chevron-left' | 'plus' | 'minus' | 'help' | 'eye' | 'record-dot' | 'emoji' | 'settings' | 'players'
  | 'preferences' | 'video-audio' | 'save-hand' | 'log' | 'sign-in' | 'mic' | 'camera' | 'check' | 'x' | 'user'
  | 'ledger' | 'replayer' | 'collapse' | 'external' | 'warning';

/** monochrome icon using `currentColor`; `size` in CSS units (default '1em') */
export function Icon({ name, size = '1em', className, style }: { name: IconName; size?: string; className?: string; style?: CSSProperties }) {
  return <span className={'icon ' + (className ?? '')} style={{ display: 'inline-block', width: size, height: size, ...style }} data-icon={name} />;
}

/** suit glyph as SVG, `currentColor` fill. suit: 's'|'h'|'d'|'c' */
export function SuitIcon({ suit, className, style }: { suit: string; className?: string; style?: CSSProperties }) {
  return <span className={className} style={style}>{({ s: '♠', h: '♥', d: '♦', c: '♣' } as Record<string, string>)[suit]}</span>;
}

/** the card back (fills its parent: width/height 100%, radius inherited) */
export function CardBack({ className }: { className?: string }) { return <div className={'card-back-art ' + (className ?? '')} style={{ width: '100%', height: '100%', background: '#5a3a8a' }} />; }

/** PokerThen logo. 'tag' = small black tag top-left of the table (120x28 box), 'full' = marketing/sidebar */
export function Logo({ variant = 'tag', className }: { variant?: 'tag' | 'full'; className?: string }) { return <span className={className}>PokerThen{variant === 'full' ? '' : ''}</span>; }

export type SoundName = 'two-taps' | 'chips' | 'fold' | 'winner' | 'card-place' | 'beep' | 'warning-beep' | 'chat-beep' | 'new-player-beep';
export { unlockAudio, playSound, setMasterVolume, isSecondarySound } from './sounds';
