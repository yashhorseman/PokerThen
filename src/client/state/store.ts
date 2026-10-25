import type { ChatMessage, Frame } from '../../shared/protocol';
import { createStore } from './createStore';

export type ConnState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'failed';

export interface AppState {
  conn: ConnState;
  failed: { code: string; msg?: string } | null;
  gameId: string | null;
  /** latest frame / the one before it (components diff them for sounds & animations) */
  frame: Frame | null;
  prevFrame: Frame | null;
  chat: ChatMessage[];
  /** Date.now() - serverNow, from the latest frame (no RTT correction, same as the reference) */
  clockOffset: number;
  /** 'd' landscape/desktop layout, 'm' portrait */
  layout: 'd' | 'm';
  /** true when the table was disposed by the server */
  disposed: boolean;
}

export const appStore = createStore<AppState>({
  conn: 'idle', failed: null, gameId: null, frame: null, prevFrame: null, chat: [], clockOffset: 0, layout: 'd', disposed: false,
});
export const useApp = appStore.useStore;

/** server-synchronised "now" (ms) */
export function serverNow(): number { return Date.now() - appStore.getState().clockOffset; }
