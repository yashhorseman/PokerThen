import type { CSSProperties } from "react";
import { ICONS, type IconName } from "./icons";

export interface IconProps {
  name: IconName;
  /** number = px, string = CSS length (e.g. "1.5rem"). Default `1em`. */
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  /** accessible label; omit for decorative icons */
  title?: string;
}

/** UI icon from the original PokerThen set. Colour = `currentColor`. */
export function Icon({ name, size = "1em", className, style, title }: IconProps) {
  const paths = ICONS[name];
  const s = typeof size === "number" ? `${size}px` : size;
  return (
    <svg
      className={`pt-icon pt-icon-${name}${className ? " " + className : ""}`}
      viewBox="0 0 24 24"
      width={s}
      height={s}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      style={style}
    >
      {title ? <title>{title}</title> : null}
      {paths.map((p, i) => ("f" in p && p.f ? <path key={i} d={p.d} fill="currentColor" stroke="none" /> : <path key={i} d={p.d} />))}
    </svg>
  );
}
