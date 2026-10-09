# Frozen r12 contour enumeration QA candidate

Experimental equivalence/performance candidate over frozen r11. Actual Chromium performance remains unverified; retain the prior cold roughly 53 ms risk. Browser startup socket failure logs are included and are not a browser pass. No main update, Site deployment or release acceptance.

- grain0410-r12-delta.tgz: 5232 bytes; SHA-256 d498074c87ed7d730f625626b91726ace19e99ed7aba6c8f4f0bd215e372b8e1; Git blob b31d8df333406374feb879f8ba24d56210441f0f.
- grain0410-r12-evidence.tgz: 58180 bytes; SHA-256 42e47d85d5a4a80e84f2df3b8fc1e99b6874ca1a69c873e339bf787da1623fa5; Git blob e433d71b5970a51493cdc50312ab73e6f23e2882.
- Frozen r11 archive commit: c5b7fde7af94d0af106feb5b3f4eb593db66da61.

Verify checksums and work on a separate complete r11 copy. Replace only ca-contour.mjs and retain R12-MANIFEST.json as the authoritative ten-file old/candidate runtime hash record. Only line13 bilinear neighbor enumeration changes: outer array and four tuple arrays become ordered scalar locals. Four terms, operation order, if(a), and independent next.nodes weight records remain unchanged. No pooling across frames and no warmup.

Extract evidence separately and verify all 53 FILE-MANIFEST entries. Validation-overlay inputs are test helpers, not runtime changes. Local reports include 76 Node tests, 340 RGBA, 364 extended Canvas command/RGBA comparisons, 555 real-Game data/RGBA checks, 105 targeted cases and independently unpacked slots/Node exit0. These establish local equivalence only. Removing 11520 source array constructions for the first 2304 grains does not measure actual heap allocation, GC or CPU savings. Require independent browser verification before drawing performance or delivery conclusions. Preserve all prior archives and failures.
