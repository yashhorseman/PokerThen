import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Canvas } from '../../table/Canvas';
import { Backdrop, CenterCard } from '../Backdrop';
import { TosBar } from '../TosBar';
import { navigate } from '../router';
import { Link } from '../Link';
import { asRpcError } from '../lib';

/** /start-game - New Game card over the blurred empty table (research/01 §3) */
export function StartGamePage() {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { document.title = 'PokerThen - New Game - Private Poker with friends'; input.current?.focus(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch('/new-game', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        // fixed defaults of a friends game: stack 1000, blinds 10/20 (research/01 §3)
        body: JSON.stringify({ playerName: name, playerStack: 1000, smallBlind: 10, bigBlind: 20 }),
      });
      if (res.status === 202) { location.reload(); return; } // HTTP_202_RELOAD behaviour of the reference
      if (res.status === 422) {
        const body = await res.json().catch(() => ({}));
        setError(typeof body.playerName === 'string' ? body.playerName : (body.errors?.playerName ?? null));
        setLoading(false); return;
      }
      if (!res.ok) { setLoading(false); return; } // other statuses show nothing
      const body = await res.json() as { gameID: string };
      navigate('/games/' + body.gameID, { replace: true }); // history.replaceState + mount the game, no reload
    } catch (err) {
      void asRpcError(err);
      setLoading(false);
    }
  }

  return (
    <Canvas>
      <Backdrop />
      <CenterCard className="new-game">
        <form onSubmit={submit} noValidate>
          <h1 className="sh-card-title">New Game</h1>
          <p className="sh-card-lead">Play free private online poker with your friends.<br />No download and no registration needed.</p>
          <label htmlFor="sh-nick" className="sh-label">Your Nickname</label>
          <input
            id="sh-nick" ref={input} className={'sh-input' + (error ? ' invalid' : '')} type="text" maxLength={14}
            placeholder="Your Nickname" autoComplete="off" autoCapitalize="off" spellCheck={false}
            value={name} onChange={(e) => setName(e.target.value)}
          />
          {error && <span className="sh-error">{error}</span>}
          <button type="submit" className="sh-btn green highlighted block" disabled={loading}>{loading ? 'Loading...' : 'Create Game'}</button>
          <p className="sh-secondary">New to poker? <Link href="/poker-tutorial" target="_blank">Learn the rules in our free interactive tutorial</Link>.</p>
        </form>
      </CenterCard>
      <TosBar />
    </Canvas>
  );
}
