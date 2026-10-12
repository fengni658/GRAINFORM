See ../REPORT.md and lifecycle-stability.test.mjs for the 16 new lifecycle cases; the seven retained hotfix controls use reference-pre-hotfix while new failures use baseline (055 hotfix).

# 056 lifecycle verification

Run from any directory:

    node /path/to/grain056-candidate/tests/run.mjs

Requires Node.js and the standard registry package `@napi-rs/canvas` (version recorded in `evidence/test-results.json`). No browser, network, repository checkout, or other review directories are required. All fixture/source dependencies are within this hotfix directory; only the installed native-canvas package is external.

The runner uses fresh serial processes, explicit garbage collection and 90-second per-file timeouts. It verifies 18 candidate and 18 baseline files, checks the 15 non-app/non-version files match, hashes sources before and after, and writes TAP logs and a JSON result under `evidence/`.

## New tests (7)

`real-worker-boot-harness.mjs` adapts the prior legend boot harness to execute the actual application and actual `createSimulationRuntime`, with encoded/transferred production snapshot messages, queued delivery to the main-thread handler and real native Canvas rendering resources. The DOM, page lifecycle events, animation clock, worker dispatch and timer scheduling remain controlled doubles. This is not a real browser or a claim that the user's screenshot was definitely caused by this race.

1. Baseline negative control: hidden init; visible event posted at epoch 0 before epoch 1 full snapshot delivery; start stays paused and explicit resume is refused, with zero simulation ticks.
2. Hotfix receives current visibility after full epoch adoption; start is playing, simulation ticks advance, pause/resume succeeds and pending commands drain.
3. Explicit resume repairs a stale hidden flag following pagehide; later hide/show leaves the game paused until explicit resume.
4. Resume while document.hidden is refused without worker communication; hidden restart stays paused, and visible return does not auto-resume.
5. Stale worker visibility/commands and stale main-thread visibility acknowledgements cannot affect the restarted round. An explicit snapshot is requested after restart because its initial full snapshot is intentionally captured before game.start; the ordinary subsequent snapshot is not driven by automatic timers in this harness.
6. Two hundred repeated visibility/pageshow messages produce exactly two hundred responses; same-epoch full resync produces no extra visibility feedback; queues drain.
7. A fresh app/worker boot has independent epoch and visibility after the previous hidden worker is disposed. This is a reload-equivalent new boot, not in-place replacement testing.

## Inherited app regressions (13)

The four inherited app suites retain their assertions with only import/fixture paths repointed. The native canvas resource helper and required legacy preview fixture and palette oracle are byte copies from the prior review. The inherited legend harness retains its inert worker; the new real-worker harness is separate. Coverage includes preview recovery, independent preview pixels, app paint stages and six-color behavior. These inherited tests are native Canvas and DOM/source harness coverage, not browser evidence.

No product code is changed by these tests.
