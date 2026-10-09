# Edge r4 QA transfer

Preserve the complete 0.4.9 -> edge r1 -> r2 -> r3 chain. Work on a separate complete r3 copy. No main update or Site deployment.

- grain0410-edge-r4-delta.tgz: 38511 bytes; SHA-256 b308e1521e8936426158f6ebb4613f431cbc9f87e67b33fefddcba2a05fb54f1; Git blob e7d859c7ebb3ac6022ab1de46fde15f4cbd593f1.
- grain0410-r4-evidence.tgz: 67002 bytes; SHA-256 aebe6655b1a0b36b28a764f68927f30fd167ee64026779dbd5ee7b91fec8003d; Git blob b5b428e525dea7141fbd41615ef97278429cdc1c.
- Required r3 delta SHA-256: fb860bdd15dd1dd4e8f375091c16ceab8ad48ff43150631d77275ba3c2b1bf4a.

Verify archive checksums. Preserve the prior revision manifest; overlay nine exact files from r4, including the new tests/timeline-queue.test.mjs. Verify every previous/new hash and all ten runtime hashes. Four runtime files change for one fixed-timeline presentation protocol; physical world/frame/adapter, contour and r3 batching remain unchanged. External probes must handle didDraw returning an ordered ACK array with endpointDrawn. Do not repair frozen sources.

Extract evidence outside the candidate and verify its ten manifest entries. Local reports record 68 Node tests, 252 RGBA comparisons, 320 slot cycles and 551 parity frames. They do not establish real browser visual or performance success. Run independent temporal/visual and high-density tests, preserve source hashes and record findings. No deployment is included.
