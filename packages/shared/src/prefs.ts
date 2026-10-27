/** Local preferences (SPEC 16): localStorage key "currentPlayer", JSON, version 1. */
export type VolumeLevel = "off" | "low" | "med" | "high";
export const VOLUME_VALUE: Record<VolumeLevel, number> = { off: 0, low: 0.15, med: 0.45, high: 1 };
export const VOLUME_CYCLE: VolumeLevel[] = ["off", "low", "med", "high"];

export type DisplayValueStyle = "formatted" | "big-blind" | "none";

export interface Prefs {
  sound: VolumeLevel;
  deckStyle: "two-color" | "four-color";
  autoActivateTimeBank: boolean;
  showPromotionalAnnouncements: boolean;
  showDefaultDesignTheme: boolean;
  showQuickAcceptPlayer: boolean;
  showSuggestedGesturePopover: boolean;
  showVideoVoiceChatWarning: boolean;
  version: 1;
  displayValueStyle?: DisplayValueStyle;
  nonBBDisplayValueStyle?: DisplayValueStyle;
  previousDisplayValueStyle?: DisplayValueStyle;
  hideBadges?: boolean;
  hideAchivementBadges?: boolean; // sic
  hideMoodEmojis?: boolean;
  defaultRunItTwice?: boolean | null;
  disableSecondarySounds?: boolean;
  disableChatMessageBeep?: boolean;
  notShowHandNotification?: boolean;
  /** SPEC 16 extra keys (additive) */
  showValueAsBB?: boolean;
  hideGestures?: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  sound: "med",
  deckStyle: "two-color",
  autoActivateTimeBank: true,
  showPromotionalAnnouncements: true,
  showDefaultDesignTheme: true,
  showQuickAcceptPlayer: true,
  showSuggestedGesturePopover: true,
  showVideoVoiceChatWarning: true,
  version: 1
};

/** Sound names (SPEC 18.1). */
export const SOUND_NAMES = [
  "two-taps", "chips", "fold", "winner", "card-place", "beep", "warning-beep", "chat-beep", "new-player-beep", "lost", "dumb-sound"
] as const;
export type SoundName = (typeof SOUND_NAMES)[number];
/** Secondary class muted by `Disable Secondary Sound Effects?` */
export const SECONDARY_SOUNDS: readonly SoundName[] = ["two-taps", "chips", "fold", "card-place"];
