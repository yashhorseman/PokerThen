import { useEffect, useRef, useState } from "react";
import { useFrame, useTableActions, useTableVM } from "./deps";
import { showAlert } from "./dialogs";
import { digitsOnly, parseStack, prefillName } from "./logic";
import { S } from "./strings";

/**
 * `.popover-1.request-ingress-popover` (SPEC 2.3). W5 renders it inside the clicked empty seat:
 * `<SitPopover seatNo={seatNo} position={slot} onClose={...} />`. Placement per seat on phone is CSS (`.sit-pos-N`).
 */
export function SitPopover({ seatNo, seat: seatAlias, position, onClose }: { seatNo?: number; seat?: number; position: number; onClose: () => void }) {
  const seat = (seatNo ?? seatAlias) as number;
  const vm = useTableVM();
  const frame = useFrame();
  const actions = useTableActions();
  const you = frame?.players[vm.youId];
  const [name, setName] = useState(() => prefillName(you?.name));
  const [stack, setStack] = useState("");
  const [allowSpec, setAllowSpec] = useState(false);
  const [away, setAway] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const ref = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const owner = vm.owner.isOwner;
  const desktop = vm.orientation === "landscape";

  useEffect(() => {
    if (desktop) nameRef.current?.focus(); // autofocus desktop only
  }, [desktop]);
  useEffect(() => {
    const onDown = (e: Event) => {
      if (!ref.current?.contains(e.target as Node) && !(e.target as Element)?.closest?.(".alert-1, .pt-dialog-layer")) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector(".pt-dialog-layer") && onClose();
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const stackLabel = owner ? S.yourStack : S.intendedStack;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const r = await actions.requestSeat({
        seat,
        playerName: name,
        allowSpectator: allowSpec,
        stack: parseStack(stack),
        ...(away ? { sitAsAway: true } : {})
      });
      if (r.ok) {
        setErrors({});
        // the popover stays behind with the REQUESTING… label (SPEC 2.4); owner is seated directly
        if (!owner) await showAlert(S.youRequested);
        else onClose();
      } else {
        setErrors(r.errors);
        setBusy(false);
      }
    } catch {
      setBusy(false);
    }
  };
  return (
    <div ref={ref} className={`popover-1 request-ingress-popover sit-pos-${position}`} data-seat={seat} role="dialog">
      <span className="popover-arrow" />
      <form noValidate onSubmit={submit}>
        <div className="form-1-input-control">
          <label htmlFor={`pt-sit-name-${seat}`}>{S.yourNickname}</label>
          <input
            id={`pt-sit-name-${seat}`}
            ref={nameRef}
            type="text"
            maxLength={14}
            placeholder={S.yourName}
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 14))}
            onFocus={(e) => e.currentTarget.select()}
          />
          {errors.playerName ? <div className="error-message">{errors.playerName}</div> : null}
        </div>
        <div className="form-1-input-control">
          <label htmlFor={`pt-sit-stack-${seat}`}>{stackLabel}</label>
          <input
            id={`pt-sit-stack-${seat}`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            required
            placeholder={stackLabel}
            value={stack}
            onChange={(e) => setStack(digitsOnly(e.target.value))}
          />
          {errors.stack ? <div className="error-message">{errors.stack}</div> : null}
        </div>
        {vm.spectatorMode || vm.config.spectatorMode ? (
          <label className="pt-check">
            <input type="checkbox" checked={allowSpec} onChange={(e) => setAllowSpec(e.target.checked)} /> {S.allowSpectatorCheckbox}
          </label>
        ) : null}
        <label className="pt-check">
          <input id="sit-as-away" type="checkbox" checked={away} onChange={(e) => setAway(e.target.checked)} /> {S.sitAway}
        </label>
        <button type="submit" className="button-1 green highlighted pt-sit-submit" disabled={busy}>
          {busy ? S.requesting : owner ? S.takeSeat : S.requestSeat}
        </button>
      </form>
    </div>
  );
}
