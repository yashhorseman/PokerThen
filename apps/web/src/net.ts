import { useCallback, useEffect, useRef, useState } from 'react';
import { PROTOCOL_VERSION, type ClientCommand, type ErrorInfo, type ServerMessage, type Snapshot } from '@pokerthen/protocol';

export type ConnStatus = 'connecting' | 'live' | 'reconnecting' | 'fatal';
export type SendResult = { ok: true } | { ok: false; error: ErrorInfo };

export async function ensureSession(): Promise<string> {
  const r = await fetch('/api/v1/guest-sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const j = await r.json();
  return j.data.identityId as string;
}

export async function createTable(nickname: string): Promise<{ ok: true; roomId: string } | { ok: false; error: ErrorInfo }> {
  const key = 'pt_create_cmd';
  let cid = sessionStorage.getItem(key);
  if (!cid) { cid = crypto.randomUUID(); sessionStorage.setItem(key, cid); }
  try {
    const r = await fetch('/api/v1/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname, creationCommandId: cid }) });
    const j = await r.json();
    if (!j.ok) return { ok: false, error: j.error };
    sessionStorage.removeItem(key);
    return { ok: true, roomId: j.data.roomId };
  } catch {
    return { ok: false, error: { code: 'NETWORK', message: 'Could not reach the server. Check your connection and try again.' } };
  }
}

export interface RoomConn {
  snap: Snapshot | null;
  status: ConnStatus;
  fatal: string | null;
  /** server time minus local time, in ms */
  offset: number;
  send(command: ClientCommand): Promise<SendResult>;
}

/** One WebSocket per tab with automatic reconnect. Every command carries an id; retries after a lost ack are safe (server de-duplicates). */
export function useRoom(roomId: string): RoomConn {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [fatal, setFatal] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const waiters = useRef(new Map<string, (r: SendResult) => void>());

  useEffect(() => {
    let closed = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ping: ReturnType<typeof setInterval> | undefined;

    const connect = async () => {
      if (closed) return;
      try { await ensureSession(); } catch { /* retried below */ }
      if (closed) return;
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${location.host}/ws`);
      wsRef.current = ws;
      ws.onopen = () => {
        attempt = 0;
        ws.send(JSON.stringify({ type: 'subscribe', protocolVersion: PROTOCOL_VERSION, roomId }));
        clearInterval(ping);
        ping = setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' })); }, 20_000);
      };
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data as string) as ServerMessage;
        if (m.type === 'snapshot') { setSnap(m.snapshot); setOffset(m.snapshot.serverTime - Date.now()); setStatus('live'); }
        else if (m.type === 'result') {
          const w = waiters.current.get(m.commandId);
          if (w) { waiters.current.delete(m.commandId); w(m.status === 'committed' ? { ok: true } : { ok: false, error: m.error as ErrorInfo }); }
        } else if (m.type === 'fatal') { setFatal(m.message); setStatus('fatal'); closed = true; ws.close(); }
        else if (m.type === 'pong') setOffset(m.serverTime - Date.now());
      };
      ws.onclose = () => {
        clearInterval(ping);
        if (closed) return;
        setStatus('reconnecting');
        const delay = Math.min(8000, 400 * 2 ** attempt++) + Math.random() * 250;
        timer = setTimeout(connect, delay);
      };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => { closed = true; clearTimeout(timer); clearInterval(ping); wsRef.current?.close(); };
  }, [roomId]);

  const send = useCallback((command: ClientCommand) => new Promise<SendResult>((resolve) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return resolve({ ok: false, error: { code: 'OFFLINE', message: 'You are offline — reconnecting. Try again in a moment.' } });
    const id = crypto.randomUUID();
    const timeout = setTimeout(() => { waiters.current.delete(id); resolve({ ok: false, error: { code: 'TIMEOUT', message: 'The server did not answer in time.' } }); }, 10_000);
    waiters.current.set(id, (r) => { clearTimeout(timeout); resolve(r); });
    ws.send(JSON.stringify({ type: 'command', commandId: id, command }));
  }), []);

  return { snap, status, fatal, offset, send };
}
