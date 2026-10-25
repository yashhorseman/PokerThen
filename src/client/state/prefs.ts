import { createStore } from './createStore';

/** Per-device player preferences, persisted in localStorage key `currentPlayer` (same key/shape as the reference). */
export type SoundLevel = 'off' | 'low' | 'med' | 'high';
export type ValueStyle = 'none' | 'formatted' | 'big-blind';

export interface Prefs {
  sound: SoundLevel; //                          table-side SOUND button (0 / .15 / .45 / 1)
  deckStyle: 'two-color' | 'four-color';
  autoActivateTimeBank: boolean; //              default true
  showPromotionalAnnouncements: boolean; //      (kept for fidelity; unused)
  showDefaultDesignTheme: boolean; //            "Show Seasonal Table Theme?" (we have no seasonal theme: stored only)
  showQuickAcceptPlayer: boolean; //             "Show Quick Accept player warning?"
  showSuggestedGesturePopover: boolean;
  showVideoVoiceChatWarning: boolean;
  version: 1;
  hideBadges: boolean; //                        "Hide the wins/re-entries count badges?"
  hideAchievementBadges: boolean;
  displayValueStyle: ValueStyle; //              "Values Display Style"
  nonBBDisplayValueStyle: ValueStyle;
  previousDisplayValueStyle: ValueStyle;
  hideMoodEmojis: boolean;
  disableSecondarySounds: boolean; //            "Disable Secondary Sound Effects? (Fold/Check/Bet/Card)"
  disableChatMessageBeep: boolean;
  defaultRunItTwice: boolean | null; //          null = "Ask each Time"
  notShowHandNotification: boolean; //           "Hide Hand Review Notification?"
  hideGestures: 'show' | 'muted' | 'hide';
}

export const DEFAULT_PREFS: Prefs = {
  sound: 'med', deckStyle: 'two-color', autoActivateTimeBank: true, showPromotionalAnnouncements: true,
  showDefaultDesignTheme: true, showQuickAcceptPlayer: true, showSuggestedGesturePopover: true,
  showVideoVoiceChatWarning: true, version: 1, hideBadges: false, hideAchievementBadges: false,
  displayValueStyle: 'none', nonBBDisplayValueStyle: 'none', previousDisplayValueStyle: 'none',
  hideMoodEmojis: false, disableSecondarySounds: false, disableChatMessageBeep: false,
  defaultRunItTwice: null, notShowHandNotification: false, hideGestures: 'show',
};

const KEY = 'currentPlayer';
function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch { /* storage unavailable */ }
  return { ...DEFAULT_PREFS };
}

export const prefsStore = createStore<Prefs>(load());
export const usePrefs = prefsStore.useStore;
export function setPrefs(p: Partial<Prefs>) {
  prefsStore.setState(p);
  try { localStorage.setItem(KEY, JSON.stringify(prefsStore.getState())); } catch { /* ignore */ }
}
/** The `b` hotkey: toggle big-blind display, remembering the previous style */
export function toggleBigBlindDisplay() {
  const s = prefsStore.getState();
  if (s.displayValueStyle === 'big-blind') setPrefs({ displayValueStyle: s.nonBBDisplayValueStyle });
  else setPrefs({ nonBBDisplayValueStyle: s.displayValueStyle, displayValueStyle: 'big-blind' });
}
