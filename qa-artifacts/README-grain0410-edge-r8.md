# Edge r8 frozen experimental QA transfer

Unpublished QA candidate, not an accepted release. Actual browser visuals, feel and high-density realtime performance remain unverified. Preserve every previous archive; no main update or Site deployment.

- grain0410-edge-r8-delta.tgz: 14573 bytes; SHA-256 c86a1808ce19a3ae442f1c2596a8fbf7b44d651cb672e7badfa2ea873ef339c0; Git blob b62c1561fc09cd3251e0716b6d702ca70847dd01.
- grain0410-r8-evidence.tgz: 712288 bytes; SHA-256 b956a014ba831c4b8450b4723fb51241981de7e1198375ec7eb189c646d45b96; Git blob d5027c3f65fbfd3c288310aca9db92b9aec7f486.
- Required r7 delta SHA-256: fe4bfd667b2efc8be90f6949e508a27edc8cf2569a71fc28c0e48454ae7fc79b.

Build from a separate complete frozen r7 copy. Verify archive checksums, preserve the prior revision manifest, overlay the seven listed files and verify all old/new hashes plus ten runtime hashes. Only ca-world.mjs changes among runtime sources, using single-visit local interleaving. The rejected four-round experiment is excluded. Do not repair frozen sources.

Extract evidence separately. This evidence archive has no separate per-file manifest; verify its whole-archive SHA-256. Included replay/model sources were checked against the runtime hashes. Images and silent video are offline technical comparisons, not actual-browser performance evidence.

Local reports record 76 Node tests, 340 RGBA comparisons, 320 slot cycles, 115613 legality events and 3611 additional fixture events. For the first 20 blocks, simulation ticks fell from 1264 to 423 and total CPU from 17.27 to 6.08 seconds, but single-step p95 did not decrease. These are local headless results, not a claim of realtime browser acceptance. Independently review rapid-flow visuals, game feel, absolute frame budget and high-density behavior before any release decision.
