# c-config-validation - update_game is not schema-validated (LOW-MEDIUM, owner-only; NOT applied)
`POST /games/:id/update_game` passes the raw body to the engine; `validateConfig` checks only blinds/limits/enums. Measured (`s04-input.mjs`): 10 boolean fields accept any JSON (`"yes please"`), unknown keys are stored in state.json and broadcast to every viewer in every frame, and `{}` / `{"x":1e999}` / `{"playerID":null}` make `normaliseConfig` throw -> HTTP 500 `engine-error` + stack trace in the log. A deeply nested junk field (6000 levels) is accepted in the JSON stage. Only the table owner can do this, so it is self-harm or owner->clients injection, not a cross-user attack.
Proposed diff (`apps/server/src/http/router.ts`, before `run({kind:"updateGame"...})`):
```ts
const level = z.object({ sb: z.number().int(), bb: z.number().int(), ante: z.number().int().nullable(), durationMin: z.number().int().nullable() }).strict();
const gameConfigSchema = z.object({
  blindLevels: z.array(level).min(1).max(100), antes: z.boolean(), variant: z.literal("th"), centsMode: z.boolean(), rabbitHunt: z.boolean(),
  runItTwice: z.enum(["always", "ask_players", "no"]), straddleAllowed: z.boolean(), autoDeal: z.boolean(), showdownTime: z.enum(["fast", "normal", "slow"]),
  dealToAway: z.boolean(), decisionLimitSec: z.number().int().nullable(), timeBankSec: z.number().int().nullable(), timeBankFillHands: z.number().int().nullable(),
  revealAllWhenNoAction: z.boolean(), spectatorMode: z.boolean(), allowRebuy: z.boolean(), guestChat: z.boolean(), recordChat: z.boolean(),
  autoTrimBets: z.boolean(), countdownMode: z.enum(["s", "c"]), blindResetLevel: z.number().int().nullable(), queued: z.undefined().optional()
}).strict();
-        const r = run({ kind: "updateGame", config: body as ReturnType<typeof defaultGameConfig> });
+        const parsed = gameConfigSchema.safeParse(body); if (!parsed.success) throw new HttpError(422, { blindLevels: "invalid value" }); // U-G2 text
+        const r = run({ kind: "updateGame", config: parsed.data as ReturnType<typeof defaultGameConfig> });
```
Also make `normaliseConfig` total (return 422 instead of throwing when `blindLevels` is not an array). Tests that prove it: the DEFECT lines of `s04-input.mjs`.
