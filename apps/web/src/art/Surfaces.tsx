import type { CSSProperties, ReactNode } from "react";
import { discSvg, seatSlotSvg } from "./svg/misc";

interface BaseProps { className?: string; style?: CSSProperties; children?: ReactNode }
const cx = (...a: (string | false | undefined)[]) => a.filter(Boolean).join(" ");

/** Card back pattern: fills its (card-shaped) parent. Use inside `.card-container` etc. */
export function CardBack({ className, style }: BaseProps) {
  return <div className={cx("pt-card-back", className)} style={style} aria-hidden />;
}

/** Desktop table: rail + felt, one image, ratio 2.116:1 (55.55 x 26.25rem). `red` = spectator/god-mode tint. Fills its parent (`.table`). */
export function FeltDesktop({ red, className, style, children }: BaseProps & { red?: boolean }) {
  return (
    <div className={cx("pt-felt", "pt-felt-desktop", red && "pt-felt-red", className)} style={style}>
      {children}
    </div>
  );
}

/** Phone table: vertical rail + felt (17.4 x 28rem). */
export function FeltPhone({ red, className, style, children }: BaseProps & { red?: boolean }) {
  return (
    <div className={cx("pt-felt", "pt-felt-phone", red && "pt-felt-red", className)} style={style}>
      {children}
    </div>
  );
}

/** Dark textured room behind the table (`.game-main-container`). Absolutely fills the nearest positioned ancestor. */
export function RoomBackground({ className, style }: BaseProps) {
  return <div className={cx("pt-room-bg", className)} style={style} aria-hidden />;
}

/** Dealer (white puck, blue D) and straddle (white puck, red S). Fills its parent (`.dealer-button-ctn`, 1.9 x 1.6rem). `dead` -> opacity .5. */
export function DealerDisc({ kind = "dealer", dead, className, style }: { kind?: "dealer" | "straddle"; dead?: boolean } & Omit<BaseProps, "children">) {
  return (
    <span
      className={cx("pt-disc", `pt-disc-${kind}`, dead && "pt-disc-dead", className)}
      style={style}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: discSvg(kind).replace("<svg ", '<svg width="100%" height="100%" ') }}
    />
  );
}

/** Dashed empty seat slot outline, fills its parent. */
export function SeatSlot({ className, style }: Omit<BaseProps, "children">) {
  return <span className={cx("pt-seat-slot", className)} style={style} aria-hidden dangerouslySetInnerHTML={{ __html: seatSlotSvg().replace("<svg ", '<svg width="100%" height="100%" ') }} />;
}

/** Blurred table picture used behind the New Game card / connection cards (z 30 in the reference; hide when connected). */
export function PlaceholderTable({ kind = "desktop", className, style }: { kind?: "desktop" | "phone" } & Omit<BaseProps, "children">) {
  return <div className={cx("pt-placeholder-table", `pt-placeholder-${kind}`, className)} style={style} aria-hidden />;
}
