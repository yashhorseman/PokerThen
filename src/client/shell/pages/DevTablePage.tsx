import { useEffect, useState, type ComponentType } from 'react';
import { Canvas } from '../../table/Canvas';
import { OverlayHost } from '../OverlayHost';

/**
 * /__dev/table - renders the table agent's DevTable (src/client/dev/DevTable.tsx) if it exists.
 * The import is a glob-style dynamic import so the build does not fail while the file is absent.
 * DevTable is wrapped in <Canvas> + <OverlayHost/> unless the module exports `SELF_CONTAINED = true`.
 */
export function DevTablePage() {
  const [state, setState] = useState<{ C: ComponentType; self: boolean } | 'missing' | null>(null);
  useEffect(() => {
    document.title = 'PokerThen - Dev table';
    let live = true;
    (async () => {
      try {
        const name = 'DevTable';
        const mod = await import('../../dev/' + name + '.tsx');
        const C = (mod.DevTable ?? mod.default) as ComponentType | undefined;
        if (!C) throw new Error('no export');
        if (live) setState({ C, self: !!mod.SELF_CONTAINED });
      } catch { if (live) setState('missing'); }
    })();
    return () => { live = false; };
  }, []);
  if (state === null) return <div className="dev-msg">Loading…</div>;
  if (state === 'missing') return <div className="dev-msg">DevTable is not available yet (src/client/dev/DevTable.tsx).</div>;
  const { C, self } = state;
  return self ? <C /> : <Canvas><C /><OverlayHost /></Canvas>;
}
