# Edge r3 QA transfer

Preserve the complete 0.4.9 -> edge r1 -> edge r2 chain and all previous archives. Work on a separate complete r2 copy. No main update or Site deployment.

## Immutable packages

- grain0410-edge-r3-delta.tgz: 14702 bytes; SHA-256 fb860bdd15dd1dd4e8f375091c16ceab8ad48ff43150631d77275ba3c2b1bf4a; Git blob acc7de75ffb6654335f7b5e3a239d89b78dd11fc.
- grain0410-r3-delivery-evidence.tgz: 13392 bytes; SHA-256 988c68038a85a1477541e2b457969fe01d4832e73fa3d5981b35a87957b772fb; Git blob 249a0b5a4b9410c85f59666f19057b415092676c.
- Required r2 delta SHA-256: da42dec24cbb9b4a8f6ffa37449ef65c5e782b175c297d7fe66e6533f4f15a6a.

Verify archive hashes. Overlay only the five listed r3 files at unchanged root-relative paths on a separate complete frozen r2 copy; verify previous/new hashes and all ten runtime hashes. Only ca-layer.mjs changes among runtime sources: scratch union painting before exact dirty-tile crops. Contour, physics, worker and other nine runtime sources remain unchanged. Preserve the r2 revision manifest separately before overlaying the new manifest.

Extract delivery evidence outside candidate trees and verify its 13 EVIDENCE-MANIFEST file hashes. Evidence is not required as a source overlay. Relocated external comparison scripts may need consumer-local import paths to the two complete dependency roots; do not repair frozen runtime sources.

Local reports record 51 Node tests, 252 independent RGBA comparisons, 36 direct frozen-r2 screen/cache comparisons, 320 slot cycles and 551 parity frames. They do not establish browser speedup. Run independent Chromium pixel/behavior and matched high-density DPR2 timing checks without recording/forced GC in timing runs. Record peak and active-window debt separately from later settled debt. Existing native-memory uncertainty remains open. No publication is included.
