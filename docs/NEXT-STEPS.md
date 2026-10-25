# Next steps

Everything below is **not built**; the repository is runnable and all tests pass.

## Highest value first
1. **Hand replayer + log download** — store the engine events per hand (they already carry everything; add hole cards at `hand.started` for authorised viewers only) and add a replay viewer. Spec E1/E3.
2. **Blind levels / tournament clock** — ordered levels, pause freezes the clock, apply only at hand start. Spec C2.
3. **Straddle, bomb pots, double board** — all extend `startHand`/`endStreet`; add the deck-capacity check from spec D1 before accepting configs.
4. **Omaha (PLO4/PLO5, Hi and Hi/Lo 8)** — evaluator with exactly-2-hole + exactly-3-board rule (differential-test it against an independent one, like Hold'em), pot-limit caps.
5. **7-2 bounty, Nit, simulated fee** — separate modules that consume hand outcomes and emit balanced ledger entries.
6. **Face-up spectators** — separate projection, owner-only grants, warnings.
7. **Delta streaming + resync** if snapshot size becomes a problem.
8. **Postgres + multiple workers** only if the table count outgrows one instance.

## Housekeeping
- Add the browser smoke test to CI (needs a Chrome install step).
- A visual-regression pass at 360×800, 390×844, 768×1024, 1024×768 and 1440×900 with 2/6/10 seats and long nicknames.
- A screen-reader pass on action announcements (aria-live is in place for results and the log).
