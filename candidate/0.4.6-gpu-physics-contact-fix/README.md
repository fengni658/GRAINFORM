# GRAINFORM0.4.6 GPU physics candidate2: local coordinates + continuous contacts

A bounded new parallel circle solver prototype, not the released game or a claim of commercial/hardware performance.0.4.5, the original exact WASM checkpoint and the failed first GPU probe remain preserved.

## Run and independent browser gates

`npm test`; `npm start` (port4177), open `/`.

1. Actual GLSL/texture/bucket/encoding gates: import `tests/gpu-contract-browser.mjs` and run `runGPUShaderContract(gl)` in the authorized cloud browser.
2. `window.__GPU_PHYSICS_QA.runAnalytical({steps:120})`: independent discrete-gravity freefall oracle, unchanged0.01 position/0.5 velocity limits, geometry0.002 and no positive energy drift above initial+0.001 in unconstrained unit-mass fall.
3. `runRemoval()`: actual live support deletion, stable IDs, remaining particles fall, unchanged geometry and analytic/simple long-trajectory comparison gates.
4. `runLocalConsistency('crowded',{steps:10})` and `runLocalConsistency('side',{steps:10})`: each step begins CPU oracles from the SAME real GPU input, checking local implementation error, finite state, identities and geometry. One oracle uses Float64; the other rounds texture storage to local-coordinate Float32 with Float64 intermediates. It is not a universal full-F32 arithmetic oracle or bit-equivalence claim.
5. After those gates pass, separately examine longer144-grain aggregate settling, geometry at every step, energy/max-speed history and dense hardware throughput. These later gates are not completed by the small probe.

`runCase` retains the old free-running pointwise comparison, including its original pass/fail result. A failure there is never relabeled a pass by the new local test. Chaotic multi-step grain trajectories are not claimed identical across precision or to the old serial solver.

## Evidence and changes

First GPU probe, commit ffc70213a4b7bcea27b2888fc8003d06d82f3879, passed shader/grid/identity/geometry micro checks but FAILED support-removal numeric comparison: final position delta0.80517578125, velocity delta2.9937741756. Float32 texture quantization put resting gaps just below1.754 and triggered the binary25% whole-grain damping, creating artificial common-motion drag. That failure is preserved.

This candidate smooths contact activation over correction depth0..0.001: s=3u²−2u³. Damping becomes1−0.25s; Jacobi normalization sums activation rather than adding a discontinuous1 for an arbitrarily tiny contact. Full actual contacts keep the prior maximum damping. Geometry, radius, quantity, time step and overlap gate are unchanged.

Position RGBA stores local x/y within a4-unit cell, an exact signed cell code and contact strength. Particles remain continuously positioned and collide as circles; they are NOT snapped to a lattice. Pair differences, friction, drift and velocity reconstruction operate on small local differences plus integer cell differences, avoiding subtracting two rounded coordinates near420. Encoding fits existing textures. Highp samplers remain mandatory. GPU readback returns decoded Float64 world positions and exposes the actual encoded Float32 bytes separately.

CPU storage-quantization diagnostics now pass freefall, boundary pair,16-stack and original removal120-step directed cases under the original numeric limits.144-grain long pointwise trajectories still diverge; those results are retained, not promoted to equivalence. Real second-candidate GLSL and GPU numeric gates remain pending until separately reported.

## Scope

R=.875 collision, R=.870 visual, four colors, fixed1/120 time with two substeps, selected64 passes and height bias after8 passes. Depth-peeling grid has16 IDs plus17th overflow sentinel. Overflow/domain/nonfinite/drift>1 are explicit invalid results, never silent particle reduction. Input velocity components are bounded by60 for this prototype. Sleep is NOT implemented in this GPU candidate.

Visible canvases inspect actual GPU readback and CPU state, not optimized rendering. Submission time is not completed GPU time or FPS. All peeling and solver passes and completion latency count toward later performance measurements. SwiftShader is software and cannot certify desktop GPU performance.
