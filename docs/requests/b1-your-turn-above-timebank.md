# B1 request (actions/ owner): YOUR TURN vs time-bank pill (landscape)
Evidence: research/evidence/live-gaps/ch_pair.jpg (left image): the yellow "YOUR TURN" text sits ~1rem ABOVE the "EXTRA TIME ACTIVATED" pill (pill 9.8x2.2rem, .6rem above the buttons); it is not hidden.
B1 added a landscape-only override in apps/web/src/table/table.css (`:has(.suspended-action.time-bank) .action-signal {top:-4rem}`). If actions.css is reworked, fold this into `.action-signal` and delete the override. Portrait untouched.
