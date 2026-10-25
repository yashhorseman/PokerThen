import type { ReactNode, SVGProps } from 'react';

/** Small original inline icons. All use currentColor and scale with the surrounding font size. */
type P = SVGProps<SVGSVGElement>;
const Svg = ({ children, ...p }: P & { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...p}>{children}</svg>
);

export const IconMenu = (p: P) => <Svg {...p}><path d="M4 6h16M4 12h16M4 18h16" strokeWidth="2.6" /></Svg>;
export const IconLeave = (p: P) => <Svg {...p}><path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4" /><path d="M14 8l5 4-5 4M19 12H9" /></Svg>;
export const IconAway = (p: P) => (
  <Svg {...p} fill="currentColor" stroke="none"><circle cx="12" cy="5.2" r="2.7" /><path d="M7.5 9.2h9a1.5 1.5 0 0 1 1.5 1.5v4.3a1 1 0 0 1-2 0v-3.2h-.5V20a1.2 1.2 0 0 1-2.4 0v-5h-1.2v5a1.2 1.2 0 0 1-2.4 0v-8.2H8v3.2a1 1 0 0 1-2 0v-4.3a1.5 1.5 0 0 1 1.5-1.5z" /></Svg>
);
export const IconBack = (p: P) => <Svg {...p}><path d="M5 12h14M11 6l-6 6 6 6" /></Svg>;
/** level 0 = muted, 1 low, 2 medium, 3 high */
export const IconSound = ({ level = 2, ...p }: P & { level?: 0 | 1 | 2 | 3 }) => (
  <Svg {...p}>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" fill="currentColor" />
    {level === 0 ? <path d="M16 9.5l5 5M21 9.5l-5 5" /> : <>
      {level >= 1 && <path d="M15.5 10.2a3.2 3.2 0 0 1 0 3.6" />}
      {level >= 2 && <path d="M17.7 8a6.2 6.2 0 0 1 0 8" />}
      {level >= 3 && <path d="M19.9 5.8a9.2 9.2 0 0 1 0 12.4" />}
    </>}
  </Svg>
);
export const IconPause = (p: P) => <Svg {...p} fill="currentColor" stroke="none"><rect x="6" y="5" width="4.2" height="14" rx="1" /><rect x="13.8" y="5" width="4.2" height="14" rx="1" /></Svg>;
export const IconPlay = (p: P) => <Svg {...p} fill="currentColor" stroke="none"><path d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 8 5.2z" /></Svg>;
export const IconStop = (p: P) => <Svg {...p} fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="1.6" /></Svg>;
export const IconChat = (p: P) => <Svg {...p}><path d="M4 5.5h16a1 1 0 0 1 1 1v9.2a1 1 0 0 1-1 1h-8l-4.5 3.3v-3.3H4a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z" /><path d="M8 11h.01M12 11h.01M16 11h.01" strokeWidth="2.8" /></Svg>;
export const IconLog = (p: P) => <Svg {...p}><path d="M6 3.5h9l3.5 3.5V20a.5.5 0 0 1-.5.5H6a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5z" /><path d="M9 11h6M9 14.5h6M9 7.5h3" /></Svg>;
export const IconChevronUp = (p: P) => <Svg {...p}><path d="M6 14l6-6 6 6M6 19l6-6 6 6" /></Svg>;
export const IconChevronDown = (p: P) => <Svg {...p}><path d="M6 5l6 6 6-6M6 10l6 6 6-6" /></Svg>;
export const IconLink = (p: P) => <Svg {...p}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></Svg>;
export const IconLock = (p: P) => <Svg {...p}><rect x="5" y="10.5" width="14" height="9.5" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></Svg>;
export const IconClose = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6L6 18" /></Svg>;
export const IconUsers = (p: P) => <Svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.2a3.2 3.2 0 0 1 0 5.6M18.5 19a5.5 5.5 0 0 0-3-4.9" /></Svg>;
export const IconGear = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /></Svg>;
export const IconSliders = (p: P) => <Svg {...p}><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></Svg>;
export const IconHelp = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.2c-.8.5-1.2 1-1.2 1.9M12 17h.01" /></Svg>;
export const IconDownload = (p: P) => <Svg {...p}><path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 19.5h14" /></Svg>;
export const IconHome = (p: P) => <Svg {...p}><path d="M4 11l8-6.5L20 11v8.5a.5.5 0 0 1-.5.5H15v-5.5H9V20H4.5a.5.5 0 0 1-.5-.5V11z" /></Svg>;
export const IconPlus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
