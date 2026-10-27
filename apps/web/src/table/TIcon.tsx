import { Icon, type IconName } from "./deps";

/** Thin wrapper so every table icon goes through art/Icon (W8). */
export function TIcon(props: { name: IconName; className?: string; style?: React.CSSProperties }) {
  return <Icon name={props.name} className={props.className} style={props.style} />;
}
