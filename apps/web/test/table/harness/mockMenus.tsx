export function SitPopover(p: { seatNo: number; position: number; onClose: () => void }) {
  return <div className="popover-1 request-ingress-popover" onClick={p.onClose}>sit {p.seatNo}</div>;
}
export const OptionsPopover = () => null;
export const OptionsBadge = () => null;
export const toggleOptions = () => undefined;
export const openEditPlayer = (_id: string) => undefined;
