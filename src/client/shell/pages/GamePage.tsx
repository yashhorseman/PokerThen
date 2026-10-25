import { useEffect } from 'react';
import { Canvas } from '../../table/Canvas';
import { TableApp } from '../../table/TableApp';
import { OverlayHost } from '../OverlayHost';
import { Backdrop, CenterCard } from '../Backdrop';
import { TosBar } from '../TosBar';
import { appStore, useApp } from '../../state/store';
import { ui } from '../../state/ui';
import { startConnection, stopConnection } from '../../net/connection';
import { installMockIfRequested } from '../../dev/mock';
import { computeOrientation, useOrientation } from '../../util/orientation';

/** texts of the "Connection failed!" card, research/01 §3 (verbatim) */
const FAIL_TEXT: Record<string, string> = {
  'too-many-connections': 'Your IP reached the max quantity of connections, please try to finish some other browser tabs/windows.',
  'session-missing-token': "Wasn't possible to detect your session. Please check if the cookies are enabled and try again.",
  'too-many-actions': 'You were disconnected because you sent too many actions.',
};
const FAIL_DEFAULT = 'Please check if the cookies are enabled and try again.';

/** /games/:id - connects (or installs the dev mock), then renders the table inside the scaled canvas */
export function GamePage({ gameId }: { gameId: string }) {
  const orientation = useOrientation();
  const layout: 'd' | 'm' = orientation === 'portrait' ? 'm' : 'd';

  useEffect(() => {
    document.title = 'PokerThen - Poker with Friends';
    const l = computeOrientation() === 'portrait' ? 'm' : 'd';
    // fresh start: drop state of a previously opened table
    appStore.setState({ gameId, layout: l, frame: null, prevFrame: null, chat: [], conn: 'idle', failed: null, disposed: false });
    ui.set({ optionsOpen: false, config: null, seatPopover: null, logModal: null, chatSheetOpen: false, chatComposeOpen: false, ignoredRequestIds: [], alerts: [], confirms: [], toasts: [] });
    // dev mock: ?mock=<scenario> feeds frames locally; the real websocket must NOT be opened then
    const mocked = installMockIfRequested();
    if (!mocked) startConnection(gameId, l);
    return () => { if (!mocked) stopConnection(); };
  }, [gameId]);
  // keep the store's layout in sync when the device is rotated (the table agent reads it)
  useEffect(() => { appStore.setState({ layout }); }, [layout]);

  const conn = useApp((s) => s.conn);
  const failed = useApp((s) => s.failed);
  const frame = useApp((s) => s.frame);

  useEffect(() => { if (failed?.code === 'not-found') location.replace('/'); }, [failed]);

  if (conn === 'failed') {
    return (
      <Canvas>
        <Backdrop />
        <CenterCard className="message">
          <b>Connection failed!</b><br />{FAIL_TEXT[failed?.code ?? ''] ?? failed?.msg ?? FAIL_DEFAULT}
        </CenterCard>
        <TosBar />
      </Canvas>
    );
  }
  if (!frame) {
    return (
      <Canvas>
        <Backdrop />
        <CenterCard className="message">Connecting…</CenterCard>
        <TosBar />
      </Canvas>
    );
  }
  return (
    <Canvas>
      <TableApp />
      <OverlayHost />
    </Canvas>
  );
}
