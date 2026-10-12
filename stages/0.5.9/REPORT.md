# 0.5.9 final candidate

Build: b-b4d94a0ddacbb0968f76640a90b6cb8c280dddb8c927496eae3613192466d5b9. Local complete scope passed; independent real-browser acceptance pending; not yet released.

## Included
- Inherits the055 startup visibility handshake hotfix.
- Inherits056 pause-intent race fixes and deferred focus return.056 independently passed36 tests and8 headed-browser cases, including trusted natural hidden/visible, paused background time and explicit resume.
- Global keyboard handling now leaves interactive controls and editable content to native activation, honors previously prevented events, and remains disabled under modal dialogs. Gameplay keys continue on canvas/body; keyup still releases holds after focus changes.
- Settings description corrected from four to six colors.
- Version labels0.5.9.

The only059 changes from056 are app.mjs, index.html and board-geometry.mjs. All15 other runtime files are byte-identical, including simulation, material geometry/palette, renderer order/cache, wire protocol, and final presentation ACK. No audio or new effects added.

## Attempts intentionally not merged
057 one lateral-order experiment worsened screen synchronization35.86→38.69%; longest chain9→8 did not establish overall benefit. Original055 motion remains, including residual row-like slope movement.

058 bitset enumeration preserved state and223 RGBA frames and reduced empty-slot visits, but the only clean authorized pair did not show a time benefit (Game.step696→929ms). The earlier pair was interfered by a short test process and is not performance evidence. Neither performance claim nor bitset code is included.

## Evidence boundary
The12 focused059 native tests use actual app/runtime/Canvas with DOM and scheduler doubles. They include two056 negative controls and distinguish previously working BUTTON Space behavior from the real Enter focus theft. Final browser Tab/Enter/Space, native modal/focus, touch controls, narrow/landscape layouts and natural background roundtrip remain mandatory. Passing module tests alone is not a claim of playable delivery.

The final regression package retains the historical core, six-color, worker/wire, presentation ACK, renderer/cache/shared-flash, exception recovery, preview and nonlocal/affine/island/fullfield behavior. Known obsolete visual oracle(s) must be recorded as explicit expected historical failures, not silently omitted or counted as pass.

R1 test failure preserved: the old hard-coded Worker.name diagnostic label still said0.5.6. A strict fake-Worker constructor caught this, so its app-boot assertion failed. Actual browser Worker.name is only a diagnostic label, not protocol validation. R2 derives that label from VERSION; the strict test remains unchanged. No handshake, scheduling or simulation behavior changes.

Local final scope:204 positive Node tests (149 unchanged-functional-source r1 results reconciled to r2,55 directly rerun on r2),10 cohort checks,1500 actual worker/wire/material Canvas outputs across6 routes. The inherited oracle/ownership maximum channel delta remained2, within the existing3 limit; exact-pixel tests stayed exact.64 outlines/62208 ID styles and fixed flow replay/reconstruction also passed. One historical polygon-edge expected failure is separate from positive totals. See regression/FINAL-SUMMARY.json and verify-evidence.mjs for exact source and result reconciliation. Independent cloud should run the unified complete entry on final r2 afresh.
