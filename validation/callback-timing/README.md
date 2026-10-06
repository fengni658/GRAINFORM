# Callback wall-time diagnostic candidate

Based on the verified 0.2.1 source. This is a measurement correction, not a
performance optimization or a website deployment. Connectivity, motion, rendering,
audio initialization order, settings, score storage and version are unchanged.

## Why the boundary changes

The legacy `session.*Work*` timer stopped before SessionMetrics.record,
FrameDiagnostics.recordFrame, ring writes and requestAnimationFrame registration.
QA JSON generation was already inside that timer; it was not the missing tail.
A browser-trace frame and this narrower core measurement cannot be compared as
if they represented identical work. CPU time also differs from wall time.

The legacy fields remain, with their old core scope. New visible `callback`
fields measure normally completed callbacks as follows:

1. Outer start timestamp
2. Aggregate the prior completed sample; this is the new callback's measured prelude
3. Original core start → game update/DOM/Canvas/visible JSON → original core end
4. Existing metric recording, stage history, rings and next-RAF registration
5. Final timestamp, followed only by a fixed commit call with two scalar stores

Thus `fullWallMs = preludeMs + coreWorkMs + tailMs`. All histogram/top-sample work
for the new measurement occurs at the next measured callback entry. There is no
recursive recomputation, extra timer, extra RAF or per-frame JSON export. The
fixed final clock/commit invocation and return overhead is explicitly excluded;
this is not a claim of measuring the engine's exact function-return instruction.
Callbacks that throw before the end remain outside the new normal-completion
metric; original exception propagation and RAF-loop behavior are unchanged.

## Reading the result

- `callback.schema = callback-wall-v1`
- `full` / `playingFull`: cumulative count, mean, p95 and maximum wall duration
- `tail` / `playingTail`: the portion previously outside the core boundary
- `prelude` / `playingPrelude`: mean/max prior-sample aggregation work
- `latestCompletedFrame`: IDs, timestamps, core/prelude/tail/full decomposition
- Detailed output retains six slowest playing callbacks and six slowest tails,
  including existing phase/engine/render/input context even for a tail-only spike
- 0.05ms histogram buckets; an overflow p95 returns the observed maximum

During callback N's visible export both session and callback counters cover N−1.
Between callbacks, legacy session has N while callback aggregates have N−1;
`pendingCompletedFrame` exposes N until the next callback. A hidden page does not
add its idle time to a callback; the last sample remains pending while RAF stops.
Full timing is not CPU time, GPU presentation, input-event latency or RAF gap.
Audio/startup event timing remains separate and unchanged. The added snapshot
cost itself appears in both core and full duration whenever it is exported.

## Verification and trace follow-up

Focused tests inject 35ms into SessionMetrics, 14ms into stage recording, 4ms into
RAF scheduling and 7ms into the new aggregation prelude. The actual app then
retains core 0 ms, tail 53 ms and full 60 ms: the old missing work is visible. Another
app test places 11 ms into visible export and sees it in both core/full metrics.
Tests also cover attribution across pause, histogram overflow, bounded retention,
no double aggregation, one-frame lag, summary mode and tail-only context.

Independent browser verification should run the same browser tracing workload
against baseline and candidate in separate copies. Correlate frameId/RAF and
callback start/end with the trace; retain slow samples and compare like-for-like
wall versus CPU scopes. Test ?qa and ?summary without interpreting diagnostic
changes as FPS improvements. No new random endurance run or audio-order change is
needed to validate this measurement boundary.

Final local checks: base 28/28, preview 75/75 and all JS/ES-module syntax checks pass.
The nine new timing tests also passed independent rerun. An independent 500-frame
app-harness check found no reference cycles, growing history or frameId/context
mismatch; retained contexts stayed unchanged and top lists stayed at six entries.
These are mocked/Node checks, not new browser trace or performance results.
