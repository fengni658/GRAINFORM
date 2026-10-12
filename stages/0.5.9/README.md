# 0.5.9 r2 WIP checkpoint

Frozen 18-file candidate; independent full regression/browser review pending. No deployment or main promotion. Root application stays the earlier baseline; serve candidate/ to exercise this checkpoint.

npm test runs the 12 focused app/real-worker/native Canvas tests after installing the pinned dependency. Self-contained fixtures include the exact 0.5.6 negative control. The complete independently submitted regression package is retained separately; this compact branch contains runtime, focused tests and provenance, not a claim that npm test runs all 204 full regressions. Full package SHA256: d069016d0602a5563d33945e89337cad705751dafd144b93b329b30c3f3979d6 (4147645 bytes).

Includes the startup and lifecycle fixes plus keyboard focus guarding, six-color wording and consistent version-derived worker name. Fifteen other runtime files remain unchanged. The rejected 0.5.7 flow and 0.5.8 bitset experiments remain separate research history, not integrated code. See STAGE-HISTORY.json and REPORT.md for limitations.
