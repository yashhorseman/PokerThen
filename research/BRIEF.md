# Research brief (shared by all study agents)

Goal: document how https://www.pokernow.com works (private friends Texas Hold'em tables only) so PokerThen can reproduce
it exactly: same screens, copy text, layouts, proportions, timings, animations, hotkeys, rules, edge cases, on desktop AND phone.
Out of scope: community features (profiles/clubs/leaderboards/forums/accounts-as-social), non-Hold'em variants, voice/video.

## Method
- Use the REA skill / `mcp__rea__*` tools (capture_browser_scenario, inspect_web_page, analyze_web_bundle, export_web_scripts,
  analyze_javascript_application, trace_application_feature, inspect_web_network_capture ...). Load schemas with ToolSearch first.
- Chrome binary: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome". puppeteer-core may be used from
  /Users/yashralhan/Projects/PokerThen/node_modules if present (else install into your own scratch dir, not the project).
- Multi-player behaviour needs several isolated browser contexts (incognito) joining one table you create. You may create tables
  on pokernow.com for testing (play money only). Do not log in with the user's accounts. If something needs a login/captcha/payment
  or a real person, STOP that thread and report it as a blocker; never guess.
- Record OBSERVATIONS (what you saw/measured, with file evidence) separately from INFERENCES and UNKNOWNS. Never assume.
  If an exact value cannot be observed, list it under UNKNOWNS rather than inventing it.
- Measure, don't eyeball: use getComputedStyle / getBoundingClientRect for sizes, colors, fonts, z-order; read CSS keyframes and
  transition durations/easings from the stylesheets; record animation timing from frame-by-frame screenshots or event logs.
- Capture screenshots at: desktop 1440x900, 1024x768, tablet 768x1024, phone 390x844 and 360x740 (touch emulation, DPR 2-3 for phones).
- Copy text (labels, tooltips, toasts, log lines, error messages) VERBATIM.
- Legal/ethics: describe behaviour, structure, measurements and verbatim UI wording. Do NOT copy their images/SVG/fonts files or
  paste their source code into our repo; PokerThen draws its own artwork (only table colour and card-back pattern may differ visually;
  everything else must match in look/behaviour). Reading their public JS to understand logic is fine; write findings as prose/specs/pseudocode.
- Passive/public observation only; no attacks, no bypassing protections, light request rate.

## Output
Write your report to /Users/yashralhan/Projects/PokerThen/research/<your-file>.md (path given in your task) and put raw evidence
(screenshots, jsons, css extracts) in /Users/yashralhan/Projects/PokerThen/research/evidence/<your-topic>/ (gitignored later).
The report must be a spec a builder can implement without seeing the site: exact strings, numbers, states, transitions, edge cases,
plus a checklist section "UNKNOWN / needs owner help". Your final message back to me: <= 25 lines summary + blockers.
