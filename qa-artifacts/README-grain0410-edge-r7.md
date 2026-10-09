# Edge r7 experimental QA transfer: acceptance gate FAIL

This is an unpublished experiment, not an accepted release. Sixth-block settling rises from 131 to 146 ticks (+11.45%), FAILING the original relative-duration gate. The reported pile width is 17.6% narrower and the style is steeper. Preserve these tradeoffs; do not compensate by changing the clock or claim all acceptance passed.

- grain0410-edge-r7-delta.tgz: 14369 bytes; SHA-256 fe4bfd667b2efc8be90f6949e508a27edc8cf2569a71fc28c0e48454ae7fc79b; Git blob c7702016fc6b8a94fd10d01a1f48107f674932fb.
- grain0410-r7-evidence.tgz: 1113625 bytes; SHA-256 0a837aab3838ad1cd9b1414127356273a230290364731499eaeaa006a5959703; Git blob 957f52eb08a35521f6dc3f0146adc16b3f1aca3d.
- Required r6 delta SHA-256: 296fabee8b501747fedd5b3acdf303a8f2a40d408da8669c4aff3a20de094c36.

Build from a separate complete frozen r6 copy, whose source chain is r4 -> r6, not r5. Verify archives, preserve prior manifests, overlay exactly five r7 files and verify all old/new and ten runtime hashes. Only ca-world.mjs changes among runtime files, limiting complete-slip reach to one adjacent column. All other runtime files retain r6 hashes. No main update or Site deployment.

Extract evidence outside candidate trees and verify 22 evidence manifest entries. Local reports record 76 Node tests, 340 RGBA comparisons, 320 slot cycles and 115253 legality events. Offline technical images and silent videos are not actual-browser performance evidence. Full-app visual/style and performance acceptance remains pending, in addition to the known relative-duration failure. Preserve every old archive and frozen candidate.
