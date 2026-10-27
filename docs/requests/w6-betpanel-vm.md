# W6 request (RESOLVED by W4): BetPanelVM
W4 exposes `useBetPanelVM()` in `core/hooks.ts`; W6 consumes it (no TableViewModel change needed). `actions/deriveBetPanel.ts` (`computeBetPanel`) is kept only as a tested reference of SPEC 6.3 math for the harness scenarios.
Open (W4): `showConfirm` result contract used by W6 is `false | {confirmed|ok, checked}` (matches core/ui/overlay.ts).
