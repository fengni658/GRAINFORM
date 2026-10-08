#0.4.6 bounded GPU scale gates

Additional QA files only. Do not change the already verified local-coordinate/continuous-contact solver. Place this folder as `scale/` beneath the existing GPU probe server root, or serve it with that solver available separately.

Required core manifest:991c1d0af503ea4d3bec0f7eac4315fa2b0f3a8a39dc7dfd83fb6627acc9f830. Published core confirmation:06f41d (use the full verified commit supplied by the coordinator, not this abbreviation as a fetch selector).

## Order

1. Import `runGeometryGate` and `runCompletedCost` from `scale/gates.mjs`. Reuse `createGPUWorld` from the verified solver and its `fixture('crowded')`144-body input.
2.144 scene: request600 fixed steps,64 passes. Read real state and run the independent x-sweep oracle at every step. Stop immediately on quality failure, any single completed step over5000ms or total observed window over60000ms. A budget stop is an incomplete window, not a passed long run.
3. After the preceding quality gate, load `scale/fixtures/actual-4056-t8.json`. This preserves every original live particle's ID/position/velocity/color. It is a continuation of a saved real6-piece state, with all4056 intentionally awakened; NOT a fresh GPU game replay or a test of sleep.
4. Run3 steps with per-step readback/audit. Only if quality passes, separately request up to12 completed-work cost samples from the same saved initial state. That timing run has final-state geometry only, not per-step certification. Keep the first-in-world sample distinct from later samples; do not call the first one globally cold if earlier scenes warmed the driver.
5. Only after64-pass quality is established, one32-pass candidate may be tested from the same initial state, with identical geometry gates. A speed gain never relaxes correctness. No16-pass sweep is authorized by this plan.

## Hard stops and reporting

- Nonfinite state, repeated IDs, overflow, out-of-domain position, grid drift>1, circle overlap or wall error>.002, or any slot/alive/color change: stop and report failure.
- Fence timeout: stop with exception; do not invent completed steps. No dangerous graphics flags or alternative blocked-browser route.
- Geometry uses an independent sorted-x candidate sweep, not the GPU buckets/capacity. Color and identity are checked against original inputs.
- Energy, maximum speed, center of mass and bounds are recorded as physical diagnostics. They are not yet a complete macro/energy acceptance rule. Unexpected growth must be investigated, not relabeled as a geometry pass.
- Every depth-peeling, prediction, projection and velocity pass is inside step submission. Completion wall includes JS submission, driver queue and fence polling. Readback and CPU audit are reported separately and included in total observed wall. This is not a GPU timestamp or presented FPS.
- Software SwiftShader results are capability/complexity evidence only. Hardware GPU and full-game/UI timing remain separate unpassed gates.

Reproduce independent oracle checks with `node --test scale/oracle.test.mjs`.
