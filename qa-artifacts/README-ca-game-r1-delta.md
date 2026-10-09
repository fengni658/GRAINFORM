# CA Game revision 1 verification delta

Test-only renderer, test barrier and measurement update for independent Codex verification. Original archive retained; no main update or deployment.

- Delta: grain-ca-game-r1-delta.tgz, 44374 bytes
- Delta SHA-256: 73fb8e411d1c0a7c6f8527dfaff9b313057128c40be7206d4188514395f858bb
- Delta Git blob: b611cf39bccac34db7cca502bf7ff244cb102282
- Baseline: grain-ca-game-candidate-frozen.tgz
- Baseline SHA-256: 35a0937b3bd1bdd0ea0271a31119e08a06e8eca191ff8a1ff15bc9573251f424
- Full r1 source archive SHA-256 (provenance only): b2383be2688a6e7363e5c1a0ed323b10cb5c823e1e729b398c3d5053f5632865

Verify both archive hashes. Extract baseline and delta into a clean directory. Overlay grain-ca-game-r1-delta/files/ onto grain-ca-game-candidate/ at unchanged relative paths. There are 17 replacement/addition files and no deletions. Verify every one of the 35 targetFiles hashes in REVISION-MANIFEST.json, rather than expecting a newly packed tar to match the full r1 archive hash. Archive timestamps may differ.

Run npm test, npm run verify:slots, npm run verify:parity, npm run verify:browser and npm run verify:pixels:browser. Node pixel checks (npm run verify:pixels) use an already installed @napi-rs/canvas only; if absent, report it and use the Chromium fixture, without installing dependencies. Use existing supported Playwright/Chromium. Verify native Chromium RGBA parity and dense-motion performance with QA both on and off; ?qa=0 is still on. Record actual worker.qaEnabled. Do not change verification sources or treat local reports as independent browser success. Physics files are unchanged; the manifest records exact hashes.
