# Actual 4056 grid rebuild vs guarded rank: bounded AB/BA harness

This is an independent benchmark harness, not a physics-core release. The frozen `grainform-gpu-physics-contact-fix` core and shaders are copied byte-for-byte into `vendor/core`; the awake optimization is not included. The previously GPU-validated rank prototype is copied into `vendor/rank`. Only three timing marks/fields are inserted in its JavaScript host code, verified by an exact source-substitution test. Its shaders, eligibility logic and numerical/control paths are unchanged.

No browser, GPU run or speed measurement was performed while developing this harness. Local test times are Node tests only. This file describes the experiment to execute in the separately authorized cloud QA environment.

## Fixed workload and bounded scope

Input is the unchanged `actual-4056-t8.json`, SHA-256 `024a9306922b746d5a34e608a1ca8b62d933427f4752a7a6d39c36c2bb62e793`. The file preserves the actual 0.4.5 six-piece state at 8 seconds, not a synthetic fresh GPU gameplay replay. All 4056 live particles, stable array slots, business IDs and four colors remain present.

The harness makes exactly one normal `core.step(1)` call at 64 passes with shock enabled. In this independent harness only, a temporary instance `_substep` wrapper calls the original method and then performs `readback({raw:true,includeBuckets:true})` after each of the two real substeps. It records the real RGBA32F `gridPositions` predictions and the corresponding GPU-generated bucket atlases. The wrapper is restored in `finally`. It never replaces prediction, forces velocities, edits particle geometry, invents a migration, or enters the frozen core source.

The actual adjacent predictions must pass whole-round old-bucket validity, stable identity/alive count and strict per-axis anchor movement below 4. The proof uses the captured Float32 local components plus integer cell differences directly. The current CPU ingress must also round-trip to exactly the captured Float32 anchor arrays. Failure stops the experiment; a nearby or artificially reduced workload is not substituted. Both captured bucket snapshots are checked against the independent oracle as a separately reported preparation check.

There are at most four measured bucket builds, in two groups: A then B, followed by B then A. Each B uses a separately initialized object seeded from the same old GPU snapshot. Initial old atlases are uploaded from the actual captured GPU result; no CPU-generated oracle buckets are uploaded and no extra initialization peel is executed. One true physics preparation step naturally contains its own two bucket builds; those belong to preparation, not the four measured samples.

No geometry, overlap, material, gameplay or rendering-quality claim is made by this benchmark. Exact bucket identities, all 108,460 slots, overflow/invalid diagnostics and preserved particle counts remain mandatory quality gates.

## Timing boundaries and source asymmetry

The following setup is outside measured A/B sample intervals and is reported separately:

- Fixture/shader fetch and fixture hash verification
- Core compile/link and resource initialization
- The one physics preparation step, including each observation readback
- Shared source validity/oracle checks
- Each rank object's compile/resource/old-GPU-snapshot upload and validation
- A final readback confirming the baseline's resident new-anchor texture is still the captured source

A uses the frozen original core `_buildBuckets()` and its existing resident next-prediction texture. Its sample timer starts before the same CPU canonical-input convention used by B, then includes state setup, all 17 peel draws, both completed float atlas readbacks, output decoding, and the final exact oracle.

B uses the current complete `advance(nextRecords)` path. Its sample timer includes CPU canonicalization, actual old-anchor/bucket readbacks and whole-round qualification, the new-anchor packing/upload, rank draw and required intermediate readback, both parity scatter draws, final atlas readbacks, output validation/adoption and final exact oracle. No required guard or intermediate readback is subtracted.

B's next-anchor upload component is timed separately but remains included in its total. That component is the host-call elapsed time, including packing/allocation and texSubImage2D; it is not an isolated GPU bandwidth measurement. Any deferred GPU upload work remains covered by the synchronized end-to-end interval.

For both paths, exactly one final `directSortGrid` plus `compareGridToOracle` is measured in `finalOracleMs`. Reports provide both `endToEndMsIncludingFinalOracle` and `completedPathMsExcludingFinalOracle`. Only this same-class final oracle is subtracted in the latter metric. Source preparation checks and object-initialization checks are separately disclosed, not hidden in one path's measured loop.

Both paths finish their GPU work through actual RGBA32F readPixels before the final CPU oracle. A submission-only number is not the performance result. A's CPU bucket submission duration is included only as a component, not a substitute for completed-work timing.

This is explicitly NOT a pure shader-algorithm comparison: A consumes GPU-resident new anchors, while B's current API has an additional CPU ingress/upload and mandatory GPU-to-CPU guards. Those implementation differences are prominently reported and retained as real current-path cost.

## Cold work, limits, and interpretation

GLSL compile/link and initialization occur outside the sample timers. There are no extra warmup builds. A has already been exercised by the real preparation step; B's first measured use may still incur driver/backend first-use work despite compile/link completing. Both order-specific pairs are reported; two samples per path do not establish statistical confidence or general performance.

The limits are a five-second soft budget for each two-build group and a sixty-second total soft budget. Checks occur before and after synchronous operations; WebGL readback or another synchronous driver call cannot be forcibly interrupted. Once a limit, qualification failure or quality failure is observed, no further sample is submitted. The page permits one explicit run and never auto-retries, lengthens the sequence, sweeps sizes or starts a pressure run.

If B does not show lower completed total-path cost in both bounded pairs, the report says to stop this guarded-rank version here. A favorable bounded result remains a limited observation, not permission to integrate it into gameplay. Renderer strings are preserved; software rendering cannot predict a user's hardware GPU or commercial FPS.

## Run and handoff

- `npm test` checks fixed source hashes, timing-only instrumentation, fixture identity, strict movement proof, shared oracle, bounded schedule and public serving. It does not run a GPU.
- `npm start` serves only `PUBLIC-MANIFEST.json`'s allowlisted files at port 4179 by default.
- Browser button: explicitly run one bounded AB/BA.
- Browser API: `await window.__GRID_RANK_ABBA.runABBA()`; inspect `.last`, `.capability`, `.started`, `.running`.
- Default state: no benchmark has run.

`SOURCE-LOCK.json` records the frozen inputs. `PUBLIC-MANIFEST.json` records exact browser source hashes. The server rejects source snapshots, Node test/evidence files and arbitrary paths. This local allowlist is not a publication or Sites deployment.
