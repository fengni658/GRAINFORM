# 0.4.8 revision2 cloud evidence

47/47 tests pass; two complete seeded replay state hashes match. Environment is default headless Chromium151/SwiftShader through installed Playwright, Node24.19; no custom security flags. These are previously reported observations, not new measurements performed for this source publication.

True full-game last-drop ACK to first observed active0: six seed1~0.933s; dense seed1~1.708s/12168live; dense seed3~2.242s/10216live after natural1952clear. Dense seed3 still fails2s. Node material-only seed3dense2.408s is separate scope. Prior six3.467s was incorrectly measured from a delayed tail check; original samples bound it~0.93–1.10s, per-step old-revision observer1.092s.

Material uses two-slot supported-pocket contact approximation, at most one neighbor descent per grain/tick; gravity/freefallcap unchanged. No age freeze/deletion to throttle. Snap endpoints pass geometry; continuous motion paths are not certified. New piles remain steeper.

Visible-state draw invalidation excludes clocks/diagnostics. Adaptive snapshots60Hzmoving/clear,30Hzstable preserve120Hz clock and debt. Final dense seed1/3actual draws51.21/50.24Hz; stable~30Hz/~24drawms/s with active/visits/polygon/dirtytile deltas0. Full-frame bitmap compositing for the moving rigid piece remains. Fixed60/30 same-material normal-sequence trials gave57.94/29.94draws/s and176.38/102.60drawms/s; ACKphases vary, no totalCPU claim.

Final dense seed3Game.step p95histogram2.2ms/max45.6ms/debt82.23ms. Earlier33.6msstep and133.3msrAF gap evidence remain archived. Final rAFmax33.4ms does not erase previous gaps. No main-thread longtasks in game windows; startup75–160ms tasks remain in raw records. No OS/workertrace root-cause claim for spikes.

Real controls/touch/hold/pause/resume/restart pass; topout13pieces8788grain conserves counts and freezes clock. Actual single/support clips regenerated for current material; dense clip attempt still failed at screenshot font wait. Raw QA includes previous source/data/report/trace and final runs. Hardware, background/headful, long sessions, thermal/power and commercial certification remain open. Playable release and commercial approval remain withheld until the remaining gates are addressed. This source-only public test package exists solely for further cloud QA.

## Package and reproduction

Use PUBLICATION-MANIFEST.json for this reduced public package and RUNTIME-MANIFEST.json for the seven runtime files. Run npm test and npm run verify; verify regenerates the excluded large snapshots. The original private ZIP retains its original SOURCE-MANIFEST and documentation unchanged. Raw QA reports, traces, videos and images are not part of this public package.
