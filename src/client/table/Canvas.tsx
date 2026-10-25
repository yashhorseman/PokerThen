import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { isIOSDevice, useOrientation } from '../util/orientation';

/**
 * THE scaling model of the whole app (research/03 §1, research/02 §1):
 * one #canvas box (16:9 landscape, 1:1.8 portrait), `html { font-size = 0.032 * canvasHeight }`,
 * everything inside is in rem / %.  Letterboxed and centred in the viewport.
 * Children render INSIDE the canvas (so overlays scale with it).
 */
export function Canvas({ children, expanded = false }: { children: ReactNode; expanded?: boolean }) {
  const orientation = useOrientation();
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const html = document.documentElement;
    html.classList.remove('portrait', 'landscape');
    html.classList.add(orientation);
  }, [orientation]);

  useEffect(() => {
    const el = ref.current!;
    const html = document.documentElement;
    let frozen = false;
    let raf = 0;
    const apply = () => {
      if (frozen) return;
      const h = el.getBoundingClientRect().height;
      if (!h) return;
      const px = 0.032 * h;
      html.style.fontSize = px + 'px';
      html.style.setProperty('--table-design-system-zoom', String(16 / Math.min(px, 26)));
    };
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(apply); };
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    apply();
    // Freeze rem while a text field has focus on mobile (soft keyboard shrinks the viewport) - research/03 §1.3
    const isField = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    const onIn = (e: FocusEvent) => { if (isField(e.target) && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) { frozen = true; if (isIOSDevice()) html.style.height = html.getBoundingClientRect().height + 'px'; } };
    const onOut = () => { frozen = false; html.style.height = ''; window.scrollTo(0, 0); schedule(); };
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    window.addEventListener('orientationchange', schedule);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); document.removeEventListener('focusin', onIn); document.removeEventListener('focusout', onOut); window.removeEventListener('orientationchange', schedule); };
  }, [orientation]);

  return (
    <div id="main-container">
      <div id="canvas" ref={ref} className={expanded && orientation === 'landscape' ? 'expanded' : undefined}>
        {children}
      </div>
    </div>
  );
}
