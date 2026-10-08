# Scheduler-controlled GPU throughput diagnostic

Place at `timing/` beside the unchanged core and `scale/`. Default URL does not run. Explicit `timing/index.html?run=1&scene=144&passes=32` runs once;144/4056 and32/64 are the only accepted values. Do not navigate the4056 case until the coordinator authorizes it after reviewing144. No graphics flags or internal browser pages.

The original single-step asynchronous fence polling used setTimeout(1). Real browser callbacks may be coalesced/delayed; the observed9.5–14.5ms plateau is not proof of intrinsic GPU time. This diagnostic preserves that safe nonblocking API while recording each actual timer delay, poll count and first-poll completion.

One run: initialization;1 physical warmup step;4 zero-work fences;12 steps submitted as one batch with one completion fence;3 groups of2 steps with one fence each;final readback and independent geometry. Total19 physics steps, at most5sec/group and60sec observed window. A timeout is incomplete, not a passed measurement. First warmup and initialization are separate from batch throughput. Batch12 mean includes submission, driver work and one scheduler tail, not pure GPU time. Zero-work fences show a control distribution, but must NOT simply be subtracted from active samples as exact GPU time. Two-step groups are not rAF/display samples or whole-game real-time proof. Final geometry only is checked here; existing independent per-step scale gates remain separately scoped. No sleeping or rendering integration.

Read visible JSON or window.__GRAINFORM_TIMING_REPORT. Source core and scale manifest requirements remain991c1d0af503ea4d3bec0f7eac4315fa2b0f3a8a39dc7dfd83fb6627acc9f830 and747defb3d4499c133a9c2202640f5801b4e83ce73f52200257689f20cc0899f1. These files do not change either source.
