# Frozen r14 bounded color preparation QA

Node-validated experimental candidate over frozen r13. Native Chromium pixels and actual timing remain pending; no completed performance fix or universal frame-budget guarantee is claimed. No main update, Site deployment or release acceptance.

- grain0410-r14-delta.tgz: 18880 bytes; SHA-256 9192e7746c096a42e06e6f5a857ee117493cc212fd6df9bbecc265822436c060; Git blob 7cd15346f13ade5b6d64f650057d0189a24d7107.
- grain0410-r14-evidence.tgz: 60227 bytes; SHA-256 5b4c52e3eeedb2ef33bee4e754632548077c853d45533d7b915a0ea03df76bf3; Git blob bb7ad111aab9263b5dd77f1e7389322d7ca12a4e.
- Base frozen r13 archive commit: fe2d30f3970b13226535c1e464e04e36c98404fa.

Verify archive checksums. On a separate complete r13 copy, replace app.mjs and ca-layer.mjs from delta/. Evidence validation-overlay/R14-MANIFEST.json records current hashes; inherited manifests are historical. Only the app explicitly opts into cacheColorRuns:true. The generic renderer default remains false to preserve side-effecting/reentrant/throwing callback behavior. Resolver reuse is call-local; hex decoding caches one primitive seven-character key and integer value only. Brightness arithmetic, fill commands and ordering are unchanged.

Extract evidence separately, verify all 34 EVIDENCE-MANIFEST entries and follow R14-REPORT.md. Local original gates plus 72 targeted color cases (including 36 RGBA comparisons) passed. First-contact resolver/hex parse counts fall from 2304 to 1 while all 2304 fills remain. These are operation counts, not measured milliseconds, heap or GC savings. Browser fixtures must explicitly opt in to exercise the candidate path; preserve default callback tests separately. Require independent native pixels and bounded cold/warm A/B before claiming a benefit. Preserve all prior archives and test-failure history.
