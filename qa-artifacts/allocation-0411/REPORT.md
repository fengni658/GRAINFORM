# 0.4.11 allocation-only candidate

Status: local review candidate, NOT uploaded or deployed. Browser performance acceptance remains unresolved.

## Change
Only `candidate/ca-adapter.mjs` changed versus frozen phone-board build b-c09a9ea6b2fe85a5f439a6e9424da32ffa62a1a53c10f4f4008ae2e274f45b82. `sync()` scans typed arrays in the same live-slot order and allocates body objects only when the original comparison detects a change. It retains the existing present-ID Set, deletion sweep, body property order, cache/patch ordering, sleep logic, batch-only legacy behavior, and revision semantics. It does not change physics, material paths, grain size, clear barriers, publication, ACKs, rendering or UI.

Build: b-ab4e880d36685de4fb4983db6ad34295658bdb44c46defce0fae2c7427506065.
See MANIFEST.json (11 runtime files and 14 local module edges), allocation-sync.patch, and the content-addressed dist directory. Frozen 0411/source 0410 and main were not edited.

## Tests
- 6 new sync-equivalence tests passed, including 4 natural pieces with exact JSON frame/patch/path comparison; additions/deletions; sparse slots and generation reuse; stable cache order; sleep/wake; typed-array fields and batch-only behavior; clear barriers, post-clear reuse and restart.
- 23 inherited queue-continuity tests and 10 phone-board geometry tests passed (33 total).
- Portable-baseline reruns also passed: 6 equivalence and 23 queue tests, with their separate logs retained.
- Logs are in evidence/. No new test failure occurred. Original high-pile capacity-assumption FAIL log is retained unchanged; the historical failure was not discarded or turned into a performance pass.
- Geometry tests are model/source tests, not native-phone/DPR browser evidence.

## Measurements, including non-improvement
Initial small Node probe: seed2026, four pieces, 240 control steps, 937 material steps, 9216 final grains; sequential correct material ACKs; complete frame hashing outside timed step/sync scopes. Raw CPU profiles and original probe are in evidence/initial-profiling; MEASUREMENTS.json preserves all eight measured cases. Timings are shared-cloud elapsed times and include noise.

With CPU profiling, old0410 sync was 1332 -> 768 ms and step 3164 -> 2411 ms. New0411 sync was 817 -> 623 ms, but step was 2047 -> 2097 ms: total step did NOT improve in that pair. Unprofiled new0411 reverse-order cases: original sync 1049/944 ms and step 2580/2411 ms; direct-scan sync 838/701 ms and step 2486/2248 ms. No total-frame or browser speedup is claimed. SHA-256 of every serialized frame matched within each version for original vs direct scan; versions differ in geometry as expected.

## Prior browser evidence and remaining gate
Pre-change actual cloud-browser QA evidence is retained in evidence/browser-before. Existing QA samples show severe debt and subsequent recovery; old/new samples are unmatched. Parent's ordinary-mode observation additionally reports slowdown at three pieces and again at nine pieces after about 65 seconds, so QA overhead alone cannot explain the problem. This candidate has NOT yet had actual browser validation.

Next: root review, then same-condition ordinary-mode and QA-mode real UI/DOM checks on a separately authorized staging build. Keep path/presentation/clear semantics unchanged, compare fresh page loads and matched stages, retain unfavorable results. Node timing cannot substitute for this gate.

## Reproduction
node --test grain0411-allocation-candidate/validation/sync-equivalence.test.mjs
node --test grain0411-allocation-candidate/validation/inherited-queue-continuity.test.mjs grain0411-allocation-candidate/validation/phone-board.test.mjs
python grain0411-allocation-candidate/validation/package-local.py

The initial profiling probe deliberately references the frozen pre-change 0411 source and old baseline; its in-memory direct-scan branch reproduces the initial comparison without modifying either source tree.
