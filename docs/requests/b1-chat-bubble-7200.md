# B1 request (core/shared owner): table chat bubble lifetime
Measured (research/07 s6): bubble removed exactly 7.204 s after insertion for BOTH "short msg" (2 words) and "hello from Carol, this is a lo..." (~10 words), desktop and phone -> a fixed ~7.2 s, NOT `2300 + 300*words`.
Current: packages/shared/src/format.ts `chatBubbleMs` (formula) used by apps/web/src/core/store/gameStore.ts line ~192 -> a 2-word message lives 2.9 s (verified in the real app with MutationObserver: 24579 -> 27465 ms).
Request: table bubble `until = now + 7200` (table/logic.ts already exports BUBBLE_LIFETIME_MS = 7200). Keep the formula only for the phone auto-message balloon (SPEC 17.2, unmeasured).
