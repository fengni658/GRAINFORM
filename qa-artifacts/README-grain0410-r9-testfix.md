# r9 test-only correction: original slots result was FAIL

The original r9 slots log failed overall. An earlier summary incorrectly treated the successful 320-cycle subcase as success for the entire slots command. Preserve that original failure and the first correction's second remaining failure; both are included in this evidence. Do not rewrite prior archives or claim the original full gate passed.

- grain0410-r9-testfix-delta.tgz: 3274 bytes; SHA-256 1f58b71fca7ac36286c2a19c038e71a1e9fedd6664c3a299007f28a37231608c; Git blob db3d56f3527b3b10ee04f1b954b594d87ea7986d.
- grain0410-r9-testfix-evidence.tgz: 8669 bytes; SHA-256 5e4fbe24fd9943f2f920515821852b0e23122efd1cab07b85556f983b8a3e66c; Git blob 53a6bdc87145121f61a2336c9b51631c6529ec5a.

On a separate complete frozen r9 copy, verify archive checksums and the two previous/new hashes in TESTFIX-MANIFEST.json. Overlay merge-test.mjs and tests/run-test-gates.mjs only. Two obsolete 1/60 timing assumptions are corrected for the new 1/240 transport budget; strict birth fields, no-motion first two frames and third-frame new-identity audit are asserted. Generation, capacity and roughness checks remain. The wrapper records process exit status so passing subcases cannot hide total failure.

Evidence retains original FAIL, round1 FAIL and round2 success: seven slots groups and 76 Node tests exit 0. All ten runtime hashes remain unchanged. This is neither a gameplay nor performance fix and does not pass r9's outstanding time gates or browser acceptance. Extract evidence separately; preserve all old candidates. No main update or Site deployment.
