/** Mobile UA test shared with SPEC 3 / 6.4 (hotkeys off, auto-focus off). */
export const MOBILE_UA_RE = /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
export function isMobileUA(ua: string = typeof navigator === "undefined" ? "" : navigator.userAgent): boolean {
  return MOBILE_UA_RE.test(ua);
}
