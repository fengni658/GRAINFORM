# 0.4.10 queue-continuity QA candidate

Runtime ZIP: 45492 bytes, SHA256 0e81a5c5884da713be19cb372d559eaaf3831efeab793da661d69ddb44d00ce8.
Validation ZIP: 242503 bytes, SHA256 711bac833ffe1fca210faccac0ce69b4078fc171e073a21b9369b1ac7f6578d0.

Unzip runtime into a fresh isolated serving directory; it contains all 10 runtime files, with final 0.4.10 labels. Unzip validation separately and read README.md, GATE-RESULTS.md, QA-SPEC.md and RUNTIME-MANIFEST.json. Verify served files against releaseSHA256. Validation candidate/ retains pre-label experimental bytes; release-candidate/ matches runtime ZIP exactly. Reproduction requires documented original 049/frozen hybrid references and existing Node/Canvas dependencies.

Based on true 049 motion with the frozen hybrid edges. The small queue correction saves the last actually drawn endpoint rAF anchor once, only for a consecutive same-epoch/same-settling-burst token arriving within 1000/60 ms. Long gaps retain arrival-based start. Explicit same-rAF duplicate receipts are rejected; interruptions invalidate empty anchors. Game adds read-only burst metadata. Motion, renderer, path decoder, worker frequency and endpoint ACK ordering are preserved. Label edits are separately recorded.

Local evidence: 23 focused tests, 63 recorded timing vectors, exact original trajectory parity, motion/path/identity checks and 555 screen plus 555 cache comparisons. Independent code review is included. Historical timing opportunities are not measured browser speed gains.

Retained failures are documented: untouched old Canvas mocks, old edge-pixel oracle, inherited renderer-only scope checks, conservative corner-opacity diagnostic (exit 1), and original hardcoded 0.4.9 label assertion (final adapted old suite 35/36). Separate final functional boot and 7 label checks pass. Do not reinterpret orchestration success as every gate passing.

Independent native-browser timing, interaction and normal-speed visual QA remain pending. This commit archives only the two ZIPs and this note; no main update or deployment.
