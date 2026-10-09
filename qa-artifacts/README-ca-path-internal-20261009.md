# Frozen CA Game verification candidate

This archive is a test-only copy for independent Codex verification. It is not a deployed or approved playtest.

- File: grain-ca-game-candidate-frozen.tgz
- Bytes: 4095411
- SHA-256: 35a0937b3bd1bdd0ea0271a31119e08a06e8eca191ff8a1ff15bc9573251f424
- Git blob: a6c6fd550f0b6906f8d063c1eff0c7dc67795c61
- Base commit: 3c109200dff0fbee417165f016417cb0d059e54a

Verify SHA-256 before extracting. Extract into a clean directory and run from grain-ca-game-candidate:

```
npm test
npm run verify:slots
npm run verify:parity
npm run verify:browser
```

Browser verification requires an existing Playwright/Chromium installation. GRAINFORM_PLAYWRIGHT_MODULE may point to that existing module. Do not treat the included historical reports as independent browser verification. Preserve the frozen archive and record fresh results separately. No main-branch update or deployment is part of this transfer.
