# External browser verification tools for edge r2

QA-only helper package, separate from frozen r1/r2 sources. No main update or Site deployment.

- Archive: grain0410-r2-browser-test-tools.tgz
- Bytes: 5571
- SHA-256: 5ef6a60269f7f85646fe10abf3b07d9117f70306cac2826c9f452ade1e990a8b
- Git blob: 0b40608e58fcfdf1d14318c4369190a833076bd7
- Frozen r2 delta SHA-256: da42dec24cbb9b4a8f6ffa37449ef65c5e782b175c297d7fe66e6533f4f15a6a

Verify the archive and TEST-TOOLS-MANIFEST.json hashes. Extract into a QA-tools directory outside both candidates; do not overlay these files onto frozen source. Serve browser-fixed-suite.mjs with two explicit independent r1Base/r2Base URLs pointing at the complete, hash-verified module trees. The helper reproduces the fixed 1001 approaching-tip positions and 1212 outlet connectivity checks using Canvas2D. No new dependencies or installation are required. Follow BROWSER-CHECKLIST.md for matching poses and independent high-density timing.

Included fixed-runner-node-check.json is only a Node Canvas API check, not Chromium evidence. Actual browser outcomes, natural UI video, high-density DPR2 performance and memory limitations must be recorded separately. Preserve all frozen source and archive hashes before and after verification.
