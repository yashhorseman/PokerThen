import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLongPress } from "../../src/phone/useLongPress";

type H = ReturnType<typeof useLongPress>;
function grab(onLong: () => void, onClick?: () => void): H {
  let out!: H;
  const C = () => ((out = useLongPress(onLong, { onClick })), null);
  renderToStaticMarkup(<C />);
  return out;
}
const ev = (o: object = {}) => ({ clientX: 0, clientY: 0, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...o }) as never;

describe("useLongPress (SPEC 5.6: 500 ms, click swallowed)", () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());
  it("fires after 500 ms and swallows the following click", () => {
    const long = vi.fn(), click = vi.fn();
    const h = grab(long, click);
    h.onPointerDown(ev());
    vi.advanceTimersByTime(499);
    expect(long).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(long).toHaveBeenCalledTimes(1);
    const e = ev();
    h.onClick(e);
    expect(click).not.toHaveBeenCalled();
    expect((e as { preventDefault: () => void }).preventDefault).toHaveBeenCalled();
    h.onClick(ev()); // next click is normal
    expect(click).toHaveBeenCalledTimes(1);
  });
  it("short press is a normal click", () => {
    const long = vi.fn(), click = vi.fn();
    const h = grab(long, click);
    h.onPointerDown(ev());
    vi.advanceTimersByTime(200);
    h.onPointerUp();
    vi.advanceTimersByTime(1000);
    h.onClick(ev());
    expect(long).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledTimes(1);
  });
  it("moving away cancels", () => {
    const long = vi.fn();
    const h = grab(long);
    h.onPointerDown(ev());
    h.onPointerMove(ev({ clientX: 30 }));
    vi.advanceTimersByTime(800);
    expect(long).not.toHaveBeenCalled();
  });
});
