import { useState, type ReactNode } from "react";

/** Yes/No (or n-way) segmented control `.choose-buttons`. */
export function Choose<T extends string | boolean>({
  value,
  options,
  onChange,
  disabled,
  id
}: {
  value: T;
  options: Array<[T, string]>;
  onChange: (v: T) => void;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <div className="choose-buttons" id={id} role="group">
      {options.map(([v, label]) => (
        <button
          key={String(v)}
          type="button"
          className={v === value ? "active" : ""}
          aria-pressed={v === value}
          disabled={disabled}
          onClick={() => onChange(v)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
export const YES_NO: Array<[boolean, string]> = [
  [true, "Yes"],
  [false, "No"]
];

/** Yellow-on-black `?` chip with optional popover text. */
export function Help({ text, ariaLabel }: { text?: string; ariaLabel?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="help-signal-wrap">
      <button
        type="button"
        className="help-signal"
        aria-label={ariaLabel ?? "Help"}
        onClick={() => text && setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>
      {open && text ? <span className="pt-help-pop popover-1">{text}</span> : null}
    </span>
  );
}

export function Field({ label, help, helpText, children, error, dim }: { label: ReactNode; help?: boolean; helpText?: string; children: ReactNode; error?: string; dim?: boolean }) {
  return (
    <div className={`pt-field${dim ? " dim" : ""}`}>
      <div className="pt-field-row">
        <label className="pt-field-label">
          {label} {help ? <Help text={helpText} /> : null}
        </label>
        <div className="pt-field-control">{children}</div>
      </div>
      {error ? <div className="error-message">{error}</div> : null}
    </div>
  );
}
