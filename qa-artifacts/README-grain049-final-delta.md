# GRAINFORM 0.4.9 packaging verification delta

Independent QA transfer only. No main update or Site deployment. Preserve all previous archives.

- Archive: grain049-final-delta.tgz, 32574 bytes
- SHA-256: 263e4f8e471a429a12ef61fff34a2084d079dd93126358bfd13865513625eece
- Git blob: 4ba0e6f98882ffae6ed92265f47939e7d70e2738
- Baseline: full revision-1 archive, SHA-256 b2383be2688a6e7363e5c1a0ed323b10cb5c823e1e729b398c3d5053f5632865

This changes eight text/version/manifest/documentation files relative to revision 1, with no deletions. Verify the delta checksum, extract the immutable full revision-1 baseline, and overlay files/ at unchanged relative paths. Verify all 69 targetFiles hashes in the delta REVISION-MANIFEST.json. Some historical evidence files exist only in the full revision-1 archive; a minimal runtime reconstruction alone cannot satisfy that full provenance inventory.

Local reconstruction verified all 8 changes and 69 target hashes before this transfer. Independent final browser and boundary verification is still required. Run the existing verification scripts without changing code or installing dependencies. This transfer does not itself establish readiness or authorize deployment.
