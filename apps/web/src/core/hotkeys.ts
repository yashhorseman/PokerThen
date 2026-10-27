import { useEffect, useRef } from "react";
import { modalLock } from "./ui/modalLock";
import { isMobileUA } from "./util";

export interface HotkeyOpts {
  enabled?: boolean;
  /** `+` ignores the modal/global lock (SPEC 6.4) */
  skipGlobalLock?: boolean;
  /** fire even while a text input is focused (Esc) */
  allowInInput?: boolean;
  /** fire while modals are open (Esc closing the modal itself) */
  allowWhenLocked?: boolean;
}
/** return false to let the next (older) handler for the same key run */
export type HotkeyHandler = (e: KeyboardEvent) => boolean | void;

interface Entry {
  key: string;
  handler: HotkeyHandler;
  opts: HotkeyOpts;
}
const stack: Entry[] = [];
let installed = false;

function typingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

export function dispatchKey(e: KeyboardEvent, mobile = isMobileUA()): boolean {
  if (mobile || e.ctrlKey || e.metaKey || e.altKey) return false;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const locked = modalLock.count() > 0;
  const typing = typingTarget(e.target);
  for (let i = stack.length - 1; i >= 0; i--) {
    const en = stack[i]!;
    if (en.key !== key || en.opts.enabled === false) continue;
    if (locked && !en.opts.skipGlobalLock && !en.opts.allowWhenLocked) continue;
    if (typing && !en.opts.allowInInput) continue;
    if (en.handler(e) === false) continue;
    e.preventDefault();
    return true;
  }
  return false;
}

/** Single document keydown listener (ARCH 10.1). */
export function installHotkeys(doc: Document = document): () => void {
  if (installed) return () => undefined;
  installed = true;
  const fn = (e: KeyboardEvent) => void dispatchKey(e);
  doc.addEventListener("keydown", fn);
  return () => {
    doc.removeEventListener("keydown", fn);
    installed = false;
  };
}

export function registerHotkey(key: string, handler: HotkeyHandler, opts: HotkeyOpts = {}): () => void {
  const entry: Entry = { key: key.length === 1 ? key.toLowerCase() : key, handler, opts };
  stack.push(entry);
  return () => {
    const i = stack.indexOf(entry);
    if (i >= 0) stack.splice(i, 1);
  };
}

export function useHotkey(key: string, handler: HotkeyHandler, opts: HotkeyOpts = {}): void {
  const h = useRef(handler);
  h.current = handler;
  const { enabled = true, skipGlobalLock, allowInInput, allowWhenLocked } = opts;
  useEffect(() => {
    if (!key || !enabled) return undefined;
    return registerHotkey(key, (e) => h.current(e), {
      ...(skipGlobalLock !== undefined ? { skipGlobalLock } : {}),
      ...(allowInInput !== undefined ? { allowInInput } : {}),
      ...(allowWhenLocked !== undefined ? { allowWhenLocked } : {})
    });
  }, [key, enabled, skipGlobalLock, allowInInput, allowWhenLocked]);
}
