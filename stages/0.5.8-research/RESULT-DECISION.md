# 058 result: equivalent prototype, no demonstrated time benefit

The frozen prototype is b-bb03cf0b2a27da2086c9a803d51834da17fb5f50ed224ffc36ec02b9dbbb16ad. It changes only current-step slot exposure and ascending bitset enumeration, plus version labels. No simulation rule changes.

Correctness: independent17/17 (14 contracts plus3 deliberately incorrect enumeration negative controls),231 frames,585 rule steps,182 ACKs,492708 interpolation checks. The complete native paired collector also produces223 identical RGBA frames,38 identical actual final-draw ACKs, identical paint operations, physics metrics and mass ledger.60 quiet frames do no material repaint.

Work: old frame merge scans4,974,255 slots; candidate visits202,355 slots and marks202,355 IDs, plus155,610 word clears and155,610 word enumerations. Current fixed capacity bitset occupies2,592bytes. This proves fewer empty-slot checks, not a speed improvement.

The first pair overlapped a5.17s independent test process and is retained under evidence/interfered-pair. Its timings must not be used as performance evidence.

The only authorized retry ran serially with all known local project workers held. Active Game.step total696.03→928.88ms (+33.45%), p95 11.33→14.40ms. Unchanged ruleStep total259.18→366.45ms and sync301.77→451.07ms also varied upward. Draw submission1728.36→1820.98ms, readback311.21→278.65ms. These data do not isolate causation and do not demonstrate an acceptable speed benefit. No further retries or parameter search are planned.

Recommendation to parent: preserve this as a research checkpoint, retain the056 core in final059, and be explicit that this stage did not deliver a verified performance improvement. The patch remains recoverable for future properly controlled analysis. Do not silently merge it on operation-count arguments alone.

Native Canvas collector uses a per-frame released output surface with continuous renderer caches, same-process structuredClone rather than actual IPC, controlled model timestamps, and no browser FPS claim. Raw JSON, original failed timing pair and exact source identities remain available.
