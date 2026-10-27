import type { ReactNode } from "react";
export function Button1(p: { className?: string; children?: ReactNode; onClick?: () => void; badge?: string; hotkey?: string; throttleMs?: number; color?: string }) {
  return <button type="button" className={`button-1 with-tip ${p.className ?? ""}`} onClick={p.onClick}>{p.children}{p.badge ? <span className="tip">{p.badge}</span> : null}</button>;
}
export const showAlert = (m: string) => { (window as unknown as { __calls: string[] }).__calls.push(`alert:${m}`); };
export const showConfirm = async (o: { message: string }) => { (window as unknown as { __calls: string[] }).__calls.push(`confirm:${o.message}`); return true; };
export function useModalLock() {}
