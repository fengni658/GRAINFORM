# 059 keyboard-focus scope regression

This suite loads the current candidate's actual app, simulation runtime, wire decoder, material renderer, and native Canvas. The complete 056 module and HTML snapshot in fixtures/056 is an independent, package-local negative control. No test edits production code.

The DOM tree is a controlled double. It implements the exact selector subset needed by the app, ancestor closest(), inherited isContentEditable (including false islands), explicit focus, cancellable events, and explicit Enter/Space button-default action models. It does not implement a browser layout engine, trusted keyboard events, native tab order, modal focus trapping, or native click synthesis. Passing these tests is not proof of native browser keyboard behavior.

Run serially after dependencies are available:

    node --expose-gc --test --test-concurrency=1 tests/focus-scope.test.mjs

If the environment installs @napi-rs/canvas in a shared dependency location, supply its existing node_modules directory in NODE_PATH rather than changing production dependencies.

Final browser gate (still required): actual Tab/focus then Enter and Space on help/settings/start/again and all five touch buttons; link Enter navigation and native Space behavior; QA summary Enter/Space; canvas Enter/start/restart, arrows/WASD, Space, P/Escape; a modal open/close and held-key focus transition. Confirm command counts without replacing native key activation with direct click calls. Check narrow viewports separately.

## Recorded run

12/12 tests passed in a serial native run. The first pass was 8/11: three lifecycle assertions read the new epoch's initial ready snapshot before the controlled scheduler executed its next callback. A trace established app=ready, runtime=playing, no queued messages or pending controls, and one pending runtime timer. Tests now explicitly advance the real runtime clock by 50 ms when the app/runtime control state differs, then assert convergence. This changes only test scheduling. The initial failure log is retained as focus-scope.initial.tap; the latest result is focus-scope.tap.
