import { useEffect, useState } from 'react';

export type Orientation = 'portrait' | 'landscape';
const MOBILE_UA = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
export const isMobileDevice = () => MOBILE_UA.test(navigator.userAgent);
export const isIOSDevice = () => /iPad|iPhone|iPod/i.test(navigator.userAgent);

/** Reference rule: mobile UA -> screen.orientation; otherwise matchMedia(orientation: portrait). iPad portrait therefore gets the phone layout. */
export function computeOrientation(): Orientation {
  if (isMobileDevice()) {
    const t = screen.orientation?.type;
    if (t) return t.startsWith('portrait') ? 'portrait' : 'landscape';
    const w = (window as unknown as { orientation?: number }).orientation;
    if (typeof w === 'number') return Math.abs(w) === 90 ? 'landscape' : 'portrait';
  }
  return window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape';
}

export function useOrientation(): Orientation {
  const [o, setO] = useState<Orientation>(computeOrientation);
  useEffect(() => {
    const f = () => setO(computeOrientation());
    window.addEventListener('resize', f, true);
    window.addEventListener('orientationchange', f, true);
    return () => { window.removeEventListener('resize', f, true); window.removeEventListener('orientationchange', f, true); };
  }, []);
  return o;
}
