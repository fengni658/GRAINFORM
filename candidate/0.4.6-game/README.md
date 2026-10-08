# GRAINFORM 0.4.6 · local grid game candidate

Independent 0.4.6 playtest; the0.4.5 game is unchanged. This version uses the selected discrete triangular-slot sand rule. Radius remains0.875 with0.870 octagon display, four colors and exactly676 grains per tetromino. Positions snap between valid slots; this is not the previous continuous circle solver. No interpolation through neighboring particles is used.

The seven tetrominoes, seeded piece/color sequence, rotation, horizontal/soft/hard drop, normalized score/level and0.2-second clear delay are retained. Each24×24 block cell selects169 legal circular slots with a deterministic stratified selection. All676 enter atomically; expected capacity/occupied-slot refusal ends the round without partial grains or drop-score credit. Top-out and restart remain ordinary game states.

Same-color six-neighbor slot components that span both walls clear together. Clear highlighting freezes sand for24 control ticks, then removal wakes the local neighborhood. Score remains normalized by64/169 per grain with the existing region/chain/level formula. The slot graph is a gameplay connectivity rule, not a claim of continuous physical contact.

Stable sand is excluded from the active queue. No old particle is silently discarded to maintain performance. The inherited rolling rule shares movement credit with downward movement; some large support removals have a visible settling tail. No new material/credit variant is mixed into this release.

## Running

`npm test` runs game and UI/worker contract tests. `npm run verify` replays seed1 actual game inputs for six pieces (4056 grains) and eighteen pieces (12168 grains), writes snapshots, audits and measured Node throughput to evidence-grid/. Node throughput is not browser FPS. `npm start` serves the runtime allowlist on127.0.0.1:4181. The runtime manifest is the authoritative deployable file list.

This development environment has not run the browser. Independent browser QA must verify controls, touch, restart epochs, storage isolation, rendering, actual simulated/wall time and dense-scene frame cost before release claims. The benchmark prototype previously completed4056 near60Hz in the second environment, but12000 accumulated debt; that prior result is not a performance certificate for this changed full-game renderer.

Use only the current runtime/source manifests when copying the candidate. Legacy copied physics experiments, old evidence and old tests are not0.4.6 runtime or validation evidence. Do not publish them through the runtime server.
