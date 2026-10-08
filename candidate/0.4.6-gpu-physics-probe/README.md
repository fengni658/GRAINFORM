# GRAINFORM0.4.6 GPU physics small prototype

Not a finished game, release, hardware-performance result or commercial-quality certification.0.4.5 and the exact WASM checkpoint remain unchanged.

Run `npm start`, port4177. Open `/`. No dependencies required. Browser API: `window.__GPU_PHYSICS_QA.runCase('pair',{steps:10,passes:64})`, `runSmallSuite()`, `runOverflow(17)`, `runRemoval()`.

## Current gate

WebGL2 RGBA32F ping-pong computes actual continuous circle positions. R=.875, visual octagonR=.870, four colors, no particle count reduction. Fixed world timestep1/120 with2 substeps. The parallel Jacobi solver differs from the original serial Gauss-Seidel/PBD; no trajectory equivalence is asserted.

This stage accepts finite initial velocities with each component <=60 in magnitude. It is not the old600-speed API replacement. Normal game births and the previous60 vertical terminal speed lie within this initial range. All particles are active: sleepImplemented=false. Sleeping and anchored wake behavior remain a later explicit gate, not a completed feature.

Spatial grid: origin(28,-16), cell4,58×110.16 stored IDs per bucket plus17th overflow sentinel; IDs are ordered by array slot. It never certifies a result with overflow, out-of-domain coordinates, nonfinite state or >1 unit drift from the frozen predicted grid.3×3 query coverage is conservative while each endpoint's total drift remains <=1: original cells separated by two or more along an axis have center distance >=4; after both drift they remain >=2, larger than contact distance1.754.

CPU reference uses Float64; GLSL state uses Float32. Reports retain raw position and velocity differences. Initial small-scene comparison gates are0.01 position and0.5 velocity; these are not universal long-trajectory error guarantees. Independently, actual circle overlap and wall escape must remain <=0.002 and identity/color/particle count must match. A rounded0 is never substituted for the raw maximum.

## Validation and performance scope

CPU fixtures: two-circle impact,16-circle vertical stack,144-circle close-packed pile, side fall and grid-boundary contact. The equal-weight variant fails the16-stack live support-removal transient gate (peak overlap0.010858); its result is retained. The selected CPU/GPU candidate uses first8 equal-weight passes and remaining height-biased passes (shock=true), which produced0 peak overlap in that120-step CPU case. This is a numerical model choice, not the old serial solver trajectory. Node results do not prove actual shader correctness. The cloud browser must compile shaders and read real GPU texture state at checkpoints before any scale test.

The two visible canvases draw GPU readback and CPU state for inspection. They are not an optimized GPU rendering demonstration. Submission timing, fence wait and readback cost are separately reported. Benchmarking must include every bucket-building and solver pass plus GPU completion; CPU submission alone is not GPU speed or FPS. SwiftShader is software rendering and cannot stand in for the user's desktop GPU.

No local blocked-browser fallback, unsafe graphics flag or Sites mutation is part of this task.
