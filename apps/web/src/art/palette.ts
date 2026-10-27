/**
 * PokerThen palette (original). Single source for the SVG generators and tokens.css.
 * U-A2 [OWNER]: final felt/rail/card-back colours are still the owner's call; change them here + tokens.css only.
 */
export const PALETTE = {
  // felt: "harbour teal" (differs from the reference green on purpose)
  feltCenter: "#1f7480",
  feltMid: "#195b68",
  feltEdge: "#124350",
  feltBottom: "#0d2f39",
  feltLine: "#f2b84b", // inlaid gold pin-stripe
  // spectator / god mode variant (red tinted felt)
  feltRedCenter: "#8a2f3e",
  feltRedMid: "#6e2431",
  feltRedEdge: "#531a25",
  feltRedBottom: "#3a1119",
  rail: "#1b1a22",
  railHi: "#34323f",
  railLo: "#0f0e14",
  room: "#222027",
  roomTile: "#2a2831",
  // accent set used by the logo, card back and icons
  amber: "#f2b84b",
  amberDeep: "#c98a1e",
  ink: "#15131c",
  plum: "#3a2a78",
  plumDeep: "#261b55",
  plumLight: "#5744a8",
  cream: "#fbf6e9"
} as const;
