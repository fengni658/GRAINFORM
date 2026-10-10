# GRAINFORM 0.4.11 phone-board candidate archives

This QA-only branch is based on approved 0.4.10 main commit ddc8a1aed5a525b2efa8bd5da384b6961b790db2. The repository runtime files outside qa-artifacts remain the 0.4.10 baseline. This commit only adds the two candidate/evidence archives and this README. No deployment or main-branch update is performed.

## Frozen artifacts

- GRAINFORM-0.4.11-phone-board-runtime.zip — 49,971 bytes; SHA-256 9353da895f3647b8d4bd250126415e74ecabcc3f39feae4cc640ea27c6808138
- GRAINFORM-0.4.11-phone-board-validation-lite.zip — 695,031 bytes; SHA-256 10606863a9c2c0be1b4ec3b66ae208243096b650a59faf820f3d4e4b6ac3a832

The runtime archive contains the complete 0.4.11 entry, JavaScript, Worker and CSS closure plus MANIFEST.json. Extract it to a separate static-server root, then serve and open experimental/0.4.11/builds/b-c09a9ea6b2fe85a5f439a6e9424da32ffa62a1a53c10f4f4008ae2e274f45b82/index.html. This content-addressed build is immutable: do not hot-replace files or mix them with the 0.4.10 baseline. Future fixes require a new build ID and hashes.

The lite archive contains exact test scripts, patch, manifests, QA specifications, gate results and textual/JSON evidence, preserving original FAIL logs. Read its LITE-VALIDATION.md and LITE-INVENTORY.json first. It is not a fully populated source checkout: inherited reproduction requires the exact historical dependencies and oracles listed there. The full 10,216,825-byte validation archive is intentionally not uploaded here; its SHA-256 remains b50f8f730b76a50183a0aa54abbff997beb81d82ed383fd5d02096f93278bb92.

## Change and validation status

Board geometry expands from 232×420 to 232×500 while retaining particle size. Initial falls are faster. Recorded focused checks passed 10/10, unchanged queue-continuity checks passed 23/23, and same-scale raster and immutable HTTP closure checks passed.

This is not an all-green release. Original label, golden, pixel/source-identity and conservative-corner oracle FAILs remain recorded, alongside fixture-adapted classifications. Both supplemental high-pile assumption FAILs are retained: the initial cleared-board capacity assumption and the strict cumulative physics-tick parity mismatch (2666 versus 2660). They are not silently rewritten as PASS.

Actual browser interaction, touch/scroll, GPU/compositing, frame-time and memory-pressure acceptance has NOT RUN because safe-browser QA was unavailable. Node/raster evidence is not browser sign-off. Publishing these frozen archives does not add new test execution or deployment approval.
