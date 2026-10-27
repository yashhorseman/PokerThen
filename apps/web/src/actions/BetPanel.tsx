import { useEffect, useMemo, useRef, useState } from "react";
import type { BetPanelVM } from "@pokerthen/shared";
import { PRESET_KEYS, PRESET_LABELS, clamp, convertedTag, inputModeFor, presetValue, sanitizeInput, stepBet, textToValue, valueToText } from "./betMath";

export interface BetPanelProps {
  panel: BetPanelVM;
  centsMode: boolean;
  /** autofocus + select on open (desktop only; phone keeps the keyboard closed) */
  autoFocus: boolean;
  timeBankHigh?: boolean;
  onSubmit(value: number): void;
  onBack(): void;
}

/** `.raise-controller-form` (SPEC 6.3). Desktop 40x4.7rem; phone = scaled transforms in actions.css. */
export function BetPanel({ panel, centsMode, autoFocus, onSubmit, onBack }: BetPanelProps) {
  const mode = inputModeFor({ centsMode, showAsBB: panel.showAsBB });
  const max = Math.max(panel.maxAllowed, 0);
  const [value, setValue] = useState<number>(clamp(panel.initialValue, 0, Math.max(max, panel.stack)));
  const [text, setText] = useState(() => valueToText(value, mode, panel.bigBlind));
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!autoFocus) return;
    input.current?.focus();
    input.current?.select();
  }, [autoFocus]);

  const set = (v: number) => {
    setValue(v);
    setText(valueToText(v, mode, panel.bigBlind));
  };
  const valid = useMemo(() => panel.isValid(value), [panel, value]);
  const label = panel.submitLabel(value);

  const submit = () => {
    if (!valid) return;
    onSubmit(value);
  };

  return (
    <form
      className={"raise-controller-form" + (valid ? "" : " invalid")}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="raise-bet-value">
        <label className="raise-bet-label" htmlFor="pt-bet-input">
          {panel.showAsBB ? "Your bet (BB)" : "Your bet"}
        </label>
        <div className="raise-bet-input-ctn">
          <input
            id="pt-bet-input"
            ref={input}
            className="raise-bet-input"
            type="text"
            inputMode={mode === "int" ? "numeric" : "decimal"}
            autoComplete="off"
            value={text}
            onChange={(e) => {
              const t = sanitizeInput(e.target.value, mode);
              setText(t);
              const v = textToValue(t, mode, panel.bigBlind);
              setValue(v ?? 0);
            }}
            onBlur={() => setText(valueToText(value, mode, panel.bigBlind))}
          />
          <span className="bb-value">{convertedTag(value, mode, panel.bigBlind, centsMode)}</span>
        </div>
      </div>
      <div className="raise-controller">
        <div className="default-bet-buttons">
          {PRESET_KEYS.map((k) => (
            <button key={k} type="button" className="default-bet-button" onClick={() => set(presetValue(panel.presets, k, max))}>
              {PRESET_LABELS[k]}
            </button>
          ))}
        </div>
        <div className="raise-slider-row">
          <button type="button" className="control-button decrease" aria-label="Decrease" onClick={() => set(stepBet(value, -1, panel.bigBlind, max))}>
            -
          </button>
          <input
            className="slider-control"
            type="range"
            min={0}
            max={max}
            step={1}
            value={clamp(value, 0, max)}
            onChange={(e) => set(Number(e.target.value))}
          />
          <button type="button" className="control-button increase" aria-label="Increase" onClick={() => set(stepBet(value, 1, panel.bigBlind, max))}>
            +
          </button>
        </div>
      </div>
      <div className="action-buttons raise-action-buttons">
        <button type="button" className="button-1 action-button gray back with-tip" data-tip="esc" onClick={onBack}>
          Back
        </button>
        <input type="submit" className="button-1 action-button green highlighted bet" value={label} disabled={!valid} />
      </div>
    </form>
  );
}
