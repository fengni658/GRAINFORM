# Edge r11 frozen QA: structural reductions, browser benefit unverified

Unpublished candidate. Retain r10 risks: observed draw rate as low as 50.7/s, main draw 19.8 ms, warm worker 21.3 ms and cold worker 58.4 ms. This revision only establishes reduced structural calls and temporary allocations; it does not establish actual Chromium CPU, GC, frame-rate or delivery improvement. No main update or Site deployment.

- grain0410-edge-r11-delta.tgz: 55493 bytes; SHA-256 d04242438320ad9dfe56cf47dedeaedb5e8762b4c31eaf274a84d93028679966; Git blob bbf449fe8b477ed212fe8ff3a6728f467828c1cd.
- grain0410-r11-evidence.tgz: 195908 bytes; SHA-256 a3cf5c733f7b1256393262b18dad7bb5ffa63a9a75b96a7d9598fc8f638bda99; Git blob 242414ba2e9aababfc3c59a37c15f1a5a1588e0a.
- Base r10 delta SHA-256: 270f0c87080fb0cde53d3f3002e05eb397879b76ac5237b6a429dc4bc5853209.

Build on a separate complete frozen r10 copy. Verify archive hashes, preserve prior manifests, overlay 14 listed changes and verify old/new and ten runtime hashes. Only app.mjs and ca-layer.mjs change among runtime files: deduplicate identical DOM updates/cache static references, and remove temporary dynamic-body clone arrays. Other eight runtime files remain identical, including 720 motion, material dt, worker, wake, queue and clear behavior.

Extract evidence separately and verify all 94 manifest entries. Local gates include original 76 Node tests and seven slots groups, a separate explicit seven-test UI gate, paint equivalence/extended commands, full raster comparison and three actual-worker integration tests. Report each process exit code; do not merge separate UI tests into the original count or confuse local results with actual-browser performance. Preserve all older archives and historical failures. Independent Chromium verification remains required before any release decision.
