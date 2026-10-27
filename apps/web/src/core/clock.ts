/**
 * Server clock sync (ARCH 5.3, SPEC 7.3): offset = Date.now() - frame.meta.sN from every frame (latest wins);
 * serverNow() = Date.now() - offset. No RTT correction (as the reference).
 */
export class ServerClock {
  offset = 0;
  constructor(private readonly wall: () => number = () => Date.now()) {}
  update(sN: number): void {
    this.offset = this.wall() - sN;
  }
  /** bound accessor with stable identity */
  readonly now = (): number => this.wall() - this.offset;
}
