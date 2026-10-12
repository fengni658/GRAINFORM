# 056 lifecycle stability coverage

`lifecycle-stability.test.mjs` adds 16 bounded behavioral tests to the seven
inherited startup-visibility tests. Run with:

    node --expose-gc --test --test-reporter=tap --test-concurrency=1 tests/lifecycle-stability.test.mjs

The tests execute production app code, production worker runtime, transferred
snapshot-wire packets, and native Canvas. The event loop, worker scheduling,
DOM nodes, focus bookkeeping, and page events are deterministic doubles. This
does not establish actual browser background-tab, native focus-trap, or BFCache
behavior. Only a real browser can establish those platform properties.

## New cases

1. Frozen 055 hotfix negative control: blur loses pending start/resume/restart.
2–4. Each corresponding 056 command stays paused, drains requests, excludes
paused time, survives pageshow without automatic resume, and resumes explicitly.
5. Frozen 055 hotfix negative control: settings opened during restart leaves
the simulation running behind the dialog.
6. Settings during start/resume/restart pauses the worker and blocks keyboard
input; cancel leaves the round paused.
7. Real HTML-derived dialog/close/touch selectors register all relevant handlers;
held input releases, only one modal opens, close/cancel never resumes, and focus
returns to the trigger after a temporarily disabled trigger becomes enabled.
8. Frozen 055 hotfix negative control: an earlier resume ACK thaws presentation
despite a later pause request.
9. The corrected resume ACK cannot thaw a newer dialog/hidden pause request.
10. A real prior pause snapshot still in transport, followed by restart and
blur/settings, cannot erase the new pause intent. Old-epoch rejection is retained
and the pause reaches the adopted epoch.
11–12. Blur after start/restart ACK but before the corresponding playing/full
snapshot still pauses the worker.
13. A same-epoch old paused snapshot cannot erase resume-then-blur intent.
14. A terminal over ACK ends a late pause request without masking game-over UI.
15. Repeated ready-page blur/settings requests coalesce, drain, and never start
the game or clock.
16. A normal confirmed restart starts playing and does not inherit an obsolete
confirmation-dialog pause.

The previous 055 startup baseline is read from `../reference-pre-hotfix/`; the
frozen 055 hotfix baseline is read from `../baseline/`. Both are package-local.
The tested app's own geometry module supplies its version. The renderer and
worker used by the harness are the candidate modules, whose bytes are required
by the package runner to remain identical to the hotfix baseline.

The inherited renderer tests already verify that paused material remains
unacknowledged until an actual successful final draw, and that renderer/preview
failures cannot issue presentation receipts. Lifecycle code does not replace or
relax these existing ACK tests. No production file is written by this suite.
