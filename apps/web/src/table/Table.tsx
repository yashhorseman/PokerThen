import { DealerDisc, FeltDesktop, FeltPhone, RoomBackground, useHotkey, useOrientation, usePrefs, useTableActions, useTableVM } from "./deps";
import { BoardCards } from "./Cards";
import { EmptySeat, Plate } from "./Seat";
import {
  CenterMessages, DisconnectBanner, FullscreenButton, GameInfos, GameTypeWatermark, LogoTag, NextHandButton,
  SpectatorCount, StartGameButtons, TopLeftButtons, TopRightButtons, WaitingBanner
} from "./Chrome";

function Pot() {
  const { pot } = useTableVM();
  return (
    <div className="table-pot-size">
      <div className="main-value">{pot.mainText}</div>
      <div className={`add-on${pot.totalText ? " visible" : ""}`}>
        {pot.totalText ? <><span className="add-on-label">total</span> {pot.totalText.replace(/^total\s*/i, "")}</> : null}
      </div>
    </div>
  );
}

function DealerDiscs() {
  const { dealer } = useTableVM();
  const same = dealer.dealerPosition != null && dealer.dealerPosition === dealer.straddlePosition;
  return (
    <>
      {dealer.dealerPosition != null && (
        <div className={`dealer-button-ctn dealer-position-${dealer.dealerPosition}${dealer.dead ? " dead-button" : ""}`}>
          <DealerDisc kind="dealer" dead={dealer.dead} />
        </div>
      )}
      {dealer.straddlePosition != null && (
        <div className={`dealer-button-ctn straddle-button-ctn dealer-position-${dealer.straddlePosition}${same ? " second" : ""}`}>
          <DealerDisc kind="straddle" />
        </div>
      )}
    </>
  );
}

/** The whole table surface (ARCH 10.1): felt, seats, board, pot, discs, chrome. */
export function Table() {
  const vm = useTableVM();
  const actions = useTableActions();
  const orientation = useOrientation();
  const [prefs, prefsApi] = usePrefs();
  useHotkey("h", () => { if (vm.board.rabbitAvailable && vm.board.rabbitSlots > 0) actions.revealRabbit(); });
  useHotkey("b", () => {
    const cur = prefs.displayValueStyle ?? "none";
    if (cur === "big-blind") prefsApi.set({ displayValueStyle: prefs.nonBBDisplayValueStyle ?? "none", previousDisplayValueStyle: cur });
    else prefsApi.set({ displayValueStyle: "big-blind", nonBBDisplayValueStyle: cur, previousDisplayValueStyle: cur });
  });
  const Felt = orientation === "portrait" ? FeltPhone : FeltDesktop;
  return (
    <div className={`pt-table-root${vm.fourColor ? " four-color" : ""}`}>
      <div className="game-main-container"><RoomBackground /></div>
      <div className={`table${vm.spectatorMode ? " red" : ""}`}>
        <div className="pt-felt-layer"><Felt red={vm.spectatorMode} /></div>
        {orientation === "landscape" && <GameTypeWatermark />}
        <Pot />
        <BoardCards board={vm.board} handNumber={vm.handNumber} onReveal={() => actions.revealRabbit()} />
        {vm.seats.map((s) =>
          s.player ? <Plate key={s.position} position={s.position} p={s.player} /> : s.canSit || s.viewOnly ? <EmptySeat key={s.position} seat={s} /> : null
        )}
        <DealerDiscs />
        <WaitingBanner />
      </div>
      <LogoTag />
      <TopLeftButtons />
      <GameInfos />
      <TopRightButtons />
      <FullscreenButton />
      <SpectatorCount />
      <CenterMessages />
      <NextHandButton />
      <StartGameButtons />
      <DisconnectBanner />
    </div>
  );
}
