import { FormEvent, useState } from 'react';
import { validateNickname } from '@pokerthen/protocol';
import { createTable } from '../net';
import { Modal } from './ui';
import { HelpBody } from './Panels';

export function Landing({ onCreated }: { onCreated: (roomId: string) => void }) {
  const [nick, setNick] = useState(() => localStorage.getItem('pt_nick') ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const v = validateNickname(nick);
    if (!v.ok) return setErr(v.message);
    setErr(null); setBusy(true);
    const r = await createTable(v.value);
    setBusy(false);
    if (!r.ok) return setErr(r.error.fieldErrors?.nickname ?? r.error.message);
    localStorage.setItem('pt_nick', v.value);
    onCreated(r.roomId);
  };

  return (
    <main className="landing">
      <div className="landing-bg" aria-hidden="true"><div className="landing-felt" /></div>
      <form className="panel create" onSubmit={submit} noValidate>
        <h1><span className="logo-mark" aria-hidden="true">♠</span> PokerThen</h1>
        <p className="lede">Private poker tables for friends. Create a table, send the invite link, and play — no downloads, no accounts.</p>
        <label htmlFor="nick">Your nickname</label>
        <input id="nick" value={nick} onChange={(e) => setNick(e.target.value)} maxLength={30} placeholder="e.g. Yash" autoComplete="nickname" aria-invalid={!!err} aria-describedby={err ? 'nick-err' : undefined} autoFocus />
        {err && <p id="nick-err" className="field-error" role="alert">{err}</p>}
        <button className="btn primary big" disabled={busy}>{busy ? 'Creating…' : 'Create private table'}</button>
        <ul className="points">
          <li><b>Fair by design.</b> The server shuffles with a cryptographic RNG and publishes a commitment to the deck before dealing. Your browser verifies every hand.</li>
          <li><b>Invite-only.</b> Only people with your link can request a seat, and you approve each one.</li>
          <li><b>Play money.</b> Fictional chips only — nothing to win or lose.</li>
        </ul>
        <button type="button" className="link-btn" onClick={() => setHelp(true)}>Rules &amp; how fairness works</button>
      </form>
      {help && <Modal title="Rules & fairness" onClose={() => setHelp(false)} wide><HelpBody /></Modal>}
    </main>
  );
}
