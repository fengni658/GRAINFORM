# GRAINFORM 0.4.10 edge candidate verification

Test-only transfers on qa/edge-0.4.10. Preserve every earlier archive. No main update or Site deployment.

## Chain of immutable inputs

1. Begin with a separate complete delivered 0.4.9 directory. Do not modify the preserved original.
2. Verify and overlay grain0410-edge-delta.tgz (r1) at its root-relative paths. Size 48669 bytes; SHA-256 db2ed509bbc19ff1d1c1608ce57df0b8ce8ce602150339567ed555d0a1d6cd4d; Git blob 7586d025c9454aa97dcbb45baae4ce2cd9b107e3. Check all 17 change hashes and runtime manifest hashes. Preserve this r1 copy for comparison.
3. Make a separate copy of complete frozen r1. Verify and overlay grain0410-edge-r2-delta.tgz at its root-relative paths. Size 11538 bytes; SHA-256 da42dec24cbb9b4a8f6ffa37449ef65c5e782b175c297d7fe66e6533f4f15a6a; Git blob 5023365511b5eaa14ab90051f5de30711795a5d8. Check all five previous/new hashes in the r2 revision manifest before/after overlay and all runtime manifest hashes. The revision manifest itself replaces the prior revision record; preserve both archive originals.

## Revision 2 scope

Five payload files plus REVISION-MANIFEST.json. Only ca-contour.mjs changes among runtime files; remaining changes are contour tests, render fixtures, README and runtime manifest. Local old/new hashes verified before upload. Physics, worker and preserved r1 remain unchanged.

Reported local r2 checks include 50 Node tests, 228 RGBA comparisons, 1001 tip phase cases, 1212 outlet cases, 551 physics parity frames and 320 identity cycles. These are not independent browser or FPS results. Run existing Node and Chromium checks, inspect edge behavior at DPR 1/1.5/2, compare r1/0.4.9 and measure high-density DPR2 cost. Browser validation and memory limitations remain pending; see r2 README. Do not modify verification sources, install dependencies or publish as part of this transfer.
