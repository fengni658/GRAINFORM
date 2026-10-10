# Isolated slide B experiment (0.4.10)

Independent candidate based on frozen r13, not r14 or contact-flow. Only ca-world.mjs changes: remove the same-height lateral vacancy requirement for an adjacent downward diagonal; its destination must remain empty and inside the container. All 20 other top-level runtime files match r13. Timing, ordering, quotas, rendering and presentation ACK remain unchanged.

This is a discrete occupied-cell approximation, not swept-circle collision equivalence. It permits passage between corner-touching sand cells; an 8-connected corner-only barrier is not impermeable. Container boundaries and occupied destinations remain strict; complete axis-aligned walls block passage. The old lateral-clearance assertion intentionally does not pass. Internal rigid obstacles would need separate clearance handling.

## Packages and reconstruction
- slide-b-delta.tgz: 4575 bytes; SHA256 c6d259699373a6d7df26933e04c9d7e863254c361434ed1f6e6c01d8f16697e6
- slide-b-validation-evidence.tgz: 10544 bytes; SHA256 82ccf0f370c777946690313bd25be0711452f6826c61c0bc80e29cc9e2a68186

Create a fresh QA root with baseline/ pointing to unchanged complete frozen r13 and candidate/ copied from r13. Extract slide-b-delta.tgz inside candidate/. Extract slide-b-validation-evidence.tgz at the QA root. Verify B-RUNTIME-MANIFEST.json. Reproduction: node diagnostic/slide-b.mjs and node diagnostic/generation-check.mjs.

Read B-RESULT.md for limitations, evidence and the exact six-piece recording inputs. The numerical screen audited 524242 B movement events; it checks occupied targets, bounds, original quotas, mass/color, generations, quiet rest and endpoint receipts. First/second/sixth settle in 22/35/37 frames versus r13 43/69/89. These changes could look too fast or loose. This small experiment does not claim the full regression suite, old swept-clearance oracle, raster matrix or browser timing passed.

Continuous natural-game baseline/B recordings with seed 1 and QA OFF remain required. Numerical improvement is not visual acceptance or a completed flow fix. No deployment or main update is included.

Conceptual reference: Sandspiel's target-only diagonal check (MIT); implementation authored for this experiment, with no third-party source directly copied.
