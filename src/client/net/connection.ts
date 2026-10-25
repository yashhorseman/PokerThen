import type { ClientAction, ClientMessage, Frame, RpcErrorBody, RpcMethodName, RpcMethods, ServerMessage } from '../../shared/protocol';
import { TIMING } from '../../shared/constants';
import { appStore } from '../state/store';

/** Dev/mock hook: when set, actions and rpc calls are routed here instead of the network (see src/client/dev). */
export interface MockBackend {
  action?(a: ClientAction): void;
  rpc?(method: RpcMethodName, params: unknown): Promise<unknown> | unknown;
}
let mock: MockBackend | null = null;
export function setMockBackend(m: MockBackend | null) { mock = m; }
/** Feed a frame directly into the store (used by mock mode and by the connection) */
export function applyFrame(frame: Frame) {
  const s = appStore.getState();
  appStore.setState({ prevFrame: s.frame, frame, clockOffset: Date.now() - frame.serverNow });
}

let ws: WebSocket | null = null;
let gameId: string | null = null;
let stopped = true;
let attempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let pongTimer: ReturnType<typeof setTimeout> | null = null;
let rpcSeq = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: RpcErrorBody) => void }>();

function wsUrl(id: string, layout: 'd' | 'm') {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws?gameID=${encodeURIComponent(id)}&layout=${layout}`;
}

export function startConnection(id: string, layout: 'd' | 'm') {
  gameId = id; stopped = false; attempt = 0;
  appStore.setState({ gameId: id, layout, conn: 'connecting', failed: null, disposed: false });
  open();
}
export function stopConnection() {
  stopped = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  clearTimers();
  ws?.close(); ws = null;
  appStore.setState({ conn: 'idle' });
}
export function reconnectNow() { if (!gameId) return; ws?.close(); attempt = 0; stopped = false; open(); }

function clearTimers() {
  if (pingTimer) clearInterval(pingTimer); pingTimer = null;
  if (pongTimer) clearTimeout(pongTimer); pongTimer = null;
}

function open() {
  if (!gameId) return;
  const layout = appStore.getState().layout;
  const sock = new WebSocket(wsUrl(gameId, layout));
  ws = sock;
  sock.onopen = () => {
    attempt = 0;
    pingTimer = setInterval(() => {
      send({ t: 'ping' });
      if (pongTimer) clearTimeout(pongTimer);
      pongTimer = setTimeout(() => sock.close(), 5000); // reference: pingTimeout 5s
    }, TIMING.PING_INTERVAL_MS);
  };
  sock.onmessage = (ev) => {
    let m: ServerMessage;
    try { m = JSON.parse(String(ev.data)); } catch { return; }
    handle(m);
  };
  sock.onclose = () => {
    clearTimers();
    if (ws === sock) ws = null;
    for (const [, p] of pending) p.reject({ status: 0, message: 'disconnected' });
    pending.clear();
    if (stopped) return;
    const s = appStore.getState();
    if (s.conn !== 'failed') appStore.setState({ conn: 'disconnected' });
    if (s.conn === 'failed' || s.disposed) return;
    attempt++;
    const delay = Math.min(5000, 1000 * Math.pow(1.5, attempt - 1)) * (0.75 + Math.random() * 0.5); // 1s..5s with jitter
    reconnectTimer = setTimeout(open, delay);
  };
  sock.onerror = () => { /* onclose follows */ };
}

function handle(m: ServerMessage) {
  switch (m.t) {
    case 'registered':
      appStore.setState({ conn: 'connected', chat: m.chat, frame: m.frame, prevFrame: null, clockOffset: Date.now() - m.serverNow });
      break;
    case 'frame': applyFrame(m.frame); break;
    case 'chat': appStore.setState((s) => ({ chat: [...s.chat, m.msg].slice(-200) })); break;
    case 'pong': if (pongTimer) clearTimeout(pongTimer); pongTimer = null; break;
    case 'rpcResult': {
      const p = pending.get(m.id); if (!p) return; pending.delete(m.id);
      if (m.ok) p.resolve(m.data); else p.reject(m.error);
      break;
    }
    case 'failed': appStore.setState({ conn: 'failed', failed: { code: m.code, msg: m.msg } }); break;
    case 'disposed': appStore.setState({ disposed: true, conn: 'disconnected' }); break;
  }
}

function send(m: ClientMessage) { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); }

export function sendAction(action: ClientAction) {
  if (mock?.action) { mock.action(action); return; }
  send({ t: 'action', action });
}

/** request/response call. Rejects with RpcErrorBody ({status, errors?, message?}). */
export function rpc<M extends RpcMethodName>(method: M, params: RpcMethods[M]['params']): Promise<RpcMethods[M]['result']> {
  if (mock?.rpc) return Promise.resolve(mock.rpc(method, params)) as Promise<RpcMethods[M]['result']>;
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) { reject({ status: 0, message: 'not connected' } as RpcErrorBody); return; }
    const id = rpcSeq++;
    const timer = setTimeout(() => { pending.delete(id); reject({ status: 0, message: 'timeout' } as RpcErrorBody); }, 10_000);
    pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v as never); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    send({ t: 'rpc', id, method, params });
  });
}
