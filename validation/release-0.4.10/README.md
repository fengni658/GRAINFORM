# 0.4.10 main promotion validation

## Scope and provenance

This is a normal commit on top of main 2a8fe3b67a75df2a74a124871d80acf5543cc271. That 0.4.9 commit is also retained at backup/0.4.9-before-0410. No history overwrite, 0.4.11 behavior, Site project identity, credential or deployment configuration is included.

The 9 mjs/CSS files are byte-identical to the reviewed 0.4.10 queue-continuity release. The entry uses the later content-addressed build wrapper. See source-bindings.json and the root RUNTIME-MANIFEST.json. Root source modules and their build copies are checked for exact byte equality. dist/ and all unrelated historical repository files are preserved.

## Re-run for this promotion

- Original 0.4.9 assertions and mocks against full current runtime: 31 PASS / 5 FAIL. Four failures are missing Canvas-mock capabilities; the fifth expects the old 0.4.9 HTML label. Full original-tests.log is retained.
- Current default suite: 61 PASS / 0 FAIL. This comprises the original 36 functional tests after two mock capability adaptations and one explicit version-label expectation update, 23 queue continuity tests and 2 release/HTTP tests. See current-tests.log and test-adaptation.diff. Existing functional assertions were not dropped.
- Slot suite: 7 PASS / 0 FAIL, including 320 admissions/removals, bounded storage, stale identities, atomic rejects and handle exhaustion. See slots.log and ../../evidence/slot-merge-tests.json.
- Exact six-batch/clear/support-cut parity: PASS, 551 compared frames and 330 rule ticks. See parity.log and ../../evidence/slot-wake-parity.json.
- HTTP tests serve all 20 manifest files and both entries with exact bytes, verify no-store, and reject README, package, test and historical-dist routes. This is a local HTTP/Node test, not a fresh browser run.

The frozen pre-continuity hybrid queue in tests/fixtures/hybrid-before-queue is a reference fixture, never a production entry. The focused test's changes from the reviewed package are import-path relocation only.

## Preserved pixel/visual boundaries

The unchanged verify:pixels oracle compares the new contour renderer against the frozen old renderer and is expected to FAIL on 70 of 144 screen draw comparisons. Its assertions and references are untouched. The actual rerun and exit status are recorded in legacy-pixels.log; the full report is at ../../evidence/pixel-equivalence-node.json. Raw-cell and non-fallback cache comparisons remain exact. This is a renderer-oracle incompatibility for intentionally changed edges, not a reason to silently replace the oracle.

The inherited conservative outer-corner diagnostic also remains a real visual FAIL: known-one-cell-void ID 698, alpha 124 below the 180 threshold. Local corner clipping and inherited sixth-piece short L-arm deformation are not claimed fixed.

## Earlier independent evidence, not re-run here

The complete queue-continuity QA source/validation package is pinned at https://github.com/fengni658/GRAINFORM/tree/99d57e31f2450afadd08285db6f0a0ec90c2e2d9/qa-artifacts . Independent full browser/queue review bound all 10 release runtime files to that release: 27/27 terminal piles identical; high-pile runs had 1125 receipts/posts/worker ACKs each, maxQueue=2 and no protocol violations. Of 26 short-gap reuses, 16 avoided a partial first real rAF; the other 10 were not counted as earlier completion. Lifecycle evidence had 40 receipts/posts with no multi-receipt rAF; clear endpoint preceded flash.

A subsequent real-browser warm-upgrade check exercised the content-addressed entry wrapper (evidence archive SHA-256 e88bf3b7fa228ddfada98372d4b2481e003c93a4264e45f03a878d7995dc62f8, 678543 bytes). Its historical Chromium environment used --no-sandbox, so it is not a default-security browser acceptance. That flag must not be reused. The online request instead failed with ERR_TUNNEL_CONNECTION_FAILED and no host response headers were captured. Only the HTML's two resource URLs and new build paths changed after the core runtime QA. The user's actual online loading-failure root cause was not confirmed; mixed-cache incompatibility is a reproduced possible failure mode, not a proven diagnosis of the user's session.

No all-green, broad commercial-readiness, universal speedup, mobile-device, true OS background/BFCache or actual Worker crash-recovery claim is made. Synthetic lifecycle events test handlers only. This promotion does not re-run the earlier long browser suite or ordinary-display perceptual assessment.
