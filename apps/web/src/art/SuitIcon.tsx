import type { CSSProperties } from "react";
import { SUIT_PATHS, type SuitKey } from "./svg/suits";

export interface SuitIconProps {
  suit: SuitKey;
  /** Four-colour deck (pref `Deck Style`): h red, d blue, s black, c green. Otherwise colour is inherited (`currentColor`) unless `colored`. */
  fourColor?: boolean;
  /** Apply the two-colour deck colours (h,d red / s,c dark) instead of inheriting currentColor. */
  colored?: boolean;
  size?: number | string;
  className?: string;
  style?: CSSProperties;
}

/** Card colours (SPEC 4.8: functional values, shared by the reference semantics). */
export const SUIT_COLORS_TWO = { s: "#2c2c2c", c: "#2c2c2c", h: "#db3131", d: "#db3131" } as const;
export const SUIT_COLORS_FOUR = { s: "#000", h: "#db3131", d: "#4747ea", c: "#17b717" } as const;

export function SuitIcon({ suit, fourColor, colored, size = "1em", className, style }: SuitIconProps) {
  const fill = fourColor ? SUIT_COLORS_FOUR[suit] : colored ? SUIT_COLORS_TWO[suit] : "currentColor";
  const s = typeof size === "number" ? `${size}px` : size;
  return (
    <svg className={`pt-suit pt-suit-${suit}${className ? " " + className : ""}`} viewBox="0 0 24 24" width={s} height={s} fill={fill} aria-hidden focusable="false" style={style}>
      <path d={SUIT_PATHS[suit]} />
    </svg>
  );
}
