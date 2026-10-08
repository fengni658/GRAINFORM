# Candidate status: source-only awake projection optimization

This copied candidate has not been run on a GPU. Any verification described in the inherited documentation below applies to its baseline, not this modified candidate. See CANDIDATE-REPORT.md for scope, proof, and local tests.

# 0.4.6 independent float-GPU physics probe, version 2

This is an experimental WebGL2 PBD/Jacobi solver, not a replacement claim for the old serial 64+8 solver. No legacy trajectory equivalence or commercial FPS is claimed. Sleep is deliberately disabled. This directory must not be published or sent to Sites without separate authorization.

## Entry point

```js
import { createGPUWorld } from './gpu-solver.mjs';
const gl = canvas.getContext('webgl2', { antialias: false });
const world = await createGPUWorld(gl, particles, { passes: 64, shock: true });
world.step(120);             // 120 fixed steps submitted; NO readback or finish
world.finish();             // explicit GPU completion barrier, when desired
const result = world.readback({ raw: true, includeBuckets: true }); // explicit QA only
console.log(result.particles, result.diagnostics);
world.dispose();
```

The asynchronous factory loads the seven adjacent GLSL files. `loadShaderSources()` can preload them once. `new GPUWorld(gl, particles, { sources, passes, shock })` is synchronous when a filename-keyed source map is supplied. The world owns the WebGL context state exclusively and does not restore prior state. It does not render. `getGPUState()` exposes resident textures and the `positionEncoding` descriptor for a same-context renderer without readback. Resident position textures are cell-local encoded, so renderers must decode them; they are no longer absolute world XY.

Input particles have `{id,x,y,vx,vy,color,alive,sleep,quiet}`. IDs default to array slot and must be unique; IDs are returned unchanged. GPU bucket order and coincident-pair normals use the stable array slot, not the business ID. Position and velocity must be finite, with initial `abs(vx),abs(vy) <= 60`; unsupported high-speed input is rejected, not clipped. World positions must also fit the exact cell-code range described below; out-of-range input throws before state allocation, including a float32 remainder carry beyond that range. A physically invalid point such as x=20 remains encodable and is reported by the GPU out-of-grid diagnostic. Colors are integers 1–4. `alive` defaults true. Supplied sleep/quiet values are explicitly ignored: output is always `sleep=false, quiet=0`.

## Locked material and solver contract

- Continuous circles: physical radius .875, diameter 1.75, display radius .87
- Left/right boundaries 28/260; floor 420; center wall/floor clamp uses the radius
- One `step()` is 1/120 second and exactly two 1/240-second substeps
- Gravity 240; predicted vertical speed is `min(60, vy + gravity*dt)`
- Raw prediction is `previous + predictedVelocity*dt`; no prediction wall/floor clamp
- Each substep builds the grid once from raw prediction, then runs 16, 32, or 64 Jacobi projection passes; default is 64
- Contact gate `distance < diameter + .004`; zero-distance normal is (-1,0) for the lower array slot and (+1,0) for the higher slot
- The first eight projection iterations use equal awake-neighbor weight .5; subsequent iterations default to `1/(1+exp(separation.y*1.5))`, a height-biased shock weight. Per-neighbor normal displacement is `weight*(diameter+.004-distance)*normal`. `shock: false` retains the equal-weight control
- Tangential friction uses relative substep displacement: `relative=(pi-pi0)-(pj-pj0)`, `tangent=-relative.x*normal.y+relative.y*normal.x`, `friction=clamp(tangent,-.15*error,.15*error)*weight`; its correction is `(normal.y,-normal.x)*friction`
- Each penetrating neighbor contributes `strength=smoothstep(0,.001,error)`. Sum the strengths into contactCount, while preserving the original error-based normal/friction correction; divide total correction by `max(1, contactCount*.75)`, then cap its vector length to .125 per iteration and clamp walls/floor
- Contact strength resets at raw prediction and accumulates as the maximum across all projection iterations. Real wall clamp and floor clamp/resting contact set strength to 1
- Reconstruct velocity using cell-local final-minus-previous displacement divided by dt, then multiply by `1-.25*strength`; floor vx receives another .7 multiplier
- Sleep/anchoring is not enabled. The shader contains the specified sleeping-neighbor weight path but all resident sleep values are zero. Shock settings are explicitly reported in diagnostics and benchmarks

Online `remove(ids)` uploads an ID-to-stable-slot mask and runs a GPU two-target copy/mask pass. It preserves remaining particle position and velocity, negates the removed position code while preserving its position, strength, and stored velocity, and does not splice slots or read GPU state back. Unknown IDs throw; repeat removals are no-ops. A subsequent `step()` rebuilds the grid and solves remaining awake particles, so support removal can produce collapse without a wake dependency. QA must test actual online removal rather than reconstructing a new fixture without its support.

The prior version-1 discrete-contact equal-weight 64-pass CPU support-deletion control failed the unchanged .002 overlap gate with peak .010858473652319844. This is retained as a rejected control, not hidden by loosening the gate. That historical result does not establish version-2 behavior. The version-2 default shock variant must separately pass actual GPU gates; a CPU pass alone is insufficient.

The prototype's CPU oracle is maintained separately. GPU arithmetic is float32; the JavaScript oracle may use doubles. Compare declared physical gates and appropriate numeric tolerances, not bitwise or legacy-trajectory equivalence.

## GPU state and no-conflicting-writes design

All resident state is RGBA32F, nearest sampling, no blending. The original eleven textures are retained; this precision repair adds no textures:

| Texture | RGBA channels |
| --- | --- |
| Position ping-pong | local x, local y, signed cell code, contact strength |
| Velocity ping-pong | vx, vy, sleep=0, quiet=0 |
| Raw prediction | predicted local x/y, signed cell code, strength=0 for live particles |
| Previous position | substep-start local x/y, signed cell code, prior strength |
| Sticky diagnostics ping-pong | max grid drift, overflow hit, out-of-grid hit, nonfinite hit |
| Even/odd bucket atlases | encoded array slot+1, 0, 0, occupied |

Prediction uses two render targets to store raw prediction and previous position. Each Jacobi fragment writes only its own particle position and own diagnostic texel, never a neighbor's texel. Projection reads the previous whole-particle iterate. Velocity reconstruction writes to a separate velocity target. `step()` does not run `readPixels`, `finish`, CPU collision solving, or CPU grid building.

`EXT_color_buffer_float` is required. Float blending is not needed: blending is disabled. The solver requires two float render targets, seven fragment texture units, and a DEPTH_COMPONENT24 bucket buffer. Unsupported capability or context loss throws explicitly; there is no silent CPU fallback.

## Stable GPU grid and invalidity proof

Grid origin is (28,-16), cell size 4, dimensions 58×110; this includes padding below floor 420. Bucket formation uses point rendering and depth `LESS`, selecting increasing encoded array slots. Layers alternate between two textures, so the current render target is never sampled. Each atlas is 58×990. Slot 0–15 are contact candidates and slot 16 is an explicit seventeenth-particle overflow witness. Query traversal is dy outer, dx inner, then increasing slot.

Queries always use the fixed raw-prediction cell, not the particle's moving projected position. The 3×3-cell proof needs every particle's displacement from its own raw prediction to remain at most 1. Two nonadjacent cells are at least 4 apart along one axis; after at most 1 displacement for each particle, remaining separation is at least 2, greater than contact target 1.754. Every projection pass updates a sticky maximum drift. A drift above 1 invalidates the output. Overflow, out-of-grid prediction, or nonfinite state also invalidates the output; none is silently treated as a valid approximate solve.

The solver continues submitting GPU work after invalidity because `step()` cannot know GPU state without a readback. QA must inspect diagnostics and reject invalid runs. Sticky flags survive subsequent passes and substeps; a later benign state cannot erase an earlier failure. `world.diagnostics` is explicitly `status: 'unread'` with `invalid: null` before QA reads it, and `pendingGPUReadback: true` when a cached measurement is stale.

## Validation and honest timing

Run the local, non-GPU API contract check:

```sh
node --check gpu-solver.mjs
node tests/gpu-contract.mjs
```

This uses a strict mock to check cell-code upload/readback and range rejection, pipeline orchestration, 17-layer peeling submission, no active-sampler/framebuffer feedback, supported iteration counts, rejected input, and no readback/completion barrier inside step. Passing it does not prove GLSL compiles or that GPU physics is correct.

In the separately authorized real-browser QA environment:

```js
const { runGPUShaderContract } = await import('./tests/gpu-contract-browser.mjs');
const result = await runGPUShaderContract(gl);
```

This compiles actual shaders and verifies float framebuffer/readback, depth-peeled stable slot ordering for every grid cell, pair separation, local-cell carries, near-contact freefall without false terminal velocity, resting floor damping, sticky seventeenth-particle overflow, out-of-grid, drift invalidity, and actual online bottom-support deletion followed by survivor collapse. Broader CPU-oracle pair/stack/crowded/side/grid-edge fixture runs remain separate, as do visual/material quality and scale tests. No local headless-browser or security-flag workaround is part of this prototype.

`benchmark({steps,warmup})` performs a fixed number of simulation steps with `gl.finish()` before and after the timed region. It separately reports CPU submission time and completed-work wall time. Completed steps/second includes driver and synchronization overhead, is hardware/browser dependent, and is not display FPS. It does not include readback. Report renderer/environment and physical quality/invalidity gates alongside timing; do not use submission speed alone as a GPU performance claim.

## Version-2 position encoding and readback

Every resident position tuple is `(localX, localY, signedCellCode, contactStrength)`. Local XY is canonical in `[0,4)`. For a valid cell:

```text
code = (cellY + 1024) * 256 + (cellX + 128) + 1
packed = abs(signedCellCode) - 1
cellX = packed % 256 - 128
cellY = floor(packed / 256) - 1024
world = (28,-16) + 4 * cell + local
```

Valid cellX is -128 through 127, cellY is -1024 through 64511, and code must be strictly less than 2^24. Thus the final pair `(127,64511)` is excluded. Positive codes are live; negative codes preserve removed positions; zero is padding. Input is explicitly rejected outside this range rather than wrapping. Runtime movement outside the encoding range writes the reserved positive sentinel 2^24 and sets sticky out-of-grid invalidity; readback decodes its XY to NaN, never a different cell. No simulation may treat that result as valid.

Prediction adds velocity*dt to local coordinates and carries complete cells. Projection carries its local correction, then uses exact center boundaries: left cellX=0/localX=.875, right cellX=57/localX=3.125, floor cellY=108/localY=3.125. There is no physical top wall. Pair separation, relative displacement/friction, velocity reconstruction, and drift use `(localA-localB)+4*(cellA-cellB)`. They never first reconstruct large world float32 positions. Bucket cells are decoded directly. Every sampler retains explicit highp precision.

- `GPU_CONTRACT.contactActivationDepth` is .001; the project uniform is `uContactActivationDepth`.
- `POSITION_ENCODING` is exported and available as `GPU_CONTRACT.positionEncoding` and `getGPUState().positionEncoding`. `getGPUState()` also exposes `previousPositionTexture`.
- `encodeGPUPosition(x,y,alive=true,contactStrength=0)` returns one Float32Array tuple. `decodeGPUPositions(tuples)` returns decoded Float64Array tuples `(worldX,worldY,alive01,strength)` using JavaScript double precision. Zero padding remains a zero tuple.
- `readback().particles` keeps world XY and adds numeric `contactStrength`; compatibility `touched` is `contactStrength>0`. Sleep remains false and quiet remains 0.
- `readback({raw:true})` returns `raw.positions`, `raw.gridPositions`, and `raw.previousPositions` as decoded Float64Array values. `raw.positionEncoding` explicitly says `decoded-world-xy-alive-strength`; w is strength, not a Boolean.
- The same readback also returns `rawEncoded` containing the actual Float32Array RGBA32F position/grid/previous data and the resident `positionEncoding` descriptor. `readback({rawEncoded:true})` obtains these encoded arrays without the decoded raw arrays. Velocity and diagnostic arrays remain Float32Array.
- Immediate `remove(ids)` changes only the selected position-code signs. Stable slots, both position channels, strength, and stored velocity are preserved. Subsequent velocity passes may zero dead-slot velocity. Repeat removal remains a no-op.

The precision repair addresses the earlier absolute-F32 threshold problem: near y=420 a tiny gap rounding error could turn contact on and apply a discrete 25% velocity loss at every substep. Local storage preserves small displacement; continuous strength makes that damping approach zero with contact error. This is an independent version-2 Jacobi material model, not an old Gauss–Seidel trajectory reproduction. Geometry tolerance stays .002, time stays 1/120 with two substeps, and no particles are dropped to improve a gate. Long crowded trajectories can diverge from a double oracle; this version does not claim all earlier trajectory tolerance checks pass.

Additional local checks:

```sh
node --test tests/gpu-contract*.test.mjs tests/sampler-precision.test.mjs
```

These exercise all 58×110 normal cells, signed deletion codes, precision near the floor, packing endpoints, input rejection, API layout, shader source invariants, and mock orchestration. They do not compile GLSL or substitute for authorized real-browser GPU validation.
