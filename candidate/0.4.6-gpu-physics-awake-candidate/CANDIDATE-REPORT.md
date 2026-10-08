# Awake-only projection candidate: source-verified, GPU-unmeasured

## Scope and status

This is one bounded optimization of the verified `grainform-gpu-physics-contact-fix` v2 source, copied into `grainform-gpu-physics-awake-candidate`. The frozen baseline was not modified. The only production files changed are `gpu-solver.mjs` and `shaders/project.frag.glsl`. The portable production patch is `awake-only.patch`.

The candidate passed 22 local Node tests. This includes mock WebGL orchestration, source-equivalence and writer-invariant checks, and the inherited CPU/reference precision and physical-harness checks. No actual GPU shader compilation, execution, performance benchmark, browser fallback, or deployment was performed for this candidate. Its baseline's GPU verification does not automatically apply to the candidate.

## The single optimization

Remove the sleeping-neighbor velocity texture read and its two conditional selections from the projection contact loop, then remove the corresponding host-side projection sampler binding. The surviving arithmetic and ordering are unchanged: the current dynamic/shock weight is used directly, and the neighbor's previous displacement is always subtracted. Prediction and removal still bind/read velocity normally.

The explicit `GPU_KERNEL_INVARIANTS` contract says `allActive: true`. Here, allActive means every alive particle is awake; removed/dead slots are still retained and excluded normally. It does not mean dead particles are made alive.

## Why the specialization is valid

For stock shader sources and solver-managed state:

1. Constructor normalization has always produced `sleep=false, quiet=0`; velocity uploads are `[vx,vy,0,0]`, and other velocity storage is zero initialized.
2. The velocity reconstruction shader writes either `vec4(0.0)` or `vec4(v,0.0,0.0)` on every output path.
3. Removal copies the existing velocity tuple, preserving its zero z/w channels.
4. Prediction and projection do not write velocity storage. The only current-velocity assignments select the initialized pair, reconstruction output, or removal output.

By induction, velocity.z is zero for every reachable solver-owned state. The original `texelFetch(uVelocity, otherAt, 0).z > .5` is false, so both removed conditional selections always select the exact expressions now used by the candidate.

`tests/gpu-contract-awake.test.mjs` verifies that the entire candidate projection shader is byte-for-byte the baseline after only this proven substitution and a restriction comment. It also checks all stock velocity writers, frozen allActive metadata, unchanged material/encoding constants, unchanged bucket/prediction/velocity/removal shaders, and the exact permitted host-source substitutions.

## Explicit restrictions and future sleep gate

- Input `sleep` must be omitted or exactly false. Input `quiet` must be omitted or exactly 0. Other values are rejected by the constructor rather than silently accepted.
- A future `GPU_CONTRACT.sleepImplemented=true`, or disabling the declared allActive invariant, makes construction throw with an instruction to restore the general sleeping-neighbor kernel.
- Before enabling real sleep, restore both the sleeping-neighbor weight and the sleeping-neighbor relative-displacement branch, and revalidate support/wake behavior. The allActive source tests must be replaced with the appropriate sleep-aware proof and GPU tests.
- Returned GPU texture handles are read-only rendering views under this API contract. External writes to velocity textures are unsupported and invalidate the proof. This is a documented ownership restriction, not a claim that WebGL can technically prevent writes through an exposed handle.
- `options.sources` is supported only for preloading the unchanged stock shader files in this candidate. Custom shaders that change velocity writers are outside this specialization's contract; this candidate does not claim to sandbox or hash-enforce arbitrary externally supplied shader source at runtime.

## Preserved behavior and hard gates

The particle set, IDs, colors, alive/removal representation, signed cell-local highp encoding, radius, contact target/activation, tangential friction, shock schedule, gravity, dt, two substeps, iteration counts, wall/floor logic, depth peeling, 16+1 bucket capacity, fixed-grid query, and sticky overflow/out-of-grid/nonfinite/drift invalidity are unchanged. The solver still has no CPU readback in step, no CPU collision fallback, and no skipped passes. The existing conservative seven-fragment-unit constructor capability gate is deliberately unchanged even though projection now declares six samplers.

## Expected saved source-level work, not measured speed

- One neighbor-velocity texelFetch is removed for each actual contact evaluation that reaches the projection correction path. If a run has C such evaluations, the source issues C fewer such fetches; this does not establish memory-bus bytes saved because cache/compiler behavior is unmeasured.
- One sleep comparison and two conditional selections disappear from that contact path. Whether the old compiler emitted branches, selects, or another sequence is not known.
- Projection has six sampler uniforms instead of seven. One activeTexture, bindTexture, and uniform1i call are removed per projection pass. At 64 passes and two substeps, that is 128 fewer sampler-binding groups, or 384 fewer such host GL API calls per fixed step. GPU draw/pass counts remain 166 per fixed step.

There is no measured GPU speedup, completed-step throughput, display FPS, hardware certification, or proof of visual equivalence from this local test run. Separate authorized GPU A/B execution must verify actual compilation, outputs/diagnostics, and completed-work timing before accepting a performance benefit.

## Artifacts and reproducibility

- `awake-only.patch`: production-only diff against baseline
- `baseline-core/`: immutable copies of the two affected baseline files, used by substitution tests
- `CANDIDATE-MANIFEST.json`: baseline and candidate hashes, source scope, and explicit unmeasured flags
- `tests/gpu-contract-awake.test.mjs`: invariant and exact-substitution tests
- `tests/gpu-contract.mjs`: existing strict mock now also checks removed projection sampler binds and rejected sleeping/quiet inputs
- `evidence/awake-candidate-node-tests.log`: complete 22/22 local test output
- `evidence/awake-candidate-source-verification.json`: baseline immutability and production diff verification

Run `node --check gpu-solver.mjs` and `npm test` from this candidate directory. These commands do not run a GPU or browser.
