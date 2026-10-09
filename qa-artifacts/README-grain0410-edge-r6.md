# Edge r6 QA transfer: based on r4, not r5

Preserve every earlier candidate and archive. Build r6 from a separate complete frozen r4 copy (0.4.9 -> edge r1 -> r2 -> r3 -> r4 -> r6). Do NOT overlay r6 on r5 or on the candidate-external microexperiment. Git archive history retains those artifacts without making them source dependencies. No main update or Site deployment.

- grain0410-edge-r6-delta.tgz: 38538 bytes; SHA-256 296fabee8b501747fedd5b3acdf303a8f2a40d408da8669c4aff3a20de094c36; Git blob b754e4b3f5cd1d46b4e6b852fafc9f99a51acddc.
- grain0410-r6-evidence.tgz: 21062 bytes; SHA-256 a19eacb113ccde7e48b50412eceacf221f1f12259cdf331c51bff336c4a56940; Git blob ef50d0440b78da80f3ca21b7c27e34cba21f813a.
- Required r4 delta SHA-256: b308e1521e8936426158f6ebb4613f431cbc9f87e67b33fefddcba2a05fb54f1.

Verify archive checksums. Preserve the r4 manifest, overlay 15 exact files, and verify all previous/new hashes plus ten runtime hashes. Five runtime files change: ca-world, ca-frame-world, ca-adapter, ca-layer and game. app, worker, contour, HTML and CSS remain byte-identical to r4. Local full-chain reconstruction verified these hashes before upload.

Extract evidence separately and verify all 17 evidence manifest entries. Local reports record 76 Node tests, 320 slot cycles, 340 RGBA comparisons, 123843 new-oracle events and three actual-worker tests. Old 551-frame trajectory equality is intentionally inapplicable; run verify:motion, with verify:parity explicitly labelled a new-oracle alias. Sand overlap is a 2D material approximation, not hard-circle mechanics. Note the reported Float64 fixed-capacity increase of 47063520 bytes when reviewing memory.

Full-game real-browser visual, temporal and performance acceptance remains pending. Do not infer end-to-end browser success from local tests or deploy as part of this transfer.
