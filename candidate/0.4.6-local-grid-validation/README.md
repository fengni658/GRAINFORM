# Local-sand rule reproduction candidate

This is a minimal source-only copy of one experimental discrete triangular-slot sand rule. It is not the original continuous circle solver and is not a released game. Radius.875, four colors, fixed120Hz, local wake/sleep and snap-only display are unchanged from the private source. The engine and runtime are byte-identical copies. No external packages are needed.

Included: runtime, tests, deterministic input generator, benchmark/reproducibility scripts, and a synthetic reference summary with host paths/timing/environment metadata omitted. Excluded: private reports, screenshots, Library identifiers, archives and personal data.

Run:

    npm test
    node bench.mjs --out=second-environment/equal-cascade-window --equal-cascade-window
    node reproducibility.mjs second-environment/equal-cascade-window
    node reproducibility.mjs --compare reference/expected-summary.json second-environment/equal-cascade-window/evidence/reproducibility-summary.json

The comparison checks engine/state hashes, activity and equal event windows, not timing equality. Check `passed:true`; this reporting script does not set a failing exit code by itself. Input is seed1,4056/12000 admitted particles, with event-relative2400tick deletion windows. No snapshot restore is used. Benchmark output is generated locally in the new directory and is not part of this transfer.

Start the browser page with `npm start` on port4180. Runtime API `window.__LOCAL_SAND_QA` exposes startScene,queue,deleteBottom,clearConnected,artificialBridge,pause,telemetry,snapshot and advanceTicks(1..240 while paused). Default is a small256-particle scene. Preserve fixed-dt backlog; report browser time ratio, draw/rAF costs, lifecycle/input behavior and screenshots separately. Node throughput and endpoint images do not certify browser FPS. First environment did not run the browser.

The synthetic reference retains observed left/right distribution; it is not an assertion of unbiased flow. Sideways rolling shares motion credit with downward travel, producing a known slow cascade tail. Input refusal, conserved IDs/counts and endpoint circle geometry must remain checked. This candidate is for evaluation before choosing a simulation model; no automatic publication is authorized by these files.
