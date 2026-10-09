# Edge r10 experimental QA: CPU relative gate FAIL

Not a release or full acceptance pass. Simulated block20 settles in 112 ticks (~1.867 seconds), but actual browser block20 under 2 seconds remains unverified. One Node run's total CPU increased 41.04 -> 50.38 seconds (+22.7%), FAILING the relative CPU item. Peak output diagonal moves increased 45.5%. Preserve these risks in independent visual, feel and frame-budget review.

- grain0410-edge-r10-delta.tgz: 17990 bytes; SHA-256 270f0c87080fb0cde53d3f3002e05eb397879b76ac5237b6a429dc4bc5853209; Git blob f68debcbd2e7d7ce57490882973ac86395847bc2.
- grain0410-r10-evidence.tgz: 1049607 bytes; SHA-256 b15cf8d37da585098b085afdfc3cca9fb2c7e81e6d1d7aaec56c4bc087a2be95; Git blob c4b54770dfcffbceacad43f05b153b14b19e5a3a.

Build on a separate original frozen r9 copy, NOT a copy already overlaid with the separate testfix. The r10 archive includes that test correction. Verify archive hashes, 11 previous/new file hashes and all ten runtime hashes; preserve original manifests. Only ca-world.mjs changes among runtime files: transport cap 480 -> 720 and exact integer saturated quota to avoid long-age floating-point extra-step errors. Initial speed, gravity900, dt, wake, quiet detection and clocks are unchanged.

Extract evidence separately and verify all 78 manifest entries. Historical original slots FAIL and first-testfix-round FAIL remain in the evidence. Local current checks include 76 Node tests, seven slots groups, 340 RGBA comparisons, new legality/all-awake oracles and exact before/after numerical-fix action/path agreement. None establishes real browser performance or delivery readiness. Images and silent videos are offline technical comparisons.

Preserve all previous archives. No main update or Site deployment.
