# First response before cold audio: proposal, not a product change

Current product audio order is retained. A synchronous AudioContext constructor
still costs roughly 50–82 ms in the reported fresh-browser observations. Changing a
timer's start point cannot remove that delay.

## What is and is not supported by evidence

Drawing/resetting before AudioContext in the same task only changes the backing
state; it does not establish earlier visible presentation. A microtask does not
supply a rendering boundary, and constructing inside the first RAF can block that
frame because RAF callbacks precede rendering work.

A test-only variant may schedule a task from the first normal playing RAF after
its draw. This is an after-render-opportunity pattern worth testing, not a
physical-display guarantee. It moves the constructor stall later and could delay
subsequent input or cause simulation catch-up; it does not eliminate the cost.

Web Audio's current draft allows activation-based gating. Task boundaries do not
automatically erase activation, but browser policy differs: current WebKit checks
transient activation in ordinary first-start handling, so relying only on sticky
activation would be unsafe. Background throttling, expiry, iframe permissions,
older versions and user settings remain compatibility risks.

## Bounded experiment to approve before any product behavior change

Use a separate test variant only, never replace the shipped handler blindly:

- Start/reset immediately from a real gesture with sound enabled
- Defer only first context creation: first normal RAF draw → one queued task
- Keep warm-context behavior unchanged and never prewarm silently
- Use one session token; cancel on mute, pause, dialog, restart, blur, pagehide or
  hidden visibility, and recheck all conditions just before creating audio
- If another real input initialized audio first, cancel the queued attempt
- Never replay queued historical sounds; do not disable gameplay inputs to obtain
  cleaner timing. Constructor/resume errors and indefinitely pending resumes must
  remain recoverable through valid later gestures

Required deterministic lifecycle tests: no construction in the original handler
or first RAF; exactly one subsequent task; no duplicate context; mute/cancel at
both scheduling boundaries; stale restart task suppressed; another input wins;
throw/reject/pending resume paths remain nonblocking. These are proposed tests,
not evidence of browser rendering or autoplay behavior.

A browser trial must use browser performance tracing and genuine input. Start
with a bounded baseline-versus-variant set in the available engine, then cover
other target browsers before any cross-browser claim. Record launch flags and
separate fresh process/profile, reloaded document and existing-context restart.
Retain every failed attempt rather than rerolling.

Measure together: trusted event time and handler interval, first updated draw,
first browser-observed frame containing the new game, task delay, constructor and
resume call/settlement, running state, queued-input delays, subsequent frame gaps
and simulation catch-up. Trace frames/screenshots are needed to distinguish draw
return from presentation. Physical display/audio-onset claims require suitable
capture; AudioContext running/resume resolution is not proof of audible output.
GRAINFORM has no Start tone, so audio-ready and first gameplay sound are separate.

Any autoplay failure, stale/duplicate context, unchanged visible response or a
mere shift of the stall into the next gameplay action argues for retaining the
current order. No deferred-audio behavior has been wired into this candidate.

## Primary sources

- HTML rendering/event loop: https://html.spec.whatwg.org/multipage/webappapis.html#event-loop-processing-model
- Activation model: https://html.spec.whatwg.org/multipage/interaction.html#tracking-user-activation
- Web Audio: https://webaudio.github.io/web-audio-api/#allowed-to-start
- Rendering experiments: https://web.dev/codelabs/understanding-inp
- Chrome autoplay: https://developer.chrome.com/blog/autoplay/
- Firefox implementation: https://searchfox.org/firefox-main/source/dom/media/autoplay/AutoplayPolicy.cpp
- WebKit implementation: https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/webaudio/AudioContext.cpp
- WebKit activation change: https://github.com/WebKit/WebKit/pull/6529
- Event Timing: https://www.w3.org/TR/event-timing/
- Trace frames: https://developer.chrome.com/docs/devtools/performance/reference
