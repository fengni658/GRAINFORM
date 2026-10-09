# Frozen r13 contour full-coverage guard QA

Node-validated experimental candidate, not browser-validated or a completed performance fix. Prior r12 cold timing was not reliably improved. No main update, Site deployment or release acceptance.

- grain0410-r13-delta.tgz: 4296 bytes; SHA-256 387e85b1c006676b392e79deccacbfd90c240f11643b01ca704d97f3bac49627; Git blob 834af5e70b8bd02c58cab8167e2cbe13c782c690.
- grain0410-r13-evidence.tgz: 44488 bytes; SHA-256 d713cfa41def3f5ceae9a33f0c78f7e03cb2ee79f80d6051c1ef40db55de3369; Git blob 22a230908c79944a4e96e193ab3d4a69c7a4c98c.
- Base frozen r12 archive commit: bbe0056176fa161e73887741617d28444851760a.

Verify archive checksums. Work on a separate complete r12 copy, replacing ca-contour.mjs with delta/ca-contour.mjs from the archive. The evidence validation-overlay/R13-MANIFEST.json is the current revision hash record; inherited manifests remain historical. Only the full-coverage guard and explanatory comment change runtime. When initial inspect already covers all records, redundant halo enumeration is skipped; otherwise original traversal remains. No physics, clock, warmup, contour geometry or persistent-record pooling changes.

Extract evidence separately, verify every EVIDENCE-MANIFEST entry and follow R13-REPORT.md plus validation-overlay for repeatable tests. Natural first-contact diagnostic counted rounded-cell visits 57600 -> 0, with equal ordered state/results; these are operation counts, not browser milliseconds, heap or GC benefits. Local Node, ordered-state, command and RGBA gates passed, including real-Game selected poses. Actual Chromium first-contact timing, native pixels, warm/high20 behavior and pause/reset/clear regression remain pending. Preserve all old archives and do not claim the user-visible issue fixed before independent verification.
