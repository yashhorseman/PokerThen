import { useEffect, useRef, useState } from "react";
import type { BlindLevel, GameConfig } from "@pokerthen/shared";
import { CONFIG_DEFAULTS } from "@pokerthen/shared";
import { useHotkey, useOrientation, useTableActions, useTableVM } from "./deps";
import { extractFieldErrors, useMenusData } from "./api";
import { showAlert, showConfirm } from "./dialogs";
import {
  addLevel, addPreset, applyPreset, digitsOnly, loadPresets, removeLevel, savePresets, setAntes, toIntOrNull,
  validateConfig, type Preset
} from "./logic";
import { Choose, Field, YES_NO } from "./widgets";
import { S } from "./strings";

const HELP = {
  rabbit: undefined as string | undefined, // `?` popover text UNKNOWN (SPEC 10 row 5)
  spectator: undefined as string | undefined, // U-G4
  rebuy: "When enabled, busted players can immediately request a rebuy with a new stack value. The game owner must approve or reject each request.",
  guest: 'Every player that has been in the table is considered as "guest"',
  record: "When enabled, table chat messages are saved with each hand and may appear in Hand Replayer and shared replays.",
  trim: "When enabled, raises that exceed the maximum allowed bet based on the enemies stacks are trimmed down to the highest valid amount."
};

function NumInput({ value, onChange, disabled, placeholder, maxLength, id, error }: { value: number | null; onChange: (v: number | null) => void; disabled?: boolean; placeholder?: string; maxLength?: number; id?: string; error?: string }) {
  return (
    <input
      id={id}
      className={`pt-num${error ? " invalid" : ""}`}
      type="text"
      inputMode="numeric"
      maxLength={maxLength}
      disabled={disabled}
      placeholder={placeholder}
      value={value == null ? "" : String(value)}
      onChange={(e) => onChange(toIntOrNull(e.target.value))}
    />
  );
}

export function GameSettings() {
  const vm = useTableVM();
  const actions = useTableActions();
  const orientation = useOrientation();
  const owner = vm.owner.isOwner;
  const running = vm.tableStatus === "inProgress";
  const [cfg, setCfg] = useState<GameConfig | null>(null);
  const [original, setOriginal] = useState<GameConfig | null>(null);
  const [queued, setQueued] = useState(false);
  const [loadErr, setLoadErr] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const data = useMenusData();
  const levelsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    data
      .loadConfigs()
      .then((r) => {
        if (!live) return;
        const { queued: q, ...c } = r;
        setCfg(c as GameConfig);
        setOriginal(c as GameConfig);
        setQueued(q);
      })
      .catch(() => live && setLoadErr(true));
    return () => {
      live = false;
    };
  }, [vm.gameId]);

  const multiLevelSaved = (original?.blindLevels.length ?? 1) > 1;
  // U-G6: structure lock only while a hand runs, unpaused, with an existing multi-level structure.
  const structureLocked = owner && running && !vm.owner.paused && multiLevelSaved;

  const set = <K extends keyof GameConfig>(k: K, v: GameConfig[K]) => cfg && setCfg({ ...cfg, [k]: v });

  const addOne = () => {
    if (!cfg || !owner || structureLocked) return;
    setCfg({ ...cfg, blindLevels: addLevel(cfg.blindLevels, cfg.antes) });
    setTimeout(() => {
      const ins = levelsRef.current?.querySelectorAll<HTMLInputElement>("input.pt-duration");
      if (ins && ins.length > 1) ins[ins.length - 2]?.focus();
    }, 0);
  };
  useHotkey("+", addOne, { skipGlobalLock: true, enabled: owner });

  if (loadErr) return <div className="config-content"><p>{S.configFetchError}</p></div>;
  if (!cfg || !original) return <div className="config-content"><p>{S.loadingPlease}</p></div>;
  const ro = !owner;
  const dis = ro || saving;
  const hasLimit = cfg.decisionLimitSec != null;
  const hasBank = hasLimit && cfg.timeBankSec != null;

  const setLevel = (i: number, patch: Partial<BlindLevel>) =>
    setCfg({ ...cfg, blindLevels: cfg.blindLevels.map((l, k) => (k === i ? { ...l, ...patch } : l)) });

  const onSpectator = async (v: boolean) => {
    if (v && !cfg.spectatorMode) {
      set("spectatorMode", true);
      await showAlert(S.spectatorGrant);
    } else if (!v && cfg.spectatorMode && original.spectatorMode && running) {
      if ((await showConfirm({ message: S.spectatorOffConfirm })).ok) set("spectatorMode", false);
    } else set("spectatorMode", v);
  };
  const onLimit = (v: number | null) =>
    setCfg({ ...cfg, decisionLimitSec: v, ...(v == null ? { timeBankSec: null, timeBankFillHands: null } : {}) });
  const onBank = (v: number | null) =>
    setCfg({ ...cfg, timeBankSec: v, ...(v == null ? { timeBankFillHands: null } : { timeBankFillHands: cfg.timeBankFillHands ?? CONFIG_DEFAULTS.timeBankFillHands }) });

  const submit = async () => {
    const local = validateConfig(cfg, running);
    setErrors(local);
    if (Object.keys(local).length) return;
    setSaving(true);
    try {
      const r = await actions.updateGame(cfg);
      setErrors({});
      setOriginal(cfg);
      setQueued(r.queued);
      await showAlert(r.queued || running ? S.gameEnqueued : S.gameUpdated);
    } catch (e) {
      const fe = extractFieldErrors(e);
      if (fe) {
        setErrors(fe);
        await showAlert(S.formErrors);
      } else await showAlert(S.formErrors);
    } finally {
      setSaving(false);
    }
  };

  const presets = presetsOpen ? <PresetsPopover cfg={cfg} onApply={(c) => setCfg(applyPreset(cfg, c, structureLocked, true))} onClose={() => setPresetsOpen(false)} /> : null;

  return (
    <div className="form-1-with-fixed-bottom pt-game-settings">
      <div className="config-content row-fluid">
        {ro ? <div className="pt-readonly-banner">{S.ownerOnlyWarning}</div> : null}
        <div className="col col-2 pt-col-left">
          <h4 className="pt-section-title">Blind Levels</h4>
          <Field label="Antes?">
            <Choose value={cfg.antes} options={YES_NO} disabled={dis || structureLocked} onChange={(v) => setCfg({ ...cfg, antes: v, blindLevels: setAntes(cfg.blindLevels, v) })} />
          </Field>
          <div className={`pt-levels${structureLocked ? " locked" : ""}`} ref={levelsRef}>
            <div className="pt-levels-head">
              <span className="n" />
              <span>SB</span><span>BB</span>
              {cfg.antes ? <span>Ante</span> : null}
              <span>Duration (Min)</span>
              <span className="x" />
            </div>
            {cfg.blindLevels.map((l, i) => {
              const last = i === cfg.blindLevels.length - 1;
              return (
                <div key={i} className="pt-level-row">
                  <span className="n">{i + 1}</span>
                  <NumInput value={l.sb} placeholder="SB" maxLength={6} disabled={dis || structureLocked} error={errors[`sb${i}`]} onChange={(v) => setLevel(i, { sb: v ?? 0 })} />
                  <NumInput value={l.bb} placeholder="BB" maxLength={6} disabled={dis || structureLocked} error={errors[`bb${i}`]} onChange={(v) => setLevel(i, { bb: v ?? 0 })} />
                  {cfg.antes ? <NumInput value={l.ante} placeholder="Ante" maxLength={6} disabled={dis || structureLocked} onChange={(v) => setLevel(i, { ante: v })} /> : null}
                  <input
                    className="pt-num pt-duration"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder={last && l.durationMin == null ? "∞" : "Duration"}
                    disabled={dis || structureLocked || (last && l.durationMin == null && cfg.blindLevels.length === 1)}
                    value={l.durationMin == null ? "" : String(l.durationMin)}
                    onChange={(e) => setLevel(i, { durationMin: toIntOrNull(digitsOnly(e.target.value)) })}
                  />
                  {i > 0 ? (
                    <button type="button" className="pt-x" aria-label="Remove level" disabled={dis || structureLocked} onClick={() => setCfg({ ...cfg, blindLevels: removeLevel(cfg.blindLevels, i) })}>
                      X
                    </button>
                  ) : (
                    <span className="x" />
                  )}
                </div>
              );
            })}
            {structureLocked ? (
              <div className="pt-lock-msg">
                <p>{S.structureLocked}</p>
                <button type="button" className="button-1 green pt-btn" onClick={() => actions.pause()}>{S.pauseNow}</button>
              </div>
            ) : null}
          </div>
          <button type="button" className="button-1 pt-add-level" disabled={dis || structureLocked} onClick={addOne}>
            {S.addLevel}
          </button>
          {cfg.blindLevels.length > 1 && running ? (
            <>
              <Field label={S.countdownMode}>
                <select className="pt-select" value={cfg.countdownMode} disabled={dis} onChange={(e) => set("countdownMode", e.target.value as "s" | "c")}>
                  <option value="s">{S.countdownS}</option>
                  <option value="c">{S.countdownC}</option>
                </select>
              </Field>
              <Field label={S.restartClock} error={errors.blindResetLevel}>
                <select className="pt-select" value={cfg.blindResetLevel ?? ""} disabled={dis} onChange={(e) => set("blindResetLevel", e.target.value === "" ? null : Number(e.target.value))}>
                  <option value="">{S.chooseLevel}</option>
                  {cfg.blindLevels.map((_, i) => (
                    <option key={i} value={i + 1}>{`level ${i + 1}`}</option>
                  ))}
                </select>
              </Field>
            </>
          ) : null}
        </div>
        <div className="col col-4 pt-col-right">
          <Field label="Poker Variant">
            <select className="pt-select" value="th" disabled={dis} onChange={() => undefined}>
              <option value="th">No Limit Texas Hold'em</option>
            </select>
          </Field>
          <Field label="Use cents values?"><Choose value={cfg.centsMode} options={YES_NO} disabled onChange={() => undefined} /></Field>
          <Field label="Allow players to see the undealt cards? (Rabbit Hunting)" help helpText={HELP.rabbit}>
            <Choose value={cfg.rabbitHunt} options={YES_NO} disabled={dis} onChange={(v) => set("rabbitHunt", v)} />
          </Field>
          <Field label="Allow Run it Twice?" help>
            <Choose value={cfg.runItTwice} disabled={dis} onChange={(v) => set("runItTwice", v)} options={[["always", "Always"], ["ask_players", "Ask Players"], ["no", "No"]]} />
          </Field>
          <Field label="Allow UTG Straddle 2BB?"><Choose value={cfg.straddleAllowed} options={YES_NO} disabled={dis} onChange={(v) => set("straddleAllowed", v)} /></Field>
          <Field label="Auto start the next hand?"><Choose value={cfg.autoDeal} options={YES_NO} disabled={dis} onChange={(v) => set("autoDeal", v)} /></Field>
          <Field label="Showdown Presentation Time">
            <Choose value={cfg.showdownTime} disabled={dis} onChange={(v) => set("showdownTime", v)} options={[["fast", "Fast (3s)"], ["normal", "Normal (6s)"], ["slow", "Slow (9s)"]]} />
          </Field>
          <Field label="Deal hands to away players?"><Choose value={cfg.dealToAway} options={YES_NO} disabled={dis} onChange={(v) => set("dealToAway", v)} /></Field>
          <Field label="Decision Time Limit (seconds) (blank to no limit)" error={errors.decisionLimitSec}>
            <NumInput value={cfg.decisionLimitSec} disabled={dis} onChange={onLimit} />
          </Field>
          <Field label="Time Bank Length (seconds) (blank to no time bank)" error={errors.timeBankSec}>
            <NumInput value={cfg.timeBankSec} disabled={dis || !hasLimit} onChange={onBank} />
          </Field>
          <Field label="Number of played hands to fill time bank" error={errors.timeBankFillHands}>
            <NumInput value={cfg.timeBankFillHands} disabled={dis || !hasBank} onChange={(v) => set("timeBankFillHands", v)} />
          </Field>
          <Field label="Reveal all hands when no more action is possible?"><Choose value={cfg.revealAllWhenNoAction} options={YES_NO} disabled={dis} onChange={(v) => set("revealAllWhenNoAction", v)} /></Field>
          <Field label="Spectator Mode" help helpText={HELP.spectator}><Choose value={cfg.spectatorMode} options={YES_NO} disabled={dis} onChange={onSpectator} /></Field>
          <Field label="Allow Rebuy?" help helpText={HELP.rebuy}><Choose value={cfg.allowRebuy} options={YES_NO} disabled={dis} onChange={(v) => set("allowRebuy", v)} /></Field>
          <Field label="Allow guests to send chat messages?" help helpText={HELP.guest}><Choose value={cfg.guestChat} options={YES_NO} disabled={dis} onChange={(v) => set("guestChat", v)} /></Field>
          <Field label="Record table chat for Hand Replayer?" help helpText={HELP.record}><Choose value={cfg.recordChat} options={YES_NO} disabled={dis} onChange={(v) => set("recordChat", v)} /></Field>
          <Field label="Auto trim excess bets?" help helpText={HELP.trim}><Choose value={cfg.autoTrimBets} options={YES_NO} disabled={dis} onChange={(v) => set("autoTrimBets", v)} /></Field>
          {queued ? <div className="pt-queued-banner">{S.queuedBanner}</div> : null}
        </div>
      </div>
      {owner ? (
        <div className="form-fixed-bottom">
          {orientation === "landscape" ? (
            <div className="pt-presets-anchor">
              <button type="button" className="button-1 gray pt-presets-btn" onClick={() => setPresetsOpen((o) => !o)}>{S.customPresets}</button>
              {presets}
            </div>
          ) : (
            <span />
          )}
          <button type="button" className="button-1 green highlighted pt-submit" disabled={saving} onClick={submit}>
            {vm.tableStatus === "waiting" ? S.updateGame : S.updateOnNext}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PresetsPopover({ cfg, onApply, onClose }: { cfg: GameConfig; onApply: (c: GameConfig) => void; onClose: () => void }) {
  const [presets, setPresets] = useState<Preset[]>(() => loadPresets());
  const [name, setName] = useState("");
  const save = () => {
    const r = addPreset(presets, name, cfg);
    if (!r.ok) {
      void showAlert(r.error);
      return;
    }
    setPresets(r.presets);
    savePresets(r.presets);
    setName("");
  };
  const del = (n: string) => {
    const next = presets.filter((p) => p.name !== n);
    setPresets(next);
    savePresets(next);
  };
  return (
    <div className="popover-1 pt-presets-pop">
      <span className="popover-arrow" />
      <button type="button" className="pt-x pt-presets-close" aria-label="Close" onClick={onClose}>X</button>
      <p className="pt-presets-title">{S.saveCurrentSetup}</p>
      <div className="pt-presets-save">
        <input type="text" maxLength={15} placeholder={S.presetName} value={name} onChange={(e) => setName(e.target.value)} />
        <button type="button" className="button-1 green pt-btn" onClick={save}>{S.save}</button>
      </div>
      {presets.length === 0 ? <p className="pt-presets-empty">{S.presetsEmpty}</p> : null}
      {presets.map((p) => (
        <div key={p.name} className="pt-preset-row">
          <span className="pt-preset-name">{p.name}</span>
          <button type="button" className="button-1 pt-btn" onClick={() => onApply(p.config)}>{S.apply}</button>
          <button type="button" className="pt-x" aria-label={`Delete ${p.name}`} onClick={() => del(p.name)}>X</button>
        </div>
      ))}
    </div>
  );
}
