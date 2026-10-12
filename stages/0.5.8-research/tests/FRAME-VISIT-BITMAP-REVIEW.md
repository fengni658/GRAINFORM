# 0.5.8 FrameWorld visited-slot bitmap independent review

## Result

No blocking regression found. Final tagged source passes **17/17 tests**, with no skips: 14 core/diagnostic cases plus 3 deliberate ordering mutants. The main paired oracle performs 231 display-frame comparisons, 585 rule-step comparisons, 182 presentation acknowledgements, and 492,708 paired interpolation assertions.

The oracle uses the actual frozen `grain056-candidate/candidate` implementation. `materialPaths`, `frameIds`, chunks, cache/patch maps, and removals are compared in their original order. No business data is sorted, normalized, rounded, or omitted to hide a mismatch.

## Source binding

Final candidate: `grain058-candidate/candidate`, version 0.5.8.

Manifest build ID: `b-bb03cf0b2a27da2086c9a803d51834da17fb5f50ed224ffc36ec02b9dbbb16ad`.

Verified SHA-256:

- ca-world.mjs: `d3680acc7b6ddf7c7e2c31b1763dce28dbc4ba460bbe0e7f59d4f3824ef9d9e4`
- ca-frame-world.mjs: `85f5f4d4f379d9c8f65a48e51b487ca1ca17a8960dcfd8e337edf74ced32baa1`
- board-geometry.mjs: `77e8cb070b0787fd7dc8f5beb4455a59d77f111ca6785a7eb7e33ed3fce06502`

The first 14-case passing run preceded the version label change and is retained in `frame-visit-bitmap.results.log`. A final 17-case run after the board/index labels changed to 0.5.8 is retained in `frame-visit-bitmap.final-results.log`; its two physics modules match the manifest above. World snapshots and the tested business data do not include the version label, so no version normalization was necessary.

Only files inside `grain058-candidate/tests` were written by this reviewer. Product modules were read only. Mutants are generated in memory using data-URL ES modules; no product mutation or mutant runtime directory is written.

## Checks and coverage

Every normal paired frame checks snapshot and body values, RNG state, live/dead identity and free-slot stores, velocity/credit, quiet/potential/changed arrays, chunk insertion order, movement counters, full rule-path and frame-path buffers/stamps, dirty bounds, body cache and pending patch insertion order, revisions, readiness and presentation gates. Each rule step additionally compares snapshots, RNG, velocity/credit, current stamped slots, chunks, pending/move counts, dirty bounds, and no-move sweeps. Selected frames consume full and delta patches, repeat consumption, and deliberately withhold presentation ACKs.

1. Late first movement: slot 0 holds in substeps 1–3, then first moves at phase 52 in substep 4, while slots 1 and 2 move earlier. Material paths must remain `[0, 1, 2]`, with slot 0's unchanged origin recorded at phase 0.
2. Later first visitation: a naturally sleeping floor slot 0 wakes only after falling slot 1 enters its chunk neighborhood. `frameIds` must remain `[1, 0]`, preserving discovery across substeps rather than globally sorting the frame.
3. Bit 31 and word boundaries: 130 live slots exercise 31/32, 63/64, 95/96 and 127/128 with physical traversal order different from slot order.
4. Deletion holes and LIFO slot reuse: removed IDs stay invalid, regenerated public IDs retain ascending live-slot order, and pre/post-step removal/upsert/revision behavior agrees.
5. Capacity edge: valid admissions populate the entire fixed 20,736-slot store before most slots are removed. Sparse survivors include slot 20,735 (`C-1`, bit 31 of word 647). Shortening only the bitmap to 1 word and then 0 words restores its required 648-word capacity and retains the last slot's path.
6. Persistent old path: a controlled remote-chunk selection leaves a live slot unvisited; its old path coordinates/count/stamp and old frame metadata persist unchanged but do not enter the new frame.
7. Unvisited clear/reset: after real remove and reuse, `_resetSlot` clears pathN/frameN and sets old stamps. A controlled remote-chunk selection keeps this new generation unvisited, proving neither old-generation paths nor phantom new paths leak into the frame. Another surviving unvisited old generation is checked simultaneously.
8. Quiet floor and idle frames: two no-potential sweeps sleep the floor, a pending frame still blocks readiness, final ACK releases it, idle frames have empty frameIds, and a direct empty base step resets its previous captured list to null.
9. Cross-chunk support removal: a naturally sleeping full-width 48-row slab loses its bottom row. Its first four substeps retain fractional gravity credit and pending state without moving; the next frame moves coherently. The entire support-wake behavior, buffers and paths agree with baseline.
10. Bounded seeded admission/removal sequence: 70 display frames with accumulated/unconsumed patches and intermittent ACKs compare exact evolution and ordering.
11. Real CompositeBuilder/CompositeQueue: emitted groups, poses, revisions and final ACKs agree. Early draw cannot acknowledge final pose; incorrect revision ACK and duplicate ACK are rejected.
12. Integer capacity fault injection: negative, C, C+31, and infinite captured values produce the explicit capacity error. These are defensive probes, not reachable gameplay states.

## Why the old full scan and bitmap select the same reachable set

`World.step` freezes its integration list before movement. Every integrated slot gets `pathN=0` and `pathStamp=tick`, including stationary holds. Its own movement loops only move members of that same list, so they cannot create a current stamp for an unvisited particle. Admission resets a slot to an old stamp, and removal clears its live membership. Previous-step paths keep an older stamp and are therefore excluded by the original full-scan predicate as well.

The captured list is iterated into a bitmap; ascending word traversal plus least-set-bit extraction enumerates ascending slots, matching the old scan within each substep. Unsigned removal of the low bit handles signed bit 31 correctly. The frame-level first-discovery mechanism is unchanged, so later-woken lower slots append after earlier higher slots. The current normal call path has no extra unvisited live/current-stamped slot that the full scan would have merged.

The bitmap growth check repairs only an undersized visitation buffer against the fixed live-store length. This review does not claim that the physical, path, or frame stores support dynamic capacity growth.

## Oracle sensitivity

Three intentionally wrong implementations are detected:

- Collect moving particles only: drops early holds and outputs `[1, 2, 0]` rather than `[0, 1, 2]`.
- Enumerate `stepIds` directly in physical integration order: outputs `[2, 0, 1]` rather than `[0, 1, 2]`.
- Sort `frameIds` globally: destroys the late-wake `[1, 0]` order by changing it to `[0, 1]`.

These negative controls verify that the fixtures actually distinguish the original ordering contract rather than passing after normalization.

## Non-contract diagnostic and limits

Injected NaN, fractional, undefined and string slots are not rejected by the range-only guard. They cannot originate from the normal internal Int32 grid-value-minus-one list. This is recorded as out-of-contract injection behavior, not a production regression or a recommendation to add checks to every hot-loop visit.

This is a bounded native semantic review, not a natural-browser performance test, long-duration stability claim, or RGBA renderer comparison. No large matrix was run. The final short test process lasted about 5.17 seconds and had already started when the parent announced an exclusive benchmark; the possible overlap was reported immediately after process completion, and no further Node tests were started. Its duration is not performance evidence.

## Reproduce

`NODE_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules node --test grain058-candidate/tests/frame-visit-bitmap.test.mjs grain058-candidate/tests/frame-visit-bitmap-sensitivity.test.mjs`
