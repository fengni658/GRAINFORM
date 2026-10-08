# Independent verification for0.4.7

1. Check RUNTIME-MANIFEST.json and PUBLICATION-MANIFEST.json hashes for this public package. The complete private source ZIP retains its original SOURCE-MANIFEST and regenerable snapshots; those are not the file list for this smaller public package. Run npm test and npm run verify in isolation; verify regenerates the excluded snapshots. The independent QA report is delivered separately and is not included here. Public documentation corrections do not modify the original private ZIP or its SOURCE-MANIFEST.
2. Run npm start(port4181), open the real page and verify version0.4.7. Default must be playable with all seven pieces, four grain colors, keyboard/buttons/touch, pause/resume, reset and normal top-out.
3. Each piece creates exactly676 grains. Confirm conservation `bodyCount + rawCleared === added`, unique IDs and actual displayed grain count. Verify six actual drops reach4056 and eighteen reach12168; do not substitute a synthetic load without labeling it.
4. Verify a real six-neighbor same-color wall bridge clears after24 control ticks, visibly highlights, preserves the frozen physics state during that delay and wakes support dependents afterward. A constructed bridge must be labeled a fixture.
5. Validate the worker clock against real wall time. Report actual120Hz control-tick progress, debt, step/frame time and input-to-ack latency. Pause/hidden intervals are explicitly excluded from active simulation, but prior runtime debt must not silently disappear. Saturated runtime may report overload, never claim60FPS from a UI counter alone.
6. Verify full-sync/restart resets renderer state, delta sequence/revision gaps request recovery, and delayed prior-epoch updates/ACK/fatal messages are ignored. Clear removed and moved grains at their old cached positions; inspect for ghost pixels after collapse/restart.
7. Use isolated storage and confirm only grainform:0.4.7 keys change. Earlier0.4.6 records remain untouched.
8. Capture real browser images at initial/dense/clear/collapse moments. Record browser renderer; software rendering does not represent the user's physical GPU. The first development environment has Node results and offline endpoint renders only, not browser validation.

The chosen model is discrete local-slot gameplay. Differences from continuous motion, lattice texture and settling tails are disclosed. No commercial-performance claim is implied by passing functional gates.

## Exact browser QA interface

Open `/?qa&seed=1`. `window.grainformQA` exposes `read()`, `snapshot`, `command(name,value)`, `waitFor(predicate,timeoutMs)`, `resync()` and `bridge()`.

- Actual play: command('start'), command('move',dx), command('rotate'), command('drop'), command('pause'), command('resume'), command('restart'). Use normal game inputs for the six/eighteen-piece workloads.
- Artificial clear fixture: `await grainformQA.bridge()` resets to132 same-color bottom grains plus40 supported grains, with a new epoch/full-sync and visible artificial-QA marker. It follows the normal16-physical-tick scan and24-control-tick clear; it is not a naturally achieved gameplay result. Ordinary non-QA initialization rejects the bridge command without fatal error.
- Screenshot only after `read().lastDrawBodySequence === read().bodySequence`. For the visible clear use `lastDrawHighlightCount === 132`; afterward require0 highlights and40 grains. Do not infer that a received snapshot was already drawn.
- Read worker debt/active wall/sim time and renderer live/stable/dynamic counts from `read()`. Full `snapshot` intentionally scans bodies for inspection and should not be polled every animation frame while benchmarking.

## Contact / gravity regression gates

Verify old witness O at x120,y200 with slot row111,col51 does not convert before contact. Falling grains must not enter the complete airborne silhouette and must remain able to continue when it moves. Seeds1–4 free fall should alternate within half a slot of its fixed column; record120ticks rather than only the endpoint. A flat supported floor must not self-crawl; a supported downhill edge may slip and then must descend. Preserve live count and geometry at every deterministic24tick landing sample and support-removal sample.

For actual browser screenshots, pausing freezes simulation but overlays/blurs the board. Export the already-rendered gameCanvas PNG to inspect paused contact pixels; label it as a real browser Canvas bitmap, not an offline render or an unobscured full-page screenshot. Full-page narrow-screen/control screenshots can be captured while playing. Snapshot inspection is kept outside benchmark windows.
