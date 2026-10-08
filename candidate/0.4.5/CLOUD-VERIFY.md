# Independent browser / source verification

1. Check RUNTIME-MANIFEST.json against all candidate bytes. Read README before running. `npm test` and `npm run verify`; all saved source hashes must match the candidate tested.
2. Serve via `npm start` and open index.html in a supported real browser. Capture real screenshots, console errors and network failures. Worker module must load; no fallback blank page or fake static sand.
3. Start, move both directions, rotate, soft/hard drop, hold/release touch buttons, pause/resume, visibility pause, restart during a pending command. Confirm no old-game snapshot overwrites a restarted game. Test help/focus and small viewports.
4. Validate grain676 atomic conversion, unchanged R.875 circle / R.870 octagon, all four colors, deterministic seed, no overlap admission and no mass loss. Repeat six real inputs from tests/replay.mjs and compare counts (not exact browser wall time).
5. Check actual same-color contact touching both walls clears, no gap/color bridge; flash freezes physics; removal wakes surviving support dependents. Score uses64/169 area normalization; harddrop reward remains original. Top obstruction ends the game.
6. Check localStorage-disabled flow: gameplay works, failure to save is disclosed, no pretend persistent success. Keys must remain isolated from old games.
7. Measure pure worker step timing, worker command acknowledgement, visible render callbacks and wall/simulation clock independently. At heavy load the simulation intentionally runs slower; UI must say so. Software Chromium/SwiftShader is not user hardware. No browser FPS guarantee follows from Node timings.
8. Parent owns publishing to a separate private0.4.5 URL after actual QA. Do not replace existing0.4.0 or0.4.1 routes. No source publication beyond the specifically authorized test branch.
