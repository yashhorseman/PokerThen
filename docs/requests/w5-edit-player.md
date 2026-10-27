# W5 request: Edit Player entry point (to W7 / W4)
SPEC 4.5 per-seat click menu lists `Edit Player` (owner). W5 renders Hide/Show Avatar and Mute/Unmute Chat but has no documented way to open W7's edit-player screen.
Proposal: W7 exports `openEditPlayer(playerId: string): void` from `menus/index.ts` (wrapping `openConfig("players")` + edit view); W5 then adds the owner-only menu item (one line in `table/Seat.tsx`, marked there).
