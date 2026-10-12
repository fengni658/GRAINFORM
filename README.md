# GRAINFORM 0.5.5 startup QA baseline

This branch preserves the delivered 0.5.5 startup hotfix and the original 0.5.5 motion build. Main remains the accepted 0.5.4 version. No 0.5.6 or later changes are included.

Node.js 20+; npm install installs pinned @napi-rs/canvas 0.1.100 for tests. npm start serves the game on http://127.0.0.1:4181/ . npm test runs release integrity/HTTP checks and 20 deterministic startup/preview/native-canvas contracts. The runtime itself has no third-party dependency.

RUNTIME-MANIFEST.json binds 18 production sources and 37 served files. Original and hotfix content-addressed builds are preserved. validation/startup-0.5.5 contains self-contained source fixtures, tests and exact build identities. Test output is generated locally rather than committed as internal execution logs.

The hotfix changes only app.mjs: synchronize current document visibility after adopting an epoch and before explicit resume. A controlled real-worker protocol test reproduces the old hidden-initialization race; the fixed candidate resumes. This is a demonstrated failure mode, not proof of the user's screenshot cause. Real Chromium ordinary startup/play and deployed-cloud-browser start, pause, resume, restart, keyboard, hard drop and next-piece checks passed. Natural hidden lifecycle remains incompletely reproduced.

0.5.5 reduces synchronized diagonal flow, but retains occasional nine-grain runs and possible subtle local cadence. It does not promise absence of starvation, commercial quality, or browser FPS improvement. Historical builds and other project files remain preserved.
