import type { HTMLAttributes } from "react";
export function Scrim(props: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`pt-scrim ${props.className ?? ""}`} />;
}
