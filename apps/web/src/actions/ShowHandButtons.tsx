import { cardText, type CardCode } from "@pokerthen/shared";

/**
 * `.show-hand-buttons` (SPEC 12.3): green `Show All Cards` + one toggle per hole card.
 * Cards already showing to everybody keep their segment, filled green (`active`, research/07 s1+3).
 * U-SH1: clicking an already shown segment is a no-op (reference behaviour not observed).
 */
export function ShowHandButtons({ cards, shown = [], onShow }: { cards: CardCode[]; shown?: CardCode[]; onShow(which: "all" | CardCode): void }) {
  return (
    <div className="show-hand-buttons">
      <button type="button" className="show-hand-button show-all with-tip" data-tip="s" onClick={() => onShow("all")}>
        Show All Cards
      </button>
      <div className="show-hand-cards">
        {cards.map((c, i) => {
          const isShown = shown.includes(c);
          return (
            <button
              key={c}
              type="button"
              className={"show-hand-button show-card suit-" + c[1] + (isShown ? " active" : "")}
              data-tip={String(i + 1)}
              onClick={isShown ? undefined : () => onShow(c)}
            >
              {cardText(c)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
