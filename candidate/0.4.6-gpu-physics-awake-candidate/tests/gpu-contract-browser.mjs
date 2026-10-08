/** Real WebGL2 checks. Call this only in the authorized browser QA environment. */
import { createGPUWorld, GPU_CONTRACT as C, loadShaderSources } from '../gpu-solver.mjs';
function check(condition, message) { if (!condition) throw new Error(message); }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function bucketAudit(snapshot) {
  const expected = Array.from({ length: C.gridCols * C.gridRows }, () => []);
  const p = snapshot.raw.gridPositions;
  for (let i = 0; i < snapshot.particles.length; ++i) {
    const at = i * 4;
    if (p[at + 2] < 0.5) continue;
    const x = Math.floor((p[at] - C.gridOriginX) / C.cell), y = Math.floor((p[at + 1] - C.gridOriginY) / C.cell);
    if (x < 0 || x >= C.gridCols || y < 0 || y >= C.gridRows) continue;
    expected[y * C.gridCols + x].push(i + 1);
  }
  let occupied = 0, overflowCells = 0;
  for (let y = 0; y < C.gridRows; ++y) for (let x = 0; x < C.gridCols; ++x) {
    const ids = expected[y * C.gridCols + x];
    if (ids.length) occupied++;
    if (ids.length > C.bucketCapacity) overflowCells++;
    for (let slot = 0; slot < C.bucketLayers; ++slot) {
      const atlas = snapshot.buckets[slot % 2];
      const at = ((Math.floor(slot / 2) * C.gridRows + y) * C.gridCols + x) * 4;
      check(atlas[at] === (ids[slot] ?? 0), `Bucket mismatch at cell(${x},${y}), slot ${slot}: ${atlas[at]} != ${ids[slot] ?? 0}`);
    }
  }
  return { occupied, overflowCells, checkedSlots: C.gridCols * C.gridRows * C.bucketLayers, stableArraySlotOrder: true };
}

export async function runGPUShaderContract(gl, { passes = 64, shock = true } = {}) {
  const sources = await loadShaderSources();
  const cases = [];
  const run = async (name, particles, evaluate) => {
    const world = await createGPUWorld(gl, particles, { sources, passes, shock });
    try {
      const submitted = world.step(1);
      check(submitted.readback === false && submitted.gpuCompletionVerified === false, `${name}: submission incorrectly claims completion`);
      const snapshot = world.readback({ raw: true, includeBuckets: true });
      check(world.getGPUState().positionEncoding.name === 'cell-local-signed-code-v2', `${name}: encoding descriptor missing`);
      check(snapshot.raw.positions instanceof Float64Array && snapshot.rawEncoded.positions instanceof Float32Array, `${name}: raw/encoded precision contract`);
      for (let i = 0; i < snapshot.particles.length; ++i) {
        const at = i * 4, p = snapshot.rawEncoded.positions;
        check(p[at] >= 0 && p[at] < 4 && p[at+1] >= 0 && p[at+1] < 4, `${name}: noncanonical local position`);
        check(Number.isInteger(p[at+2]) && Math.abs(p[at+2]) < 2 ** 24, `${name}: inexact packed code`);
      }
      check(snapshot.diagnostics.gpuCompletionVerified, `${name}: completion missing`);
      const buckets = bucketAudit(snapshot);
      check(snapshot.particles.every(p => [p.x, p.y, p.vx, p.vy].every(Number.isFinite)), `${name}: nonfinite output`);
      evaluate(snapshot);
      cases.push({ name, passed: true, diagnostics: snapshot.diagnostics, buckets, particles: snapshot.particles });
    } finally { world.dispose(); }
  };
  await run('coincident-pair', [
    { id: 91, x: 140, y: 300, color: 1 },
    { id: 3, x: 140, y: 300, color: 2 },
  ], s => {
    check(s.particles[0].x < s.particles[1].x, 'Coincident normal must follow array slot, not business id');
    check(distance(...s.particles) >= C.diameter - 0.002, 'Coincident pair did not separate');
    check(!s.diagnostics.invalid, 'Coincident pair invalid');
    check(s.particles.every(p => p.sleep === false && p.quiet === 0), 'Unsupported sleep state emitted');
  });
  await run('floor-and-contact-damping', [{ id: 0, x: 100, y: C.floor - C.radius, vx: 6, color: 4 }], s => {
    const p = s.particles[0];
    check(Math.abs(p.y - (C.floor - C.radius)) < 0.0001, 'Floor clamp failed');
    check(p.touched, 'Contact touch was lost between iterations');
    check(p.vx > 1.5 && p.vx < 1.8, 'Expected two substeps of contact and floor damping');
    check(!s.diagnostics.invalid, 'Floor case invalid');
  });
  await run('local-cell-carry', [{id: 0, x: 31.99, y: 300, vx: 6}], s => {
    check(Math.abs(s.particles[0].x - 32.04) < 0.00001, 'Prediction lost a local-to-cell carry');
    check(Math.abs(s.particles[0].vx - 6) < 0.001, 'Velocity did not use local/cell displacement');
    check(!s.diagnostics.invalid, 'Local carry case invalid');
  });
  await run('seventeenth-slot-overflow', Array.from({ length: 17 }, (_, i) => ({ id: 200 - i, x: 140, y: 300, color: 1 + i % 4 })), s => {
    check(s.diagnostics.overflow && s.diagnostics.invalid, 'Overflow must remain sticky even if a later substep spreads the particles');
  });
  await run('out-of-grid', [{ id: 0, x: 20, y: 300, color: 1 }], s => {
    check(s.diagnostics.outOfGrid && s.diagnostics.invalid, 'Out-of-grid must be explicit and sticky');
  });
  await run('drift-proof-invalid', [{ id: 0, x: C.left, y: C.floor - 0.125, color: 1 }], s => {
    check(s.diagnostics.driftExceeded && s.diagnostics.invalid, 'Drift greater than 1 must invalidate the result');
  });
  const removalWorld = await createGPUWorld(gl, [
    { id: 70, x: 140, y: C.floor - C.radius, color: 1 },
    { id: 20, x: 140, y: C.floor - C.radius - C.diameter - C.contactSkin, color: 2 },
  ], { sources, passes, shock });
  try {
    removalWorld.step(2);
    const before = removalWorld.readback({ raw: true });
    check(!before.diagnostics.invalid, 'Online removal initial stack invalid');
    removalWorld.remove([70]);
    const removed = removalWorld.readback({ raw: true });
    check(removed.particles.length === 2 && removed.particles[0].id === 70 && !removed.particles[0].alive, 'Removal must preserve dead slot and ID');
    for (const key of ['x', 'y', 'vx', 'vy', 'contactStrength']) {
      check(removed.particles[1][key] === before.particles[1][key], `Removal changed survivor ${key}`);
      check(removed.particles[0][key] === before.particles[0][key], `Mask removal changed stored removed-particle ${key}`);
    }
    check(removed.rawEncoded.positions[2] === -before.rawEncoded.positions[2], 'Removal lost exact negative cell code');
    removalWorld.step(8);
    const after = removalWorld.readback({ raw: true, includeBuckets: true });
    check(after.particles[1].y > before.particles[1].y + 0.05, 'Survivor did not fall after online support removal');
    check(!after.diagnostics.invalid, 'Online removal result invalid');
    cases.push({ name: 'online-support-removal', passed: true, before: before.particles, immediatelyRemoved: removed.particles, after: after.particles, diagnostics: after.diagnostics, buckets: bucketAudit(after) });
  } finally { removalWorld.dispose(); }
  const weakWorld = await createGPUWorld(gl, [{id: 0, x: 140, y: 400}, {id: 1, x: 140, y: 400-C.diameter-C.contactSkin}], {sources, passes, shock});
  try {
    weakWorld.step(10);
    const snapshot = weakWorld.readback({raw: true, includeBuckets: true});
    check(!snapshot.diagnostics.invalid, 'Weak-contact freefall invalid');
    for (let i=0; i<2; i++) {
      const initialY = i === 0 ? 400 : 400-C.diameter-C.contactSkin;
      check(Math.abs(snapshot.particles[i].vy-20) < .1, 'Tiny contact error caused false terminal velocity instead of gravity');
      check(Math.abs(snapshot.particles[i].y-initialY-.875) < .001, 'Weak-contact freefall lost local-coordinate precision');
    }
    cases.push({name:'weak-contact-freefall', passed:true, particles:snapshot.particles, diagnostics:snapshot.diagnostics, buckets:bucketAudit(snapshot)});
  } finally { weakWorld.dispose(); }
  return { passed: true, positionEncoding: C.positionEncoding.name, kind: 'real WebGL2 shader compile, float framebuffer/readback, depth peeling, and minimal numeric contract', passes, shock, realShaderCompile: true, cases, commercialFPSClaimed: false, legacyTrajectoryEquivalenceClaimed: false };
}
