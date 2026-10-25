import { CSSProperties, ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { cardAria, rankLabel, SUIT } from '../format';

/* ───────────── toasts ───────────── */
type ToastItem = { id: number; text: string; kind: 'info' | 'error' | 'good' };
let toasts: ToastItem[] = [];
let toastId = 0;
const toastListeners = new Set<() => void>();
export function toast(text: string, kind: ToastItem['kind'] = 'info') {
  const item = { id: ++toastId, text, kind };
  toasts = [...toasts, item].slice(-4);
  toastListeners.forEach((l) => l());
  setTimeout(() => { toasts = toasts.filter((t) => t.id !== item.id); toastListeners.forEach((l) => l()); }, kind === 'error' ? 6000 : 3500);
}
export function Toasts() {
  const list = useSyncExternalStore((cb) => { toastListeners.add(cb); return () => { toastListeners.delete(cb); }; }, () => toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}
    </div>
  );
}

/* ───────────── modal ───────────── */
export function Modal({ title, onClose, children, wide, footer }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    const first = ref.current?.querySelector<HTMLElement>('input:not([disabled]), select, textarea');
    (first ?? ref.current?.querySelector<HTMLElement>('button'))?.focus();
    return () => { document.removeEventListener('keydown', onKey, true); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head"><h2>{title}</h2><button className="icon-btn" aria-label="Close" onClick={onClose}>✕</button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ───────────── cards ───────────── */
type CardSize = 'sm' | 'md' | 'lg' | 'xl';
interface CardExtra { className?: string; style?: CSSProperties }
export function CardFace({ card, size = 'md', dim, win, hypothetical, className, style }: { card: string; size?: CardSize; dim?: boolean; win?: boolean; hypothetical?: boolean } & CardExtra) {
  return (
    <div className={`card face s-${card[1]} ${size}${dim ? ' dim' : ''}${win ? ' win' : ''}${hypothetical ? ' hypo' : ''}${className ? ' ' + className : ''}`} style={style} role="img" aria-label={cardAria(card)}>
      <span className="rank">{rankLabel(card)}</span>
      <span className="suit" aria-hidden="true">{SUIT[card[1]]}</span>
    </div>
  );
}
export function CardBack({ size = 'md', className, style }: { size?: CardSize } & CardExtra) {
  return <div className={`card back ${size}${className ? ' ' + className : ''}`} style={style} role="img" aria-label="face-down card"><span className="back-mark" aria-hidden="true">♠</span></div>;
}

/* ───────────── avatar ───────────── */
const HUES = [152, 262, 28, 200, 340, 48, 175, 300];
/** `size` is px (number) or any CSS length (string, e.g. "2.2em"). */
export function Avatar({ name, id, size = 28 }: { name: string; id: string; size?: number | string }) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = HUES[h % HUES.length];
  const px = typeof size === 'number';
  return (
    <span className="avatar" style={{ width: size, height: size, background: `hsl(${hue} 45% 38%)`, fontSize: px ? size * 0.46 : '0.95em' }} aria-hidden="true">
      {[...name][0]?.toUpperCase() ?? '?'}
    </span>
  );
}

/* ───────────── hooks ───────────── */
export function useNow(enabled: boolean, every = 200): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [enabled, every]);
  return now;
}

export function useMedia(q: string): boolean {
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener('change', f);
    f();
    return () => mq.removeEventListener('change', f);
  }, [q]);
  return m;
}

export function Switch({ checked, onChange, label, disabled, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; hint?: string }) {
  return (
    <div className={`field${disabled ? ' disabled' : ''}`}>
      <div className="seg" role="radiogroup" aria-label={label}>
        <span className="field-label">{label}</span>
        <div className="seg-btns">
          <button type="button" role="radio" aria-checked={checked} disabled={disabled} className={checked ? 'on' : ''} onClick={() => onChange(true)}>Yes</button>
          <button type="button" role="radio" aria-checked={!checked} disabled={disabled} className={!checked ? 'on' : ''} onClick={() => onChange(false)}>No</button>
        </div>
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export const copyText = async (text: string): Promise<boolean> => {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
};
