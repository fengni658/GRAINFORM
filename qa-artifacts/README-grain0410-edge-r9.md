# Edge r9 frozen QA candidate: time gates remain unmet

This is not an accepted or deliverable release. First/second blocks take 46/88 ticks; block 20 takes 159 ticks (about 2.65 seconds); the first 20 total is 6.4% above r7. Original relative-time and 2-second targets remain unmet. Browser feel, peak frame cost and full-game acceptance remain pending. No main update or Site deployment.

- grain0410-edge-r9-delta.tgz: 42138 bytes; SHA-256 fa663fa12dee3f47773245d0abbb46f53e6037d272f50b7f6e13b934fa187e6f; Git blob 048dddfdcf49ac955f0f1096c86fa552223fa577.
- grain0410-r9-evidence.tgz: 299485 bytes; SHA-256 1a71f36b52978b20ac1a90009f5576c81ae0e160b247969c6b856dfad6784d93; Git blob a21b36b3dbbfc4a5e2f68e01c10c945157f351b1.
- Required frozen r8 delta SHA-256: c86a1808ce19a3ae442f1c2596a8fbf7b44d651cb672e7badfa2ea873ef339c0.

Preserve every earlier archive. Build in a separate complete r8 copy; verify archive hashes, preserve old manifests, overlay the 22 listed files and verify all previous/new hashes plus ten runtime hashes. Only game.mjs, ca-world.mjs and ca-adapter.mjs change among runtime files. The revision uses 1/240 material time, analytic current-step transport without accumulating sleeping credit, an ordered wake-front and reduced temporary body allocation.

Extract evidence separately and verify all 58 EVIDENCE-MANIFEST entries. Local tests cover Node/RGBA/identity, new motion legality, all-awake paths and exact allocation-optimization equivalence under the new physics. Do not mistake these for equality to the historical 551 trajectories or real-browser performance. Included initial failure logs are historical evidence, not current pass results. Technical images and silent video are offline comparisons. Run independent full-game checks without editing frozen sources before any release decision.
