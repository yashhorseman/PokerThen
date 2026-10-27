import { SEATED_STATUSES, TABLE_SEATS, type Frame, type PlayerId, type SeatNo } from "@pokerthen/shared";

export function seatOf(frame: Frame, id: PlayerId): SeatNo | null {
  for (const [seat, pid] of frame.seats) if (pid === id) return seat;
  return null;
}

export function isSeated(frame: Frame, id: PlayerId): boolean {
  const p = frame.players[id];
  return !!p && SEATED_STATUSES.includes(p.status) && seatOf(frame, id) !== null;
}

/**
 * Rotation rule (SPEC 4.4, C1): a seated viewer sees their own seat at position 1 and the others keep clockwise
 * order: position p shows real seat `((mySeat - 1 + p - 1) % 10) + 1`. Unseated viewers: position = seat number.
 */
export function seatForPosition(position: number, mySeat: SeatNo | null): SeatNo {
  return mySeat == null ? position : ((mySeat - 1 + position - 1) % TABLE_SEATS) + 1;
}
export function positionForSeat(seat: SeatNo, mySeat: SeatNo | null): number {
  return mySeat == null ? seat : ((seat - mySeat + TABLE_SEATS) % TABLE_SEATS) + 1;
}
