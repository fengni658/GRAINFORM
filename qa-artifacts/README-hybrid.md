# Released 0.4.9 motion + r13 edges: isolated hybrid

Unpublished QA experiment. Overlay ONLY the true original 0.4.9 at commit 2a8fe3b67a75df2a74a124871d80acf5543cc271, never r13 or previous slide/contact experiments. UI/version remains 0.4.9 pending review. No main or playtest update.

- hybrid-delta.tgz: 9057 bytes; SHA256 cdd5141f579e86740efaf2b54ccfcd1602e63772c031f0f5cf088e6504d11630
- hybrid-validation-evidence.tgz: 63261 bytes; SHA256 c2901d1bcb9662f0113679961a47ff600ba8d4892a3ec65672bdbd564c4d5840

Copy untouched 0.4.9 to candidate/, extract the delta inside candidate/, then extract validation-evidence at the experiment root. Delta contains ca-layer.mjs and ca-contour.mjs only. Read FINAL-REPORT.md, VALIDATION.md, QA-SPEC.md and manifests. Bind OLD049_ROOT, R13_ROOT and ORIGINAL049_ROOT as documented; original expected.json is not duplicated.

Old motion, path decoding, frame queue and single-object ACK semantics remain unchanged. Exact old/hybrid trajectory SHA256: 31205449eb19668c2e2b8a9a9e1b7fa9dff7bd608772814f195b0ec5038ac5bb. Original slots and parity pass both; 659928 unit actions/path legs and 2206375 path samples audited. This does not prove wall-clock browser behavior.

Retained failures: unchanged original npm tests pass 36/36 old, 32/36 hybrid due to missing Canvas mock methods; adapted test-only mocks pass 36/36 without assertion/runtime changes. Old pixel gate passes 144/144 old but intentionally fails 70 hybrid old-screen cases. New independent same-pose renderer comparisons pass 555 screen + 555 cache RGBA against r13-style full redraw at old poses.

New outer-corner opacity diagnostic retains aggregate pass=false / exit 1: inherited partial exterior-grain trim is identical in r13 and hybrid; no threshold lowered or universal hole-free claim. Initial validation allocation exit137 and other diagnostic failures/limitations remain recorded.

Run node validation/hybrid-motion.mjs, node validation/hybrid-render.mjs (expected retained diagnostic exit 1), and node validation/run-original-gates.mjs with documented reference bindings. Actual same-condition normal-speed original049/hybrid/r13 continuous video and browser timing remain pending. Numerical equality is not visual acceptance or a completed flow fix.
