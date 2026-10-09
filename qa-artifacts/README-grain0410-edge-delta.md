# GRAINFORM 0.4.10 edge candidate verification

Test-only transfer to the independent qa/edge-0.4.10 branch. Preserve every earlier archive. No main update or Site deployment.

- Archive: grain0410-edge-delta.tgz
- Bytes: 48669
- SHA-256: db2ed509bbc19ff1d1c1608ce57df0b8ce8ce602150339567ed555d0a1d6cd4d
- Git blob: 7586d025c9454aa97dcbb45baae4ce2cd9b107e3
- Archive-history parent: b45e4c0739db65457c3dda36e1a331660e3f667c

Verify the archive hash, then overlay its root-relative files onto a separate copy of the complete delivered 0.4.9 directory. Check every change hash in REVISION-MANIFEST.json and every runtime hash in RUNTIME-MANIFEST.json. The package contains 17 source/test/documentation changes, including the new ca-contour.mjs renderer. Physics source and worker files listed in the revision manifest are unchanged.

Reported local checks are 42 Node tests and 180 RGBA comparisons, not independent browser or dense-motion performance results. Real Chromium visuals, behavior and high-density performance remain pending. Use existing verification tools without installing packages or modifying sources. Do not alter the delivered 0.4.9 directory or publish this candidate before independent verification completes.
