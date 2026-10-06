# Historical 0.2.0 audio-startup candidate, inherited by 0.2.1

This independent test branch is based on public main commit
`f34f17f62ef0051c62474f10cd9f391c6ff608e1`. It adds startup/audio diagnostics and
pending-resume deduplication to the experimental fine-grain preview only.
This section records the 0.2.0 audio candidate now inherited unchanged by 0.2.1; the current package version is declared in package.json. This is a verification candidate, not a
production release or a claim that performance acceptance has passed.

The normal 96×144 entry, fine-grain physics, renderer, tone generation,
settings/high-score storage keys and license are unchanged. No website deployment
is part of this branch.

## Scope

AudioContext construction and resume() remain inside the calling user gesture.
Gameplay never awaits the audio Promise. Muted requests create and resume nothing.
A single context is reused. Repeated ordinary input does not issue another resume
while an attempt is pending. If a blocked inactive attempt remains pending, a
new inactive-to-active user-activation transition can retry; explicit Start,
Restart and sound-enable requests can also retry. An older Promise settlement
cannot clear a newer pending attempt. Constructor, synchronous resume and
rejected-Promise errors remain contained so later requests can recover.

Detailed timing is enabled only in `?qa` mode. Ordinary and `?summary` modes retain
normal audio behavior without reading the detailed diagnostic clocks.

## Run and inspect

Use Node.js 20+ and the existing static server:

```sh
npm start
```

Open `http://127.0.0.1:4173/preview/game.html?qa`. Startup/audio records appear in
the already-rendered `#qaOutput` JSON:

- `audio.unlock.lastConstructor`: source, before/after timestamps, synchronous
  wall time, outcome and returned context state
- `audio.unlock.lastResume`: source, synchronous wall time, Promise settlement
  and elapsed time, activation/retry reason, outcome and context state
- `audio.unlock.counts` and `max`: cumulative attempts, errors, skips, retries
  and maxima; pending and outstanding Promise counts are explicit
- `startup.latest`: event/handler timing, synchronous audio interval, handler
  completion and the first playing draw completion

First draw completion means the Canvas calls returned. It is not GPU presentation
or the time sound became audible. Bounded histories retain the last 24 audio
attempts and 16 starts, while cumulative counts/maxima remain. Full frame history
is still exported only when not playing; no telemetry is sent.

## Tests and verification status

```sh
npm test
npm run test:preview
node --test tests/preview/audio-*.test.mjs
```

Candidate checks passed 28/28 base tests, 56/56 preview tests and 17/17 focused
audio/startup tests. These are Node and mocked-DOM results, not browser playback,
subjective sound-quality or real startup-latency measurements. They cover pending
Promise deduplication/recovery, muted behavior, existing tone generation,
constructor/resume failures and visible timing separation.

For fresh-browser verification, distinguish cold sound-on startup from a context
already initialized by the sound toggle. Keep all slow observations and record
browser launch conditions. Compare constructor wall time, synchronous resume,
Promise completion and first draw separately. Treat rejected/throwing mocks as
mock coverage rather than browser-observed errors.

This candidate does not establish that the earlier roughly 47–51 ms cold-start
cost or unexplained roughly one-second frame gaps are fixed. Stable 60 fps and
performance acceptance remain unproven. See the root `VALIDATION.md` for the
baseline's historical measurements and their limits; its original test counts
refer to that baseline snapshot, not this candidate's additional tests.

## References

The Web Audio resume algorithm can leave requests pending when a context is not
allowed to start. Retry paths preserve user-gesture activation requirements:

- https://www.w3.org/TR/webaudio-1.0/#dom-audiocontext-resume
- https://www.chromium.org/audio-video/autoplay/
