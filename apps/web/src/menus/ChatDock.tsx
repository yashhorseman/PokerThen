import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ChatMessage } from "@pokerthen/shared";
import { CHAT_MAX, PLACEHOLDERS } from "@pokerthen/shared";
import { Icon, useChatVM, useHotkey, useOrientation, useTableActions, useTableVM } from "./deps";
import { FUNCS, S } from "./strings";
import { setMenuState, useMenuState } from "./store";

const DRAFT_KEY = "bkp-chatMessage";
const readDraft = () => {
  try {
    return localStorage.getItem(DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
};
const writeDraft = (v: string) => {
  try {
    if (v) localStorage.setItem(DRAFT_KEY, v);
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
};
export const hhmm = (at: number) => new Date(at).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
/** auto-message balloon lifetime (SPEC 17.2) */
export const balloonMs = (text: string) => 2300 + 300 * text.trim().split(/\s+/).filter(Boolean).length;

function Compose({ onDone, autoFocus }: { onDone: () => void; autoFocus?: boolean }) {
  const actions = useTableActions();
  const chat = useChatVM();
  const [text, setText] = useState(readDraft);
  const [err, setErr] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  const disabled = !chat.youCanChat;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || disabled) return;
    try {
      await actions.sendChat(t.slice(0, CHAT_MAX));
      setText("");
      writeDraft("");
      setErr(false);
      ref.current?.blur();
      onDone();
    } catch {
      setErr(true);
    }
  };
  return (
    <form className="chat-new-message-form" onSubmit={submit}>
      <input
        ref={ref}
        type="text"
        required
        maxLength={CHAT_MAX}
        disabled={disabled}
        title={disabled ? PLACEHOLDERS.CHAT_DISABLED_TOOLTIP : undefined} // U-C3
        placeholder={S.messagePlaceholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          writeDraft(e.target.value);
        }}
        onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), onDone())}
      />
      {chat.recording ? <RecordingDot /> : null}
      {err ? <div className="error-message">{S.chatError}</div> : null}
    </form>
  );
}

function RecordingDot() {
  const [tip, setTip] = useState(false);
  return (
    <span className="pt-rec-wrap">
      <button type="button" className="chat-recording-dot" aria-label={S.recordingAria} onClick={() => setTip((t) => !t)} />
      {tip ? <span className="pt-rec-tip popover-1">{S.recording}</span> : null}
    </span>
  );
}

function MessageRow({ m, mine, highlight, onMute, canMute }: { m: ChatMessage; mine: boolean; highlight: boolean; onMute: () => void; canMute: boolean }) {
  return (
    <div className={`chat-message-container${highlight ? " highlight" : ""}${mine ? " mine" : ""}${m.playerID ? "" : " system"}`}>
      <div className="pt-chat-author">{m.playerName}</div>
      <div className="pt-chat-balloon">{m.message}</div>
      <div className="pt-chat-time">
        <Icon name="clock" />
        {hhmm(m.at)}
      </div>
      {canMute ? (
        <button type="button" className="pt-chat-mute" onClick={onMute}>{S.mute}</button>
      ) : null}
    </div>
  );
}

function MutedButton() {
  const chat = useChatVM();
  const actions = useTableActions();
  const [open, setOpen] = useState(false);
  if (!chat.mutedIds.length && !open) return null;
  return (
    <span className="pt-muted-wrap">
      <button type="button" className="blocked-chat-button" onClick={() => setOpen((o) => !o)}>{FUNCS.mutedN(chat.mutedIds.length)}</button>
      {open ? (
        <div className="popover-1 pt-muted-pop">
          {chat.mutedIds.length === 0 ? <p>{S.noMuted}</p> : null}
          {chat.mutedIds.map((id) => (
            <div key={id} className="pt-muted-row">
              <span>{chat.names[id] ?? id}</span>
              <button type="button" className="button-1 pt-btn" onClick={() => actions.toggleMute(id)}>{S.unmute}</button>
            </div>
          ))}
        </div>
      ) : null}
    </span>
  );
}

/** newly arrived foreign messages (for 800 ms highlight) */
function useFresh(messages: ChatMessage[], youId: string): number {
  const prev = useRef(messages.length);
  const [fresh, setFresh] = useState(0);
  useEffect(() => {
    const added = messages.length - prev.current;
    prev.current = messages.length;
    if (added > 0 && messages[messages.length - 1]?.playerID !== youId) {
      setFresh(added);
      const t = setTimeout(() => setFresh(0), 800);
      return () => clearTimeout(t);
    }
  }, [messages.length, youId, messages]);
  return fresh;
}

function Messages({ expanded }: { expanded: boolean }) {
  const chat = useChatVM();
  const vm = useTableVM();
  const actions = useTableActions();
  const listRef = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => chat.messages.filter((m) => !m.playerID || !chat.mutedIds.includes(m.playerID)), [chat.messages, chat.mutedIds]);
  const fresh = useFresh(shown, vm.youId);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown.length, expanded]);
  if (shown.length === 0)
    return (
      <div className="chat-messages-container pt-chat-empty">
        <p>{S.quiet}</p>
        {vm.orientation === "landscape" ? <p>{S.clickBalloon}</p> : null}
      </div>
    );
  return (
    <div className="chat-messages-container" ref={listRef}>
      {shown.map((m, i) => (
        <MessageRow
          key={`${m.at}-${i}`}
          m={m}
          mine={m.playerID === vm.youId}
          highlight={fresh > 0 && i >= shown.length - fresh}
          canMute={!!m.playerID && m.playerID !== vm.youId}
          onMute={() => m.playerID && actions.toggleMute(m.playerID)}
        />
      ))}
    </div>
  );
}

function DesktopChat() {
  const chat = useChatVM();
  const st = useMenuState();
  const [expanded, setExpanded] = useState(false);
  useHotkey("m", () => setMenuState({ composeOpen: true }), {});
  useEffect(() => {
    if (!st.composeOpen) return;
    const onDown = (e: Event) => {
      if (!(e.target as Element).closest?.(".pt-compose-pop, .pt-new-message")) setMenuState({ composeOpen: false });
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [st.composeOpen]);
  return (
    <div className={`chat-container${expanded ? " expanded" : ""}`}>
      <button type="button" className="pt-chat-expand" aria-label={expanded ? "Collapse" : "Expand"} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <span className={`pt-chevron${expanded ? " down" : ""}`} />
      </button>
      {chat.unread > 0 && !expanded ? <div className="new-messages-chat">{S.newMessages}</div> : null}
      <Messages expanded={expanded} />
      <div className="pt-chat-side">
        <MutedButton />
        <button type="button" className="pt-new-message" aria-label={S.newMessage} onClick={() => setMenuState({ composeOpen: !st.composeOpen })}>
          <Icon name="chat" />
          <span className="pt-hotkey-badge">M</span>
        </button>
      </div>
      {st.composeOpen ? (
        <div className="popover-1 pt-compose-pop">
          <Compose autoFocus onDone={() => setMenuState({ composeOpen: false })} />
        </div>
      ) : null}
    </div>
  );
}

function PhoneChat({ children }: { children?: ReactNode }) {
  const chat = useChatVM();
  const st = useMenuState();
  const [flash, setFlash] = useState(false);
  const [balloon, setBalloon] = useState<string | null>(null);
  const seen = useRef(chat.messages.length);
  const open = st.chatOpen;
  useEffect(() => {
    const added = chat.messages.slice(seen.current);
    seen.current = chat.messages.length;
    if (!added.length) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 800);
    const auto = [...added].reverse().find((m) => m.autoMessage || !m.playerID);
    let b: ReturnType<typeof setTimeout> | undefined;
    if (auto && !open) {
      setBalloon(auto.message);
      b = setTimeout(() => setBalloon(null), balloonMs(auto.message));
    }
    return () => {
      clearTimeout(t);
      if (b) clearTimeout(b);
    };
  }, [chat.messages.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuState({ chatOpen: false });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const close = () => setMenuState({ chatOpen: false });
  return (
    <>
      <div className="aux-chat-bottom-buttons-ctn">
        {balloon && !open ? <div className="pt-auto-balloon">{balloon}</div> : null}
        <button type="button" className={`pt-chat-button chat-button${flash ? " flash" : ""}`} onClick={() => setMenuState({ chatOpen: true })}>
          {FUNCS.chatN(chat.unread)}
        </button>
        {children}
      </div>
      {open ? (
        <div className="chat">
          <div className="overflow-black" onClick={close} />
          <div className="chat-container">
            <MutedButton />
            <Messages expanded />
            <Compose onDone={close} />
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * Desktop: chat box; phone: `Chat (N)` button + bottom sheet. On phone pass `<LogButton />` as children so both sit
 * in the 2-row `.aux-chat-bottom-buttons-ctn` stack; on desktop children render after the box.
 */
export function ChatDock({ children }: { children?: ReactNode }) {
  const orientation = useOrientation();
  if (orientation === "portrait") return <PhoneChat>{children}</PhoneChat>;
  return (
    <>
      <DesktopChat />
      {children}
    </>
  );
}
