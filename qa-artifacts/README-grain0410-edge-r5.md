# Edge r5 QA transfer

Preserve the complete 0.4.9 -> edge r1 -> r2 -> r3 -> r4 chain. Work on a separate complete r4 copy. No main update or Site deployment.

- grain0410-edge-r5-delta.tgz: 23526 bytes; SHA-256 4f30e7723dba76ee4048b5edd0774f45de55ab305db41e5c4ff62c931ef27ed2; Git blob f1665576398c769d73ea470c9eb4248b9060e736.
- grain0410-r5-evidence.tgz: 392315 bytes; SHA-256 cda6235ccacb502128a67721de6bcd9990410d3c715709ee82e2ecdcd6c29c7c; Git blob 4b6683a414065f09fe43815d8d543ca4a4c745d5.
- Required r4 delta SHA-256: b308e1521e8936426158f6ebb4613f431cbc9f87e67b33fefddcba2a05fb54f1.

Verify archive checksums. Preserve the prior revision manifest, overlay nine exact files and verify all previous/new hashes plus ten runtime hashes. Only ca-world.mjs changes among runtime sources, intentionally restricting descent to the adjacent column. Other nine runtime files retain r4 hashes. Do not repair frozen sources.

The old 551-frame trajectory equality is intentionally no longer applicable; it has not been silently rebaselined. Run verify:motion and verify:collisions for the independent legality/conservation oracle and collision fixtures. verify:parity is explicitly a new-oracle alias, not old-trajectory parity. Preserve the legacy-r4 reference.

Extract evidence outside candidate trees and verify its 24 manifest entries. Included workspace paths are technical provenance only. Local reports include 68 Node tests, 252 RGBA comparisons, 320 slot cycles, exhaustive direction cases, motion/conservation checks and 12 collision fixtures. These do not establish browser visuals, style acceptance or speed. Independent real-browser visual and high-density performance verification remains pending. No deployment is included.
