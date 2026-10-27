/**
 * Verbatim UI copy (SPEC 19 + the sections it points to). Added by W1 (additive). `<n>`/`<Name>`/`<id>` tokens are kept
 * exactly as in SPEC: substitute with `fillCopy`. A test asserts every value appears verbatim in docs/SPEC.md.
 * UI uppercases buttons/tabs by CSS: store the mixed-case text.
 */
export const COPY = {
  home: { ready: "Ready to play?", startNew: "START A NEW GAME", newGame: "New Game", tagline1: "Play free private online poker with your friends.", tagline2: "No download and no registration needed.", nickname: "Your Nickname", create: "Create Game", loading: "Loading...", newToPoker: "New to poker? ", tutorial: "Learn the rules in our free interactive tutorial", gotIt: "Got it!", connecting: "Connecting...", connectionFailed: "Connection failed!" },
  seat: {
    sit: "Sit", yourName: "Your Name", intendedStack: "Intended Stack", yourStack: "Your Stack", sitAway: "Sit with Away set",
    allowSpectate: "Allow unseated players to see my hole cards", request: "Request the Seat", take: "Take the Seat", requesting: "Requesting…",
    requested: "You requested this seat. Wait for the owner approval.", cancelIngress: "Cancel Game Ingress Request",
    requestError: "An error occurred when requesting the seat.", playerNameLine: "Player Name: <msg>", stackLine: "Stack: <msg>",
    wantsToJoin: "The player \"<Name>\" wants to join the game!", doNotShow: "do not show this again?", reject: "Reject", ignore: "Ignore", accept: "Accept",
    approved: "The player was approved successfully!", rejected: "The player was rejected successfully!",
    acceptFailed: "Was not possible to accept this player, please try again in some minutes.", rejectFailed: "Was not possible to reject this player, please try again in some minutes.",
    approvedToast: "Player successfully approved.", rejectedToast: "Ingress request successfully rejected.", whoops: "Whoops, something goes wrong.",
    requestedIngress: "Requested Ingress (Intended Seat Number: N)", approve: "Approve", deny: "Deny", approvePlayer: "Approve Player", updatedToast: "Player successfully updated!"
  },
  waiting: {
    title: "Waiting for others", share: "Share this link with your friends!", copyLink: "Copy Link", copied: "Copied!", shuffleSeats: "Shuffle Seats", startGame: "Start Game",
    ownerDeal: "Waiting for the owner to deal the next hand.", paused: "The room owner paused the game.", nextHand: "Next Hand »"
  },
  chrome: {
    options: "Options", leaveSeat: "Leave Seat", away: "Away", imBack: "I'm Back", owner: "Owner: <name>", logLedger: "Log / Ledger", log: "Log", chat: "Chat", chatN: "Chat (N)",
    fullScreen: "Full Screen", effectsVolume: "Effects Volume", togglePause: "Toggle Pause", pauseGame: "Pause the Game", stopOnNext: "Stop Game on Next Hand", cancelStop: "Cancel Game Stop",
    fold: "Fold", waiting: "Waiting", inNextHand: "In Next Hand", quitting: "Quitting", suffixAway: " (Away)", suffixOffline: " (Offline)", offlineAway: "Offline & Away",
    allIn: "All In", check: "check", total: "total <n>", nlh: "No Limit Texas Hold'em", deadSB: "Dead Small Blind"
  },
  actions: {
    call: "Call <n>", bet: "Bet <n>", allInN: "All In <n>", raise: "Raise", betLabel: "Bet", checkLabel: "Check", foldLabel: "Fold", checkOrFold: "Check or Fold", yourTurn: "Your Turn",
    extraTime: "Activate Extra Time (<n>s)", extraTimeOn: "Extra Time Activated", yourBet: "Your bet", minRaise: "Min Raise", halfPot: "1/2 Pot", threeQuarterPot: "3/4 Pot", pot: "Pot", allIn: "All In", back: "Back",
    unnecessaryFold: "Are you sure that you want do an unnecessary fold?", doNotShowSession: "Do not show this again in this session?", ritTitle: "Run it Twice?", yes: "Yes", no: "No",
    ritWaiting: "Waiting for run it twice decisions (<n>s)", showAll: "Show All Cards", reveal: "Reveal", rabbitSeen: "Some players are seeing the undealt cards.", cancel: "Cancel", confirm: "Confirm", ok: "OK"
  },
  dialogs: {
    leaveTitle: "Are you sure that you want to leave your seat?", leaveBody: "You will enter in check/fold mode until the hand's end.",
    stopBody: "You are about to stop the game. When restarting the game, the dealer will be randomly assigned and the missed blinds will be forgiven.",
    sitBackNoChips: "You can't sit back without chips. Please add chips or request the game host to add chips for you.",
    removePlayer: "Are you sure that you want to remove this player from their seat?", transfer: "Are you sure that you want transfer the game ownership?",
    allowSpectator: "Are you sure that you want to allow this player to see the hole cards when not seated?", putAway: "Are you sure that you want to put this player in away mode?",
    spectatorWarning: "WARNING: new players allowed to be spectators (see hole cards) when unseated! Players: <names>", spectatorWarningOk: "Ok, I am Aware!"
  },
  menus: { home: "Home", gameConfigs: "Game Configurations", players: "Players", preferences: "Preferences", back: "« Back", game: "Game" },
  playersScreen: {
    playingWith: "Playing with <stack> stack", waitingNext: "Waiting next turn to enter", away: "Away", requested: "Requested Ingress (Intended Seat Number: <n>)",
    willQuit: "Player will quit in the Next Turn", watching: "Watching", allowedSpectator: "Allowed to be Spectator",
    loadError: "Something wrong happened when loading the game's players.", playerStack: "Player's Stack", updatePlayer: "Update Player", approvePlayer: "Approve Player",
    updateOnNext: "Update on Next Hand", approveOnNext: "Approve on Next Hand", queuedToast: "The player will be updated on next hand.", removeNext: "The Player will be removed on next hand.",
    removed: "Player successfully removed.", transferred: "Game ownership successfully transferred.", removePlayer: "Remove Player", transferOwnership: "Transfer Game Ownership",
    allowSpectatorMode: "Allow Spectator Mode", disallowSpectatorMode: "Disallow Sepectator Mode", putAway: "Put on Away Mode", awayToast: "The player entered in away mode."
  },
  rebuy: {
    popup: "Would you like to Rebuy?", available: "Available values:", seconds: "<n> seconds to take the decision",
    waitBusted: "Waiting for busted players to make rebuy decision. (<n> seconds)", ownerTitle: "The player \"<name>\" requested a rebuy.", requested: "Requested stack: <n>",
    waitOwner: "Waiting for the owner to approve/deny the pending rebuys. (<n> seconds)",
    requestFailed: "Was not possible to request the rebuy. Please try again.", resolveFailed: "Was not possible to resolve this rebuy request, please try again in some minutes."
  },
  config: {
    updateGame: "Update Game", updateOnNext: "Update on Next Hand", queuedBanner: "These settings are waiting the next hand to be defined.", updated: "Game successfully updated.",
    enqueued: "New configs successfully enqueued. The game will be updated on the next hand.",
    invalid: "Something doesn't look right with your game configurations, please check the errors on the form.", loading: "Loading, please wait...",
    fetchFailed: "Something wrong happened when fetching the game configs.", notOwner: "Warning: only the room owner can change these settings.",
    spectatorGrant: "You will need to grant spectator mode to individual players, which you can do in their Edit screen in the Players menu above.",
    spectatorOffConfirm: "Warning: you will only be able to activate it again when the game stops and no player is seated.",
    resetLevelError: "You need to choose a blind reset level.", lockMessage: "You need pause the game in order to change the blind structure.", pauseNow: "Ok, I want pause the game now",
    addLevel: "Add Another Level (or Press \"+\")", countdownS: "Only start next blind countdown in the hand's beginning", countdownC: "Never stop the countdown",
    presetsEmpty: "You can create presets to reuse your game configurations in other games.", presetsMax: "You reached the max limit of 5 presets.",
    presetNameRequired: "You must define the preset name.", presetDuplicate: "There's a preset with same name.",
    labels: {
      blindLevels: "Blind Levels", antes: "Antes?", variant: "Poker Variant", variantOption: "No Limit Texas Hold'em", cents: "Use cents values?",
      rabbit: "Allow players to see the undealt cards? (Rabbit Hunting)", rit: "Allow Run it Twice?", straddle: "Allow UTG Straddle 2BB?", autoDeal: "Auto start the next hand?",
      showdown: "Showdown Presentation Time", dealAway: "Deal hands to away players?", decisionLimit: "Decision Time Limit (seconds) (blank to no limit)",
      timeBank: "Time Bank Length (seconds) (blank to no time bank)", fillBank: "Number of played hands to fill time bank", revealAll: "Reveal all hands when no more action is possible?",
      spectatorMode: "Spectator Mode", allowRebuy: "Allow Rebuy?", guestChat: "Allow guests to send chat messages?", recordChat: "Record table chat for Hand Replayer?", autoTrim: "Auto trim excess bets?"
    },
    ritOptions: { always: "Always", ask_players: "Ask Players", no: "No" },
    showdownOptions: { fast: "Fast (3s)", normal: "Normal (6s)", slow: "Slow (9s)" },
    help: {
      rebuy: "When enabled, busted players can immediately request a rebuy with a new stack value. The game owner must approve or reject each request.",
      guest: "Every player that has been in the table is considered as \"guest\"",
      recordChat: "When enabled, table chat messages are saved with each hand and may appear in Hand Replayer and shared replays.",
      autoTrim: "When enabled, raises that exceed the maximum allowed bet based on the enemies stacks are trimmed down to the highest valid amount."
    }
  },
  log: {
    sessionLog: "Session Log", sessionLedger: "Session Ledger", fullLog: "Full Log", ledger: "Ledger", download: "Download", loading: "Loading...", empty: "Empty Log",
    tooMany: "Too many requests, please try again in some seconds.", busy: "The log access is limited due the high load on servers. Please try again in some minutes.", failed: "Something wrong happened when loading the log.",
    ledgerUnavailable: "Sorry, the ledger is not available in this type of game.", tableTotal: "TABLE TOTAL", details: "Details", hideDetails: "Hide Details",
    notStarted: "Not Started Session", tookSeat: "Took a Seat", leftSeat: "Left the Seat", addOn: "Add-on", removedChip: "Removed", resetStack: "Reset Stack",
    columns: { player: "PLAYER", buyIn: "BUY-IN", buyOut: "BUY-OUT", stack: "STACK", net: "NET" }
  },
  chat: {
    quiet: "It's a bit quiet here.", clickBalloon: "Click on the balloon and send a Message!", newMessages: "New Messages", placeholder: "Your Message (press Enter to submit)",
    error: "Something wrong happened. Please try again.", noMuted: "No players muted", unmute: "Unmute", mute: "Mute",
    recording: "This table chat is being recorded: messages are saved with each hand and may appear in Hand Replayer and shared replays.", recordingAria: "This table chat is being recorded",
    bbToggle: "You are now seeing the values as big blinds, to toggle it, press b",
    profanityWarn: "⚠️ Profanity is not allowed. Next offense in the next 10 minutes will result in a 10-minutes block.",
    blocked10m: "⚠️ You have been blocked from the chat for 10 minutes due to profanity."
  },
  prefs: {
    userId: "Your User ID: <id>", deckStyle: "Deck Style", fourColors: "Four Colors", twoColors: "Two Colors", autoStraddle: "Auto Straddle 2 Big Blinds when UTG?",
    autoStraddleHelp: "The game owner needs to allow straddle at the game configs.", hideBadges: "Hide the wins/re-entries count badges?",
    hideAchievements: "Hide players' achievement Badges? (Displayed close to the Player name)", valuesStyle: "Values Display Style", bigBlinds: "Big Blinds", formatted: "Formatted", none: "None",
    valuesHelp: "The apparence of the values on the game screen.", valuesTip: "Tip: you can toggle the Big Blind configuration pressing b key.", hideMood: "Hide Mood Emoji",
    disableSecondary: "Disable Secondary Sound Effects? (Fold/Check/Bet/Card)", disableChatBeep: "Disable New Chat Message Beep?", rit: "Run it Twice?", askEachTime: "Ask each Time",
    autoExtra: "Auto activate your extra time?", hideHandReview: "Hide Hand Review Notification?", quickAccept: "Show Quick Accept player warning?", show: "Show", hide: "Hide"
  }
} as const;

/** Replace `<token>` placeholders: fillCopy(COPY.actions.call, { n: 20 }) -> "Call 20"; `N` style tokens are not auto-filled. */
export function fillCopy(template: string, vars: Record<string, string | number>): string {
  return template.replace(/<([A-Za-z]+)>/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
