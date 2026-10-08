# Manual hardware physics checkpoint

Place this folder at `hardware/` beneath the existing verified GPU probe root. It depends on the unchanged verified core and the separate frozen `scale/` harness. The default URL does not run a test. Only a user click or the exact valid query contract below starts one bounded run. No new dependency, graphics flag, driver setting or security change is required.

Required core manifest: 991c1d0af503ea4d3bec0f7eac4315fa2b0f3a8a39dc7dfd83fb6627acc9f830.
Required scale manifest: 747defb3d4499c133a9c2202640f5801b4e83ce73f52200257689f20cc0899f1.

Open `hardware/index.html` through the same supported web origin as the existing probe. Keep the tab visible. Start with144/64; then144/32. If no errors,4056/64 and4056/32. Each click runs up to12 fixed steps with a5-second single-step completion limit and60-second observed budget. Fence timeouts are incomplete failures; do not repeatedly retry. This timing run audits final geometry only; the separate scale quality run established its own limited windows. The page keeps machine-readable reports in `window.__GRAINFORM_HARDWARE_REPORT` and visible JSON.

Record browser, renderer string, hardware model separately, power mode and visibility. Renderer strings are diagnostic, not proof of physical GPU identity. Earlier driver work may be warm; initialization and first-in-world step do not establish globally cold measurements. Single-step timing includes JS submission, driver queue and asynchronous fence polling. Readback/audit are reported separately at the end. Do not report this as presented FPS or pure GPU timestamps.

At120Hz, physical throughput needs8.33ms/step on average before rendering/input overhead. A60Hz rendered frame requires two physics steps.64/32 projection rounds produce166/102 draw calls per physics step. If physical completion already greatly exceeds that budget on the verified hardware, pause integration and report the route has not met the goal. If it fits, next gates are4056 long-run and support deletion quality, then combined two-step plus direct-texture render timing and the real-game clock. This page does not implement those later gates.

## Preserved cloud result (coordinator report, not hardware evidence)

Core commit06f41d and scale manifest above. SwiftShader144x600 at64 and32 rounds: every-step overlap/wall0. Actual4056x3 at both rounds: every-step0. Separate12-step timing windows: final geometry0; identities/colors/count preserved and no invalid flags. Mechanical energy decreased in observed windows, not a general energy certificate.

Completion cost mean/p95 milliseconds:144/64=38.84/48.10;144/32=22.74/29.40;4056/64=768.84/832.90;4056/32=408.43/518.80. Software costs do not predict physical GPU results.4056 long-term32-round stability, sleep, whole-game real-time and hardware FPS remain unverified. Original failed absolute-F32 prototype remains a historical failure, not relabeled as passed.

## Explicit navigation-only launch

For a supported browser tool that can navigate and read DOM but cannot click, use `hardware/index.html?run=1&scene=144&passes=64`. The other permitted values are `scene=4056` and `passes=32`. All three parameters must appear exactly once and match these values. Missing, duplicate or invalid values never run a test. One navigation starts only one run, at most12 steps. The page never retries, redirects or polls for another test. Read the visible status and JSON text in the page; the window object is optional. Do not repeatedly refresh a running test. Each intended new URL navigation constitutes a separately requested run.

This entry accesses ordinary WebGL application APIs only. It does not navigate internal browser pages or change browser security settings.
