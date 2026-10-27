import { logoFull, logoMarkSvg } from "./svg/logo";

export interface LogoProps {
  /** `full` = mark + wordmark (120x28 box), `mark` = chip mark only (square). */
  variant?: "full" | "mark";
  /** `dark` = for dark backgrounds (cream wordmark), `light` = for light backgrounds. */
  tone?: "dark" | "light";
  /** CSS height (number = px, string = any unit). Width follows the aspect ratio. */
  height?: number | string;
  className?: string;
}

/** PokerThen logo. Inline SVG so the Mulish wordmark picks up the page font. */
export function Logo({ variant = "full", tone = "dark", height = 28, className }: LogoProps) {
  const h = typeof height === "number" ? `${height}px` : height;
  const ratio = variant === "full" ? 120 / 28 : 1;
  const html = variant === "full" ? logoFull(tone) : logoMarkSvg(32);
  return (
    <span
      className={`pt-logo pt-logo-${variant}${className ? " " + className : ""}`}
      style={{ display: "inline-block", height: h, aspectRatio: String(ratio), lineHeight: 0 }}
      // static, build-time SVG strings from ./svg/logo (no user input)
      dangerouslySetInnerHTML={{ __html: html.replace(/ width="[^"]*" height="[^"]*"/, ' width="100%" height="100%"') }}
    />
  );
}
