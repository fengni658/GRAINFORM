# Contact-flow prototype: independent visual QA only

Version remains 0.4.10. Based on frozen r13, NOT r14. Limited supported one-cell contact rolling intentionally changes motion; no visual acceptance or deployment is claimed. Preserve all prior archives, main and the existing playtest.

- contact-flow-delta.tgz: 18274 bytes; SHA-256 d388c17c3e705690a7f94fc4015df0c660740f622a64c3df440b4e5fd9e06162; Git blob bbf1904fa63e3ed6fc8cbd450adfa608ae756deb.
- contact-flow-evidence.tgz: 172463 bytes; SHA-256 ae9879f0c1aa9ba2d8fc5219d76d7115d1cf5946e6e7384a65875d8248b19604; Git blob 389d605e7bd102c1ee23f2e33996d552b40d404f.
- contact-flow-validation-overlay.tgz: 11608 bytes; SHA-256 d09b3d9e84d124a37144ef2f7c811c8b3de57b00f9891049c506bcdc6550eb4c; Git blob fda93f95dbb67f40566de7a0f453cc55e82d41cd.

Use the existing complete independently frozen r13 baseline; no full source archive is uploaded. Make separate baseline/candidate copies, verify archive hashes, apply the five delta files only to the candidate, and use VALIDATION-LAYOUT.md in the validation overlay for the six external diagnostic scripts and CONTACT-FLOW-RUNTIME-MANIFEST.json. Verify candidate/baseline hashes. Extract evidence separately and verify EVIDENCE-MANIFEST.json; preserve rejected attempts and original failures.

Read FINAL-REPORT.md and QA-RECORDING-SPEC.md in evidence. Local final npm test is 77/77, not 177. Other local checks cover 11 invariants, seven slot groups/320 cycles, 529172 audited actions, same-pose raster and full-awake scheduling. These are correctness/work observations, not real browser performance or improved hand feel. Natural first-block lateral grains rise only 462 -> 471, so visible improvement may be subtle. Continuous normal-speed old/new recordings are required for natural first contact, an artificial narrow column on a slope, real six-piece play and an artificial shallow local disturbance. Do not substitute offline renders or stills for native continuous playback. If flow remains too subtle, choreographed, slow or damages edges, report and stop; no automatic tuning or release is part of this transfer.
