import { useMemo, useState } from 'react';
import type { Config } from '@pokerthen/engine';
import { UNAVAILABLE_SETTINGS, type ClientCommand, type Snapshot } from '@pokerthen/protocol';
import type { SendResult } from '../net';
import { usePrefs } from '../prefs';
import { Modal, Switch, toast } from './ui';

type Send = (c: ClientCommand) => Promise<SendResult>;
type Tab = 'players' | 'game' | 'prefs';

export function Settings({ snap, send, onClose, initialTab }: { snap: Snapshot; send: Send; onClose(): void; initialTab?: Tab }) {
  const isOwner = snap.viewer.role === 'owner';
  const [tab, setTab] = useState<Tab>(initialTab ?? (isOwner ? 'players' : 'game'));
  const pendingReqs = snap.requests.length;
  return (
    <Modal title="Table options" onClose={onClose} wide>
      <div className="tabs big" role="tablist">
        <button role="tab" aria-selected={tab === 'players'} className={tab === 'players' ? 'on' : ''} onClick={() => setTab('players')}>Players{pendingReqs ? <span className="badge">{pendingReqs}</span> : null}</button>
        <button role="tab" aria-selected={tab === 'game'} className={tab === 'game' ? 'on' : ''} onClick={() => setTab('game')}>Game</button>
        <button role="tab" aria-selected={tab === 'prefs'} className={tab === 'prefs' ? 'on' : ''} onClick={() => setTab('prefs')}>Preferences</button>
        <button className="tab-back" onClick={onClose}>Back to table</button>
      </div>
      {tab === 'players' && <PlayersTab snap={snap} send={send} />}
      {tab === 'game' && <GameTab snap={snap} send={send} />}
      {tab === 'prefs' && <PrefsTab snap={snap} send={send} />}
    </Modal>
  );
}

/* ───────────── players ───────────── */

function PlayersTab({ snap, send }: { snap: Snapshot; send: Send }) {
  const isOwner = snap.viewer.role === 'owner';
  const [adjust, setAdjust] = useState<string | null>(null);
  const run = async (c: ClientCommand, ok?: string) => {
    const r = await send(c);
    if (!r.ok) toast(r.error.message, 'error');
    else if (ok) toast(ok, 'good');
    return r.ok;
  };
  return (
    <div>
      {isOwner && snap.requests.length > 0 && (
        <section>
          <h3>Requests</h3>
          {snap.requests.map((r) => <RequestRow key={r.id} r={r} run={run} />)}
        </section>
      )}
      {snap.pending.filter((p) => p.kind === 'adjust' || p.kind === 'topup').length > 0 && (
        <section><h3>Pending next hand</h3>{snap.pending.filter((p) => p.kind === 'adjust' || p.kind === 'topup').map((p) => <p key={p.id} className="pending-line">⏳ {p.text}</p>)}</section>
      )}
      <section>
        <h3>People at the table</h3>
        {snap.members.map((m) => {
          const seat = m.seat !== null ? snap.seats[m.seat] : null;
          const status = [
            m.role === 'owner' ? 'Host' : null, seat ? `Seat ${m.seat! + 1}` : m.role === 'pending' ? 'Waiting for approval' : 'Watching',
            seat?.participation === 'SITTING_OUT' ? 'Away' : null, seat?.waitingForNextHand ? 'Waiting for next hand' : null, seat?.leaving ? 'Leaving after hand' : null, !m.connected ? 'Offline' : null,
          ].filter(Boolean).join(' · ');
          return (
            <div key={m.id} className="prow">
              <div className="grow"><b>{m.nickname}</b> <span className="mono dim">{m.short}</span><div className="hint">{status}</div></div>
              {seat && <div className="stk-pill">{seat.stack}</div>}
              {isOwner && seat && <button className="btn sm" onClick={() => setAdjust(adjust === m.id ? null : m.id)}>Stack…</button>}
              {isOwner && m.id !== snap.room.ownerId && (
                <>
                  <button className="btn sm" onClick={() => { if (confirm(`Make ${m.nickname} the host? You will lose host controls.`)) void run({ kind: 'admin.transferOwnership', memberId: m.id }, 'Ownership transferred.'); }}>Make host</button>
                  <button className="btn sm danger" onClick={() => { if (confirm(`Remove ${m.nickname} from the table? ${seat ? 'They fold and cash out after the current hand.' : ''}`)) void run({ kind: 'admin.removePlayer', memberId: m.id }, 'Removed.'); }}>Remove</button>
                </>
              )}
              {adjust === m.id && seat && <AdjustForm nick={m.nickname} current={seat.stack ?? 0} inHand={!!seat.inHand && snap.hand?.phase !== 'COMPLETE'} onDone={() => setAdjust(null)} run={run} memberId={m.id} />}
            </div>
          );
        })}
        {snap.members.length === 0 && <p className="hint">Nobody has joined yet.</p>}
      </section>
      {isOwner && (
        <section>
          <h3>Danger zone</h3>
          <button className="btn danger" onClick={() => { if (confirm('Close this table? Everyone cashes out after the current hand and the table becomes read-only.')) void run({ kind: 'admin.closeRoom' }); }}>End session…</button>
        </section>
      )}
    </div>
  );
}

function RequestRow({ r, run }: { r: Snapshot['requests'][number]; run(c: ClientCommand, ok?: string): Promise<boolean> }) {
  const [stack, setStack] = useState(String(r.amount));
  return (
    <div className="prow">
      <div className="grow"><b>{r.nickname}</b> <span className="mono dim">{r.memberId.slice(0, 5)}</span>
        <div className="hint">{r.kind === 'seat' ? `Wants seat ${r.seat! + 1}${r.sitOut ? ' (sitting out)' : ''}` : 'Wants to add chips'} · asked for {r.amount}</div></div>
      <input className="narrow" aria-label={`Approved chips for ${r.nickname}`} inputMode="numeric" value={stack} onChange={(e) => setStack(e.target.value.replace(/[^\d]/g, ''))} />
      <button className="btn sm good" onClick={() => void run({ kind: 'request.decide', requestId: r.id, approve: true, stack: Math.floor(Number(stack)) || r.amount }, 'Approved.')}>Approve</button>
      <button className="btn sm" onClick={() => void run({ kind: 'request.decide', requestId: r.id, approve: false })}>Decline</button>
    </div>
  );
}

function AdjustForm({ nick, current, inHand, onDone, run, memberId }: { nick: string; current: number; inHand: boolean; onDone(): void; run(c: ClientCommand, ok?: string): Promise<boolean>; memberId: string }) {
  const [mode, setMode] = useState<'ADD' | 'REMOVE' | 'SET'>('ADD');
  const [amt, setAmt] = useState('');
  const [reason, setReason] = useState('');
  const n = Math.floor(Number(amt));
  const valid = Number.isSafeInteger(n) && n >= 0 && (mode === 'SET' || n > 0) && reason.trim().length > 0 && !(mode === 'REMOVE' && n > current);
  const result = mode === 'ADD' ? current + n : mode === 'REMOVE' ? current - n : n;
  return (
    <div className="adjust">
      <div className="seg-btns">
        {(['ADD', 'REMOVE', 'SET'] as const).map((m) => <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{m === 'ADD' ? 'Add' : m === 'REMOVE' ? 'Remove' : 'Set to'}</button>)}
      </div>
      <input aria-label="Amount" inputMode="numeric" placeholder="Amount" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d]/g, ''))} />
      <input aria-label="Reason" placeholder="Reason (required)" value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} />
      <p className="hint">{nick}: {current} → <b>{Number.isFinite(result) && amt ? result : '…'}</b>{inHand ? ' · applies after the current hand' : ''}</p>
      <button className="btn sm primary" disabled={!valid} onClick={async () => { if (await run({ kind: 'admin.adjust', memberId, mode, amount: n, reason: reason.trim() }, inHand ? 'Queued for the next hand.' : 'Stack updated.')) onDone(); }}>Apply</button>
    </div>
  );
}

/* ───────────── game ───────────── */

function GameTab({ snap, send }: { snap: Snapshot; send: Send }) {
  const isOwner = snap.viewer.role === 'owner';
  const base = useMemo<Config>(() => ({ ...snap.room.config, ...(snap.room.pendingConfig ?? {}) }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [d, setD] = useState<Config>(base);
  const [version] = useState(snap.room.configVersion);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(d) !== JSON.stringify(base);
  const set = <K extends keyof Config>(k: K, v: Config[K]) => setD((x) => ({ ...x, [k]: v }));
  const num = (k: 'sb' | 'bb' | 'ante' | 'bankSeconds' | 'bankRefillHands', label: string, hint?: string) => (
    <div className="field">
      <label htmlFor={'cfg-' + k}>{label}</label>
      <input id={'cfg-' + k} inputMode="numeric" disabled={!isOwner} value={String(d[k])} aria-invalid={!!errs[k]} onChange={(e) => set(k, (e.target.value === '' ? 0 : Math.floor(Number(e.target.value.replace(/[^\d]/g, '')))) as never)} />
      {errs[k] && <p className="field-error" role="alert">{errs[k]}</p>}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
  const save = async () => {
    const patch: Partial<Config> = {};
    for (const k of Object.keys(d) as Array<keyof Config>) if (JSON.stringify(d[k]) !== JSON.stringify(base[k])) (patch as Record<string, unknown>)[k] = d[k];
    const r = await send({ kind: 'admin.config', expectedVersion: version, patch });
    if (!r.ok) { setErrs(r.error.fieldErrors ?? {}); toast(r.error.message, 'error'); return; }
    setErrs({});
    toast(snap.hand && snap.hand.phase !== 'COMPLETE' ? 'Saved — applies at the start of the next hand.' : 'Saved.', 'good');
  };
  const run = async (c: ClientCommand) => { const r = await send(c); if (!r.ok) toast(r.error.message, 'error'); };
  const idle = !snap.hand || snap.hand.phase === 'COMPLETE';
  const unlimited = d.actionSeconds === null;

  return (
    <div>
      {!isOwner && <p className="hint">Only the host can change these. You’re viewing the current rules.</p>}
      {snap.room.pendingConfig && <p className="pending-line">⏳ Rule changes are queued for the next hand.{isOwner && <> <button className="btn sm" onClick={() => void run({ kind: 'admin.cancelPending', what: 'config' })}>Cancel queued changes</button></>}</p>}

      {isOwner && (
        <section>
          <h3>Game control</h3>
          <div className="btnrow">
            {snap.room.gameStatus === 'STOPPED' && snap.room.status === 'OPEN' && <button className="btn primary" onClick={() => void run({ kind: 'admin.start' })}>Start game</button>}
            {snap.room.gameStatus === 'RUNNING' && !snap.room.paused && <button className="btn" onClick={() => void run({ kind: 'admin.pause', value: true })}>Pause now</button>}
            {snap.room.paused && <button className="btn primary" onClick={() => void run({ kind: 'admin.pause', value: false })}>Resume</button>}
            {snap.room.gameStatus === 'RUNNING' && !snap.room.stopAfterHand && <button className="btn" onClick={() => { if (confirm('Stop after this hand? Seats can then be rearranged. Starting again picks a random dealer and resets the button order.')) void run({ kind: 'admin.stopAfterHand', value: true }); }}>Stop after this hand</button>}
            {snap.room.stopAfterHand && <button className="btn" onClick={() => void run({ kind: 'admin.stopAfterHand', value: false })}>Cancel scheduled stop</button>}
            {snap.room.gameStatus === 'RUNNING' && idle && !snap.room.nextHandAt && <button className="btn" onClick={() => void run({ kind: 'admin.nextHand' })}>Deal next hand</button>}
          </div>
          <p className="hint">Pause freezes the clock immediately and resumes with the same time left. “Stop after this hand” is different: it lets the hand finish, then halts dealing so you can move people around.</p>
        </section>
      )}

      <section>
        <h3>Blinds</h3>
        <div className="grid3">{num('sb', 'Small blind')}{num('bb', 'Big blind')}{num('ante', 'Ante (per player)', '0 = off')}</div>
        <p className="hint">Changes apply at the start of the next hand. Blind levels and a tournament clock are planned for later.</p>
      </section>

      <section>
        <h3>Clock</h3>
        <div className="field">
          <label htmlFor="cfg-act">Decision time (seconds)</label>
          <div className="inline">
            <input id="cfg-act" inputMode="numeric" disabled={!isOwner || unlimited} value={unlimited ? '' : String(d.actionSeconds)} placeholder="Unlimited" aria-invalid={!!errs.actionSeconds}
              onChange={(e) => set('actionSeconds', Math.floor(Number(e.target.value.replace(/[^\d]/g, ''))) || 1)} />
            <label className="chk"><input type="checkbox" disabled={!isOwner} checked={unlimited} onChange={(e) => { set('actionSeconds', e.target.checked ? null : 20); if (e.target.checked) set('bankSeconds', 0); }} /> Unlimited</label>
          </div>
          {errs.actionSeconds && <p className="field-error" role="alert">{errs.actionSeconds}</p>}
        </div>
        <div className="grid2">
          {num('bankSeconds', 'Time bank (seconds)', unlimited ? 'Needs a decision limit.' : '0 = no time bank')}
          {num('bankRefillHands', 'Refill after hands played')}
        </div>
      </section>

      <section>
        <h3>Dealing &amp; showdown</h3>
        <Switch label="Automatically start the next hand" checked={d.autoStartNext} disabled={!isOwner} onChange={(v) => set('autoStartNext', v)} />
        <div className="field">
          <span className="field-label">Showdown display</span>
          <div className="seg-btns">{([3000, 6000, 9000] as const).map((ms) => <button key={ms} disabled={!isOwner} className={d.showdownMs === ms ? 'on' : ''} onClick={() => set('showdownMs', ms)}>{ms === 3000 ? 'Fast 3s' : ms === 6000 ? 'Normal 6s' : 'Slow 9s'}</button>)}</div>
        </div>
        <Switch label="Reveal hands when no more betting is possible" checked={d.revealWhenNoAction} disabled={!isOwner} onChange={(v) => set('revealWhenNoAction', v)} />
        <Switch label="Rabbit hunting" checked={d.rabbit} disabled={!isOwner} onChange={(v) => set('rabbit', v)} hint="After a hand ends early, seated players can privately reveal the cards that would have come. It never changes the result." />
        <div className="field">
          <span className="field-label">Run it twice</span>
          <div className="seg-btns">{(['off', 'ask', 'always'] as const).map((m) => <button key={m} disabled={!isOwner} className={d.runTwice === m ? 'on' : ''} onClick={() => set('runTwice', m)}>{m === 'off' ? 'No' : m === 'ask' ? 'Ask players' : 'Always'}</button>)}</div>
          <p className="hint">Applies when all remaining players are all-in before the river. “Ask” needs every player still in the hand to agree.</p>
        </div>
        <Switch label="Guests can chat" checked={d.guestChat} disabled={!isOwner} onChange={(v) => set('guestChat', v)} />
      </section>

      <section>
        <h3>Not available yet</h3>
        <ul className="unavail">{UNAVAILABLE_SETTINGS.map((u) => <li key={u.key}><span className="off-pill" aria-hidden="true">Off</span> <b>{u.label}</b> — {u.why}</li>)}</ul>
      </section>

      {isOwner && (
        <div className="sticky-save">
          <button className="btn primary" disabled={!dirty} onClick={save}>{dirty ? 'Save changes' : 'No changes'}</button>
          {dirty && <button className="btn" onClick={() => { setD(base); setErrs({}); }}>Discard</button>}
        </div>
      )}
    </div>
  );
}

/* ───────────── preferences ───────────── */

function PrefsTab({ snap, send }: { snap: Snapshot; send: Send }) {
  const [p, setP] = usePrefs();
  const member = snap.viewer.role !== 'viewer';
  return (
    <div>
      <section>
        <h3>On this device</h3>
        <div className="field"><span className="field-label">Card colours</span><div className="seg-btns"><button className={p.deck === 'two' ? 'on' : ''} onClick={() => setP({ deck: 'two' })}>Two-colour</button><button className={p.deck === 'four' ? 'on' : ''} onClick={() => setP({ deck: 'four' })}>Four-colour</button></div></div>
        <div className="field"><span className="field-label">Show amounts as <span className="hint">(shortcut: B)</span></span><div className="seg-btns"><button className={p.amounts === 'chips' ? 'on' : ''} onClick={() => setP({ amounts: 'chips' })}>Chips</button><button className={p.amounts === 'bb' ? 'on' : ''} onClick={() => setP({ amounts: 'bb' })}>Big blinds</button></div></div>
        <div className="field"><span className="field-label">Sound volume</span><div className="seg-btns">{([0, 15, 45, 100] as const).map((v) => <button key={v} className={p.volume === v ? 'on' : ''} onClick={() => setP({ volume: v })}>{v === 0 ? 'Mute' : v === 15 ? 'Low' : v === 45 ? 'Medium' : 'High'}</button>)}</div></div>
        <div className="field"><span className="field-label">Table felt</span><div className="seg-btns">{(['green', 'purple', 'blue', 'burgundy'] as const).map((v) => <button key={v} className={p.felt === v ? 'on' : ''} onClick={() => setP({ felt: v })}>{v[0].toUpperCase() + v.slice(1)}</button>)}</div></div>
        <div className="field"><span className="field-label">Seat layout on desktop</span><div className="seg-btns"><button className={p.rotate === 'fixed' ? 'on' : ''} onClick={() => setP({ rotate: 'fixed' })}>Fixed seat numbers</button><button className={p.rotate === 'hero' ? 'on' : ''} onClick={() => setP({ rotate: 'hero' })}>Rotate so I’m at the bottom</button></div><p className="hint">Phones always put you at the bottom.</p></div>
        <Switch label="Action shortcuts (C call/check · R raise · F fold · T time bank)" checked={p.shortcuts} onChange={(v) => setP({ shortcuts: v })} hint="Keys act instantly with no confirmation — a mis-press can fold your hand. Off by default." />
        <Switch label="Beep on new chat messages" checked={p.chatBeep} onChange={(v) => setP({ chatBeep: v })} />
        <div className="field"><span className="field-label">Reduce motion</span><div className="seg-btns">{(['system', 'on', 'off'] as const).map((v) => <button key={v} className={p.reducedMotion === v ? 'on' : ''} onClick={() => setP({ reducedMotion: v })}>{v === 'system' ? 'Follow system' : v === 'on' ? 'On' : 'Off'}</button>)}</div></div>
      </section>
      <section>
        <h3>My table settings</h3>
        <div className="field">
          <span className="field-label">If everyone is all-in, run it twice?</span>
          <div className="seg-btns">{(['yes', 'no', 'ask'] as const).map((v) => <button key={v} disabled={!member} className={snap.viewer.ritPref === v ? 'on' : ''} onClick={() => void send({ kind: 'prefs.set', ritPref: v })}>{v === 'yes' ? 'Yes' : v === 'no' ? 'No' : 'Ask me'}</button>)}</div>
          <p className="hint">Only used when the host sets “Run it twice” to “Ask players”.{!member ? ' Request a seat to set this.' : ''}</p>
        </div>
        <Switch label="Use my time bank automatically" checked={snap.viewer.autoBank} disabled={!member} onChange={(v) => void send({ kind: 'prefs.set', autoBank: v })} />
      </section>
      <section>
        <h3>Keyboard shortcuts</h3>
        <p className="hint">B — chips / big blinds · M — focus chat · L — open the log · P — pause or resume (host). They are off while typing or when a dialog is open. Action keys (C / R / F / T) only work if you turn on “Action shortcuts” above.</p>
      </section>
    </div>
  );
}
