import type { ReactNode } from 'react';
import { Felt } from '../art';
import { useOrientation } from '../util/orientation';

/**
 * Blurred empty-table backdrop behind the New Game / Connecting cards (research/01 §3 "placeholder-background").
 * Pure decoration: a blurred felt plus a few blurred seat plates / card backs.
 */
export function Backdrop({ children }: { children?: ReactNode }) {
  const o = useOrientation();
  return (
    <div className="sh-backdrop" aria-hidden={children ? undefined : true}>
      <div className={'sh-backdrop-table ' + o}><Felt orientation={o} blur /></div>
      <div className="sh-backdrop-blobs" />
      {children}
    </div>
  );
}

/** the dark rounded card used by New Game / Connecting / Connection failed (`.waiting-container-center-container`) */
export function CenterCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={'sh-center'}><div className={'sh-card ' + className}>{children}</div></div>;
}
