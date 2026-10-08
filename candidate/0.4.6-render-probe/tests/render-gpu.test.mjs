import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRenderer, createOctagonMesh, createFrameMesh, InstanceBatch, PALETTES, GRAIN_R, INSTANCE_FLOATS } from '../renderer-gpu.mjs';

const near = (actual, expected, epsilon = 2e-5) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
const physical = count => Array.from({ length: count }, (_, i) => ({ id: i + 1, x: 29.125 + (i % 128) * 1.8, y: 419.125 - Math.floor(i / 128) * 1.8, color: 1 + i % 4, sleep: !!(i % 2) }));
const active = { x: 100, y: 42, color: 3, shape: [[0, 0], [1, 0], [0, 1], [1, 1]] };
const snapshot = count => ({ bodies: physical(count), active });

// Call-contract mock only. This does not compile GLSL, execute on a GPU, measure
// GPU speed, or replace the required independent real-browser run.
export function mockCanvas({ unavailable = false, compileFails = false, linkFails = false, allocationFails = false, initialError = 0 } = {}) {
  const calls = [], listeners = new Map();
  let id = 0, error = initialError, lost = false;
  const gl = { calls, COMPILE_STATUS: 1, LINK_STATUS: 2, VERTEX_SHADER: 3, FRAGMENT_SHADER: 4, ARRAY_BUFFER: 5, STATIC_DRAW: 6, DYNAMIC_DRAW: 7,
    FLOAT: 8, DEPTH_TEST: 9, STENCIL_TEST: 10, CULL_FACE: 11, BLEND: 12, SCISSOR_TEST: 13, COLOR_BUFFER_BIT: 14, TRIANGLES: 15, TRIANGLE_FAN: 16, NO_ERROR: 0,
    getContextAttributes: () => ({ antialias: true }), getShaderParameter: () => !compileFails, getShaderInfoLog: () => 'fixture compile failure',
    getProgramParameter: () => !linkFails, getProgramInfoLog: () => 'fixture link failure', getError: () => { const result = error; error = 0; return result; },
    isContextLost: () => lost,
    createShader: () => allocationFails ? null : { id: ++id, type: 'shader' }, createProgram: () => ({ id: ++id, type: 'program' }),
    createBuffer: () => ({ id: ++id, type: 'buffer' }), createVertexArray: () => ({ id: ++id, type: 'vao' }) };
  for (const name of ['shaderSource', 'compileShader', 'deleteShader', 'attachShader', 'linkProgram', 'deleteProgram', 'deleteBuffer', 'deleteVertexArray',
    'bindBuffer', 'bufferData', 'bindVertexArray', 'enableVertexAttribArray', 'vertexAttribPointer', 'vertexAttribDivisor', 'disable', 'clearColor',
    'viewport', 'clear', 'useProgram', 'drawArrays', 'drawArraysInstanced']) gl[name] = (...args) => calls.push({ name, args });
  gl.bufferSubData = (...args) => calls.push({ name: 'bufferSubData', args, uploaded: Array.from(args[2].subarray(args[3], args[3] + args[4])) });
  const canvas = { width: 0, height: 0, getBoundingClientRect: () => ({ width: 360 }),
    getContext: (...args) => { calls.push({ name: 'getContext', args }); return unavailable ? null : gl; },
    addEventListener: (type, callback) => listeners.set(type, callback),
    removeEventListener: (type, callback) => { if (listeners.get(type) === callback) listeners.delete(type); },
    fire(type) { if (type === 'webglcontextlost') lost = true; if (type === 'webglcontextrestored') lost = false; let prevented = false; listeners.get(type)?.({ preventDefault: () => { prevented = true; } }); return prevented; }
  };
  return { gl, canvas, calls, listeners };
}

test('mesh has eight distinct vertices, eight triangles, pi/8 orientation and R <= 0.870', () => {
  const mesh = createOctagonMesh();
  assert.equal(mesh.length, 20); assert.deepEqual([...mesh.slice(0, 2)], [0, 0]);
  const points = Array.from({ length: 8 }, (_, i) => [mesh[2 + i * 2], mesh[3 + i * 2]]);
  assert.equal(new Set(points.map(point => point.join(','))).size, 8);
  assert.deepEqual([...mesh.slice(18)], points[0]);
  let sumArea = 0;
  for (let i = 0; i < 8; i++) {
    const [x, y] = points[i], [nx, ny] = points[(i + 1) % 8];
    assert.ok(Math.hypot(x, y) <= GRAIN_R); near(Math.hypot(x, y), GRAIN_R, 1e-7);
    near(x, GRAIN_R * Math.cos(Math.PI / 8 + i * Math.PI / 4), 1e-7);
    near(y, GRAIN_R * Math.sin(Math.PI / 8 + i * Math.PI / 4), 1e-7);
    const triangleArea = (x * ny - y * nx) / 2; assert.ok(triangleArea > 0); sumArea += triangleArea;
  }
  near(sumArea, 4 * GRAIN_R ** 2 * Math.sin(Math.PI / 4), 1e-6);
  assert.ok(GRAIN_R < .875, 'visual geometry remains inside the actual collision circle');
});

test('all 4096 real positions and all four colors are preserved in source order', () => {
  const input = { bodies: physical(4096), active: null }, before = structuredClone(input);
  const batch = new InstanceBatch(1).fill(input);
  assert.equal(batch.physicalCount, 4096); assert.equal(batch.activeGlyphCount, 0); assert.equal(batch.count, 4096);
  assert.equal(INSTANCE_FLOATS, 5);
  for (let i = 0; i < input.bodies.length; i++) {
    const body = input.bodies[i], offset = i * 5, color = PALETTES.standard[body.color];
    near(batch.data[offset], body.x); near(batch.data[offset + 1], body.y);
    for (let c = 0; c < 3; c++) near(batch.data[offset + 2 + c], Number.parseInt(color.slice(1 + c * 2, 3 + c * 2), 16) / 255, 1e-7);
  }
  assert.deepEqual(input, before, 'render staging must never move/change physical state');
});

test('contrast/custom palettes change RGB only and reuse the high-water staging allocation', () => {
  const input = snapshot(73), batch = new InstanceBatch(1024).fill(input), allocation = batch.data;
  const positions = Array.from({ length: batch.count }, (_, i) => [batch.data[i * 5], batch.data[i * 5 + 1]]);
  for (const palette of ['contrast', ['', '#010203', '#102030', '#aabbcc', '#ffffff']]) {
    batch.fill(input, palette); assert.equal(batch.data, allocation);
    const source = typeof palette === 'string' ? PALETTES[palette] : palette;
    for (let i = 0; i < batch.count; i++) {
      assert.deepEqual([batch.data[i * 5], batch.data[i * 5 + 1]], positions[i]);
      const color = source[i < 73 ? input.bodies[i].color : active.color];
      for (let c = 0; c < 3; c++) near(batch.data[i * 5 + 2 + c], Number.parseInt(color.slice(1 + c * 2, 3 + c * 2), 16) / 255, 1e-7);
    }
  }
  batch.fill({ bodies: [], active: null }); assert.equal(batch.data, allocation); assert.equal(batch.count, 0);
});

test('active four-cell piece uses exactly 676 octagon glyphs with original per-cell positions', () => {
  const batch = new InstanceBatch().fill(snapshot(11));
  assert.equal(batch.physicalCount, 11); assert.equal(batch.activeGlyphCount, 676); assert.equal(batch.count, 687);
  let i = 11;
  for (const [bx, by] of active.shape) for (let gy = 0; gy < 13; gy++) for (let gx = 0; gx < 13; gx++) {
    near(batch.data[i * 5], active.x + bx * 24 + (gx + .5) * 24 / 13);
    near(batch.data[i * 5 + 1], active.y + by * 24 + (gy + .5) * 24 / 13); i++;
  }
  assert.equal(i, batch.count);
});

test('staging never silently filters malformed data or caps a dense count', () => {
  const batch = new InstanceBatch(1).fill(snapshot(20000));
  assert.equal(batch.physicalCount, 20000); assert.equal(batch.count, 20676);
  for (const body of [{ x: NaN, y: 1, color: 1 }, { x: 1, y: Infinity, color: 1 }, { x: 1, y: 2, color: 0 }, null]) {
    assert.throws(() => batch.fill({ bodies: [body] }), /Invalid physical body/);
  }
  assert.throws(() => batch.fill({ bodies: new Float32Array(3) }), /array/);
  assert.throws(() => batch.fill({ bodies: [], active: { ...active, shape: [null] } }), /cell/);
  assert.throws(() => batch.fill({ bodies: [] }, 'unknown'), /palette/);
});

test('static frame matches the original 32 guides plus 6 wall/edge rectangles', () => {
  const mesh = createFrameMesh(); assert.equal(mesh.length, 38 * 6 * 5);
  // First guide, first wall, last floor edge.
  assert.deepEqual([...mesh.slice(0, 2)], [12, 36]);
  assert.deepEqual([...mesh.slice(32 * 30, 32 * 30 + 2)], [24, 0]);
  assert.deepEqual([...mesh.slice(37 * 30, 37 * 30 + 2)], [28, 420]);
});

test('one live upload + one instanced fan draws EVERY physical body and active glyph', () => {
  const { canvas, calls, gl } = mockCanvas(), renderer = createRenderer(canvas);
  assert.equal(renderer.ok, true); const initializationCalls = calls.length;
  const input = snapshot(4096), result = renderer.render(input, { dpr: 2 });
  assert.equal(result.ok, true); assert.equal(result.instanceCount, 4772); assert.equal(result.physicalCount, 4096);
  assert.equal(result.activeGlyphCount, 676); assert.equal(result.width, 720); assert.equal(result.height, 1080);
  const frameCalls = calls.slice(initializationCalls), uploads = frameCalls.filter(c => c.name === 'bufferSubData');
  assert.equal(uploads.length, 1); assert.equal(uploads[0].args[4], 4772 * 5); assert.equal(uploads[0].uploaded.length, 4772 * 5);
  const draws = frameCalls.filter(c => c.name === 'drawArraysInstanced'); assert.equal(draws.length, 1);
  assert.deepEqual(draws[0].args, [gl.TRIANGLE_FAN, 0, 10, 4772]);
  assert.equal(frameCalls.filter(c => c.name === 'drawArrays').length, 1);
  assert.equal(frameCalls.filter(c => c.name === 'bufferData').length, 0, 'steady-state rendering does not reallocate GPU storage');
  assert.equal(result.uploadedBytes, 4772 * 20); assert.equal(result.drawCalls, 2);
  const attributes = calls.filter(c => c.name === 'vertexAttribDivisor').map(c => c.args); assert.deepEqual(attributes, [[1, 1], [2, 1]]);
  assert.equal(renderer.diagnostics.gpuCompletionMs, null); assert.equal(renderer.diagnostics.presentedFPS, null);
  assert.match(renderer.diagnostics.timingScope, /excludes GPU/); assert.equal(renderer.diagnostics.pendingTasks, 0);
});

test('resize/DPR/empty/growth/restart paths maintain exact upload ranges', () => {
  const { canvas, calls } = mockCanvas(), renderer = createRenderer(canvas);
  for (const count of [0, 1, 10000, 13, 0, 4096]) {
    const at = calls.length, result = renderer.render({ bodies: physical(count) }, { dpr: 10, cssWidth: 288 });
    assert.equal(result.ok, true); assert.equal(result.width, 864); assert.equal(result.height, 1296); assert.equal(result.instanceCount, count);
    const frame = calls.slice(at), uploads = frame.filter(c => c.name === 'bufferSubData');
    assert.equal(uploads.length, count ? 1 : 0); if (count) assert.equal(uploads[0].args[4], count * 5);
  }
  assert.equal(renderer.diagnostics.frames, 6); assert.ok(renderer.diagnostics.capacity >= 10000);
  renderer.render({ bodies: [] }, { dpr: 1.25, cssWidth: 300 }); assert.equal(canvas.width, 375); assert.equal(canvas.height, 563);
  assert.equal(renderer.render({ bodies: [] }, { dpr: 0 }).ok, false);
});

test('bounded diagnostics window reports submission only, never fake GPU/FPS results', () => {
  const { canvas } = mockCanvas(), renderer = createRenderer(canvas);
  for (let i = 0; i < 300; i++) assert.equal(renderer.render({ bodies: [] }, { cssWidth: 288, dpr: 1 }).ok, true);
  const d = renderer.diagnostics; assert.equal(d.p95Window, 240); assert.equal(d.frames, 300);
  assert.ok(d.cpuSubmissionP95Ms >= 0); assert.equal(d.gpuCompletionMs, null); assert.equal(d.presentedFPS, null);
});

test('unavailable/compile/link/allocation/error failures never grab a 2D context', () => {
  for (const options of [{ unavailable: true }, { compileFails: true }, { linkFails: true }, { allocationFails: true }, { initialError: 1282 }]) {
    const { canvas, calls, listeners } = mockCanvas(options), renderer = createRenderer(canvas);
    assert.equal(renderer.ok, false); assert.equal(renderer.kind, 'unavailable'); assert.equal(renderer.requiresFreshCanvas, !options.unavailable);
    assert.ok(renderer.reason); assert.equal(listeners.size, 0);
    assert.deepEqual(calls.filter(c => c.name === 'getContext').map(c => c.args[0]), ['webgl2']);
  }
});

test('context loss stops calls, restoration recreates resources and redraws latest supplied state', () => {
  const { canvas, calls, listeners } = mockCanvas(), states = [], renderer = createRenderer(canvas, { onStateChange: info => states.push(info) });
  renderer.render(snapshot(4096));
  const oldPrograms = calls.filter(c => c.name === 'useProgram').map(c => c.args[0]);
  assert.equal(canvas.fire('webglcontextlost'), true); assert.equal(renderer.ok, false); assert.equal(renderer.state, 'lost');
  const at = calls.length;
  for (let i = 0; i < 10; i++) { const result = renderer.render(snapshot(20)); assert.equal(result.ok, false); assert.equal(result.recoverable, true); }
  assert.equal(calls.length, at, 'lost context does not accept queued uploads/draws');
  canvas.fire('webglcontextrestored'); assert.equal(renderer.ok, true); assert.equal(states.at(-1).restored, true);
  const result = renderer.render(snapshot(3)); assert.equal(result.instanceCount, 679);
  const lastProgram = calls.filter(c => c.name === 'useProgram').at(-1).args[0]; assert.ok(!oldPrograms.includes(lastProgram));
  assert.equal(renderer.diagnostics.lostCount, 1); assert.equal(renderer.diagnostics.restoredCount, 1);
  renderer.dispose(); renderer.dispose(); assert.equal(listeners.size, 0); assert.equal(renderer.state, 'disposed');
  assert.equal(renderer.render(snapshot(2)).ok, false);
});

test('restoration failure explicitly asks for a fresh canvas instead of stealing its context', () => {
  const { canvas, gl } = mockCanvas(), states = [], renderer = createRenderer(canvas, { onStateChange: info => states.push(info) });
  canvas.fire('webglcontextlost'); gl.getProgramParameter = () => false; canvas.fire('webglcontextrestored');
  assert.equal(renderer.state, 'failed'); assert.equal(renderer.requiresFreshCanvas, true); assert.equal(states.at(-1).requiresFreshCanvas, true);
  assert.equal(renderer.render(snapshot(1)).requiresFreshCanvas, true);
});

test('runtime has no sprites, texture uploads, GPU readback, sync wait or scheduler', async () => {
  const source = await readFile(new URL('../renderer-gpu.mjs', import.meta.url), 'utf8');
  for (const forbidden of ['readPixels', 'getBufferSubData', 'texImage2D', 'texSubImage2D', 'createTexture', 'drawImage', 'clientWaitSync', 'finish', 'requestAnimationFrame', 'setTimeout', 'setInterval']) {
    assert.doesNotMatch(source, new RegExp(`\\b${forbidden}\\s*\\(`));
  }
});
