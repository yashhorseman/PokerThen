/** `.rit-container` (SPEC 13.2): `Run it Twice?` Yes / No; chosen button stays, the other fades to .25. */
export function RitPrompt({ answered, onVote }: { answered: boolean | null; onVote(decision: boolean): void }) {
  return (
    <div className="rit-container">
      <div className="rit-title">Run it Twice?</div>
      <div className="rit-buttons">
        <button
          type="button"
          className={"button-1 action-button green rit-yes" + (answered === true ? " chosen" : answered === false ? " faded" : "")}
          onClick={() => onVote(true)}
        >
          Yes
        </button>
        <button
          type="button"
          className={"button-1 action-button red rit-no" + (answered === false ? " chosen" : answered === true ? " faded" : "")}
          onClick={() => onVote(false)}
        >
          No
        </button>
      </div>
    </div>
  );
}
