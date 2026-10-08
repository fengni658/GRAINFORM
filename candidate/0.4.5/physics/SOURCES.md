# 0.4.5 distribution note

This game includes only fast.mjs (default) and adaptive.mjs (explicit opt-in). The following retained V8 research provenance also mentions normal-damping and other experiments; those files are NOT included or used by this game. They are historical background, not runtime dependencies. Original license notices are preserved under ../licenses/.

# GitHub source evidence and local changes

Read on 2026-10-08. No third-party library was installed or wholesale vendored.

1. Box2D v2.4.1, src/dynamics/b2_island.cpp lines282–300: full contact/joint position solves report success before outer early exit. Used as the pattern for bounded convergence-based early exit, not copying Box2D slop units into this pixel-scale simulation.
https://github.com/erincatto/box2d/blob/v2.4.1/src/dynamics/b2_island.cpp#L282-L300
MIT, copyright2019 Erin Catto, notice retained in licenses/BOX2D-MIT.txt.

2. LiquidFun b2ParticleSystem::SolveDamping, lines3105–3149: only approaching relative normal velocity is damped, with opposite impulses on two dynamic particles. Read from master; commit was not verified, so this is deliberately NOT represented as a pinned commit.
https://github.com/google/liquidfun/blob/master/liquidfun/Box2D/Box2D/Particle/b2ParticleSystem.cpp#L3105-L3149
https://raw.githubusercontent.com/google/liquidfun/master/liquidfun/Box2D/Box2D/Particle/b2ParticleSystem.cpp
Google2013 zlib source notice retained in licenses/LIQUIDFUN-ZLIB.txt.

LOCAL MODIFIED EXPERIMENT: normal-damping.mjs is not an official LiquidFun integration. It adapts the approaching-normal damping principle to hard-circle PBD contacts: binary weight1, experimental linear coefficient0.2, critical velocity D/dt, sleeper treated as fixed target, damping after reconstruction from projected positions, once per candidate contact per substep. Its coefficient0.2 is NOT claimed to be the library default. The linear floor is not dt-scaled, so different substep counts imply different accumulated damping. This appearance candidate is NOT the default retained performance branch.

3. Box2D v3.1.1 island.c contact-link wake behavior was inspected as a contrast with the experiment's closing-speed wake threshold. No new wake policy was merged in this round.
https://github.com/erincatto/box2d/blob/v3.1.1/src/island.c#L107-L128

The core project remains a custom simplified circle/PBD experiment, with the existing visual octagons, mass/color rules and numerical model limitations. Neither source reference makes it an official Box2D or LiquidFun port.
