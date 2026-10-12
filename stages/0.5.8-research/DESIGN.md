# 058 bounded frame-path enumeration

Status: implementation under independent equivalence review, not frozen or released.

## Scope
The 056 lifecycle fixes remain the baseline. The rejected 057 lateral ordering experiment is not merged. Material physics, four rule steps, rendering, transport and final presentation ACK are unchanged.

The original FrameWorld visits every allocated slot after each active rule step and accepts only live slots stamped by that step. World already collects the exact integrated slot set and stamps every member, including stationary holds. The candidate retains this existing array for the current step and marks it into a bitset; ascending word/bit enumeration reproduces the old ascending slot order. Origin copying and frame paths remain unchanged. This must preserve first encounter order across all four substeps, not merely the unordered path set.

## Bounds and lifetime
Current fixed store capacity is 108×192 = 20,736 slots. The bitset is 648 Uint32 words = 2,592 bytes. This is an auxiliary buffer bound, not support for resizing all physical arrays. If its own buffer is shorter than the existing live store, it reallocates to that store's size. Actual World IDs originate from Int32 grid entries, so the internal array contains integer slots. Out-of-capacity slots fail rather than silently drop.

The current step array is reused, not copied or sorted again. It remains referenced until the next rule step (which resets it before any early return), then is reclaimable. The bitset is cleared over ceil(n/32) words each active step. No quiet frame work or persistent per-particle freeze state is added.

## Required equivalence
Compare materialPaths in original array order, all hold/late first movement legs and interpolated positions; physical arrays, RNG, cache/body patches and revisions; removal/reuse and high slot holes; clear marks and stale path stamps; support removal; presentation readiness before and after the successful final draw. A dormant prior path with an earlier stamp must stay omitted. Clear metadata still passes through the existing full sync path, which is not optimized here.

## Measurement
The previous one-run profile found 4,974,255 full-scan slots versus 202,355 physical integration visits. It does not establish a speedup: inclusive method bounds leave only about 51–75ms attributable to frame assembly plus probe overhead. The paired collector must count marked IDs, cleared/enumerated words and visited slots separately, then compare total measured Game.step and submission/readback under the same fixed sequence. It uses native Canvas and same-process structuredClone, not browser FPS or actual worker IPC.
