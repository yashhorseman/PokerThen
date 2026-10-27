import type { DisplayValueStyle, Prefs } from "@pokerthen/shared";
import { usePrefs, useTableActions, useTableVM, useFrame } from "./deps";
import { Choose, Field, Help, YES_NO } from "./widgets";
import { S } from "./strings";

type RIT = "yes" | "no" | "ask";
const ritOf = (v: boolean | null | undefined): RIT => (v === true ? "yes" : v === false ? "no" : "ask");

export function Preferences() {
  const [prefs, api] = usePrefs();
  const vm = useTableVM();
  const frame = useFrame();
  const actions = useTableActions();
  const set = (patch: Partial<Prefs>) => api.set(patch);
  const style: DisplayValueStyle = prefs.displayValueStyle ?? "none";
  const straddleOn = !!frame?.you?.straddling;
  const straddleAllowed = vm.config.straddleAllowed;
  return (
    <div className="config-content pt-prefs">
      <p className="pt-user-id">{`Your User ID: ${vm.youId}`}</p>
      <Field label="Deck Style">
        <Choose value={prefs.deckStyle} options={[["four-color", "Four Colors"], ["two-color", "Two Colors"]]} onChange={(v) => set({ deckStyle: v })} />
      </Field>
      <Field label="Auto Straddle 2 Big Blinds when UTG?" dim={!straddleAllowed}>
        <Choose value={straddleOn} options={YES_NO} disabled={!straddleAllowed} onChange={(v) => actions.setAutoStraddle(v)} />
        {!straddleAllowed ? <Help text="The game owner needs to allow straddle at the game configs." /> : null}
      </Field>
      <Field label="Hide the wins/re-entries count badges?"><Choose value={!!prefs.hideBadges} options={YES_NO} onChange={(v) => set({ hideBadges: v })} /></Field>
      <Field label="Hide players' achievement Badges? (Displayed close to the Player name)"><Choose value={!!prefs.hideAchivementBadges} options={YES_NO} onChange={(v) => set({ hideAchivementBadges: v })} /></Field>
      <Field label="Values Display Style">
        <Choose
          value={style}
          options={[["big-blind", "Big Blinds"], ["formatted", "Formatted"], ["none", "None"]]}
          onChange={(v) => set({ displayValueStyle: v, previousDisplayValueStyle: style, ...(v !== "big-blind" ? { nonBBDisplayValueStyle: v } : {}) })}
        />
        <p className="pt-help-line">The apparence of the values on the game screen.</p>
        <p className="pt-help-line">Tip: you can toggle the Big Blind configuration pressing b key.</p>
      </Field>
      <Field label="Hide Mood Emoji"><Choose value={!!prefs.hideMoodEmojis} options={YES_NO} onChange={(v) => set({ hideMoodEmojis: v })} /></Field>
      <Field label="Disable Secondary Sound Effects? (Fold/Check/Bet/Card)"><Choose value={!!prefs.disableSecondarySounds} options={YES_NO} onChange={(v) => set({ disableSecondarySounds: v })} /></Field>
      <Field label="Disable New Chat Message Beep?"><Choose value={!!prefs.disableChatMessageBeep} options={YES_NO} onChange={(v) => set({ disableChatMessageBeep: v })} /></Field>
      <Field label="Run it Twice?">
        <Choose<RIT> value={ritOf(prefs.defaultRunItTwice)} options={[["yes", "Yes"], ["no", "No"], ["ask", "Ask each Time"]]} onChange={(v) => set({ defaultRunItTwice: v === "yes" ? true : v === "no" ? false : null })} />
      </Field>
      <Field label="Auto activate your extra time?"><Choose value={prefs.autoActivateTimeBank} options={YES_NO} onChange={(v) => set({ autoActivateTimeBank: v })} /></Field>
      <Field label="Hide Hand Review Notification?"><Choose value={!!prefs.notShowHandNotification} options={YES_NO} onChange={(v) => set({ notShowHandNotification: v })} /></Field>
      <Field label="Show Quick Accept player warning?">
        <Choose value={prefs.showQuickAcceptPlayer} options={[[true, "Show"], [false, "Hide"]]} onChange={(v) => set({ showQuickAcceptPlayer: v })} />
      </Field>
    </div>
  );
}
