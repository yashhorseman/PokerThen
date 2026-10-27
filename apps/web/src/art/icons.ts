/**
 * Original UI icon set (SPEC 18.2). 24x24 grid, round stroke 1.9, drawn as path data.
 * `f` marks a filled path (solid shape), others are stroked outlines.
 */
export interface IconPath { d: string; f?: boolean }
const circ = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const speaker = "M4 9.5h3.2L12 5.5v13l-4.8-4H4z";

export const ICONS = {
  options: [{ d: "M4 7h16" }, { d: "M4 12h10" }, { d: "M4 17h16" }, { d: circ(18, 12, 1.6), f: true }],
  "leave-seat": [{ d: "M7 3.5v9.5h9" }, { d: "M7 13v7.5" }, { d: "M16 13v7.5" }, { d: "M7 8h3.5" }, { d: "M14.5 4.5l5 3.5-5 3.5", }],
  away: [{ d: "M20 14.6A8.2 8.2 0 1 1 9.4 4a6.6 6.6 0 0 0 10.6 10.6z" }],
  "im-back": [{ d: "M7 3.5v9.5h9" }, { d: "M7 13v7.5" }, { d: "M16 13v7.5" }, { d: "M10 7.6l2.2 2.2 4.2-4.4" }],
  "sound-off": [{ d: speaker, f: true }, { d: "M15.5 9.5l5 5" }, { d: "M20.5 9.5l-5 5" }],
  "sound-low": [{ d: speaker, f: true }, { d: "M15.6 9.6a3.7 3.7 0 0 1 0 4.8" }],
  "sound-med": [{ d: speaker, f: true }, { d: "M15.6 9.6a3.7 3.7 0 0 1 0 4.8" }, { d: "M18.2 7.2a7.2 7.2 0 0 1 0 9.6" }],
  "sound-high": [{ d: speaker, f: true }, { d: "M15.6 9.6a3.7 3.7 0 0 1 0 4.8" }, { d: "M18.2 7.2a7.2 7.2 0 0 1 0 9.6" }, { d: "M20.6 4.9a10.6 10.6 0 0 1 0 14.2" }],
  eye: [{ d: "M2.5 12C5 7.6 8.4 5.6 12 5.6s7 2 9.5 6.4c-2.5 4.4-5.9 6.4-9.5 6.4S5 16.4 2.5 12z" }, { d: circ(12, 12, 3) }],
  pause: [{ d: "M7 5h3.4v14H7zM13.6 5H17v14h-3.4z", f: true }],
  play: [{ d: "M8 5.2v13.6L19 12z", f: true }],
  stop: [{ d: "M6.5 6.5h11v11h-11z", f: true }],
  fullscreen: [{ d: "M4 9V4h5" }, { d: "M20 9V4h-5" }, { d: "M4 15v5h5" }, { d: "M20 15v5h-5" }],
  "fullscreen-exit": [{ d: "M9 4v5H4" }, { d: "M15 4v5h5" }, { d: "M9 20v-5H4" }, { d: "M15 20v-5h5" }],
  clock: [{ d: circ(12, 12, 8.6) }, { d: "M12 7v5.2l3.4 2" }],
  trophy: [{ d: "M7.5 4h9v5.2a4.5 4.5 0 0 1-9 0z" }, { d: "M7.5 6H4.4c0 3 1.2 4.6 3.4 5" }, { d: "M16.5 6h3.1c0 3-1.2 4.6-3.4 5" }, { d: "M12 13.7V17" }, { d: "M8.5 20h7M9.6 17h4.8" }],
  fold: [{ d: "M6 6l12 12" }, { d: "M18 6L6 18" }],
  exit: [{ d: "M10 4H5.5v16H10" }, { d: "M9.5 12h10" }, { d: "M16 8l4 4-4 4" }],
  chat: [{ d: "M4 5.5h16v10.5H11l-4.6 3.6V16H4z" }],
  send: [{ d: "M3.5 11.4L20.5 4l-5.2 16-3.6-6.2z" }, { d: "M11.7 13.8l8.8-9.8" }],
  copy: [{ d: "M8.5 8.5h11v11h-11z" }, { d: "M15.5 8.5v-4h-11v11h4" }],
  record: [{ d: circ(12, 12, 5), f: true }],
  house: [{ d: "M3.5 11.4L12 4l8.5 7.4" }, { d: "M6 10v9.5h12V10" }, { d: "M10 19.5v-5h4v5" }],
  close: [{ d: "M5.5 5.5l13 13" }, { d: "M18.5 5.5l-13 13" }],
  "chevron-left": [{ d: "M14.5 5.5L8 12l6.5 6.5" }],
  "chevron-right": [{ d: "M9.5 5.5L16 12l-6.5 6.5" }],
  "caret-down": [{ d: "M6 9.5l6 6 6-6" }],
  check: [{ d: "M5 12.6l4.6 4.6L19 7.4" }],
  users: [{ d: circ(9, 8.6, 3.2) }, { d: "M3 19.5c.4-3.6 2.8-5.4 6-5.4s5.6 1.8 6 5.4" }, { d: "M15.6 5.7a3.2 3.2 0 0 1 0 5.8" }, { d: "M17.8 14.4c1.8.6 3 2.2 3.2 5.1" }],
  download: [{ d: "M12 4v11" }, { d: "M7.5 10.8L12 15.4l4.5-4.6" }, { d: "M5 19.5h14" }],
  plus: [{ d: "M12 5v14" }, { d: "M5 12h14" }],
  minus: [{ d: "M5 12h14" }],
  info: [{ d: circ(12, 12, 8.6) }, { d: "M12 11v5.4" }, { d: circ(12, 7.7, 1), f: true }],
  shield: [{ d: "M12 3.4l7 2.6v5.6c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6z" }, { d: "M8.8 12l2.4 2.4L15.4 9.6" }],
  menu: [{ d: "M4 6.5h16" }, { d: "M4 12h16" }, { d: "M4 17.5h16" }],
  external: [{ d: "M13 4.5h6.5V11" }, { d: "M19.5 4.5L11 13" }, { d: "M17 14.5v5H4.5v-12.5h5" }]
} as const satisfies Record<string, readonly IconPath[]>;

export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];
