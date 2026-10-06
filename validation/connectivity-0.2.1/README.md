# 0.2.1 connectivity validation candidate

This is an intentional fine-preview rule change from four to eight neighbors.
Same-color particles touching at a corner now belong to the same component.
That one component must still reach BOTH left and right walls. Detection never
fills gaps, recolors particles, crosses another color or clears unrelated islands.
The default 96×144 game retains its four-neighbor rule.

A reported thin cyan connection is more consistent with a diagonal corner after
sampling the rendered image. A scaled/antialiased screenshot cannot recover the
original grid or prove a four-neighbor BFS defect. It is not an exact-state repro.

## Minimal change and preserved behavior

The fine engine adds four bounded diagonal edges to the existing BFS. Queue
reuse, visited stamps, boundary-color prefilter, ten-tick scan schedule, sleeping
particle eligibility, clear animation, score/level/chain formula and conservation
remain unchanged. No dilation or distance-based tolerance is used. Particle
motion, renderer and the verified audio lifecycle/diagnostics are unchanged.
The cold AudioContext constructor delay and historical frame-gap issue are not
claimed fixed by this change.

## Local checks

- Base suite: 28/28
- Preview suite: 66/66, including eight new connectivity and two version/help tests
- Independent union-find oracle: 95,231 comparisons pass, including exhaustive
  3×3 three-state and 4×4 binary boards, random sizes/colors, empty rescans,
  full 288×432 boards and visited-stamp rollover
- Frozen P3 dynamics comparison now explicitly disables clearing in both engines;
  the frozen file is unchanged. The new rule is checked against a separate DFS
  oracle, not falsely described as equivalent to the old clearing behavior

## Independent browser verification

Verify package 0.2.1, the visible fine-game version, ?qa build
`grainform-fine-0.2.1`, rules.connectivity=8 and the updated help text.
Run the repository tests and normal native UI start/input/pause/restart checks.
Record the exact tested commit and any unverified checks with the results.

If a supported browser fixture mechanism is available, label this explicitly as
a SYNTHETIC functional fixture, not a recovered user board or endurance test:

- Use the normal 288×432 fine grid with no active piece
- Cyan rectangle: x0..144, y418..431 (2030 particles)
- Cyan rectangle: x145..287, y402..417 (2288 particles)
- Gold particle at (145,418); isolated cyan particle at (100,390)
- Leave (144,417) empty. The two rectangles touch only diagonally at the hinge
- Keep the fixture initially asleep; set conservation counters consistently
- On normal simulation/resume, the connected 4318 cyan particles must clear as
  one region, leaving gold and the isolated cyan. At level 1 / chain 1 the score
  increase is round(4318/9+100)=580. No region may be removed twice
- Repeat as separately labeled negative fixtures after removing or recoloring
  the hinge at (144,418): neither mass may clear because there is then a true gap
- Check a one-particle orthogonal span, mixed-color bridge, one-wall-only region,
  distant same-color island and row-boundary non-wrap

If fixture installation is unavailable, record that coverage as Node-only.
Browser FPS/performance and normal gameplay observations remain separate from
deterministic fixture checks. Preserve every
failure, seed, actual input time and measurement limitation; do not reroll for a
favorable result.
