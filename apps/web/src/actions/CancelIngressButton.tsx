import { useTableActions } from "./deps";

/** Exported separately for W5/W7 if the pending-request state needs it elsewhere (SPEC 2.4). */
export function CancelIngressButton() {
  const actions = useTableActions();
  return (
    <button type="button" className="button-1 action-button red highlighted cancel-request-ingress" onClick={() => actions.cancelIngress()}>
      Cancel Game Ingress Request
    </button>
  );
}
