# B2 request (core/viewModel, owner: Phase A/B1) - empty seats for seated "waiting" viewers

Evidence: research/evidence/phone-ui/phone-seated-idle.png (+ research/03 s2/4: "hero in real seat 6 saw ... empty seats then show their REAL seat numbers: 10,9,8,7,5").
A seated phone player whose status is still `waiting` (table not started / joined mid-hand) SEES the dashed `SIT` boxes of the free seats. Once the player is `inGame` (phone-showdown-winner.png) they are gone.

Ours: `apps/web/src/core/viewModel/derive.ts` `mayPickSeat = !youSeated && (...)` hides them for every seated viewer. SPEC 4.4 itself says "viewers who can sit (spectator/unseated, status watching/waiting)" but then "a seated viewer sees only occupied slots" - the still shows the first sentence is the live rule for `waiting`.
Proposed diff (needs owner/B1 to confirm what clicking a free seat does for an already seated viewer; unknown, U-xx):
```ts
const mayPickSeat = (youStatus === "watching" || youStatus === "waiting" || youStatus === "requestedGameIngress" || youStatus === undefined) && occupied < TABLE_SEATS;
```
