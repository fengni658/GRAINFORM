import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GPUWorld, createGPUWorld, GPU_CONTRACT, POSITION_ENCODING, SHADER_FILES, encodeGPUPosition, decodeGPUPositions } from '../gpu-solver.mjs';
const sources = Object.fromEntries(await Promise.all(SHADER_FILES.map(async n => [n, await readFile(new URL(`../shaders/${n}`, import.meta.url), 'utf8')])));

// A strict API-contract fake, NOT a shader compiler or GPU numeric test.
function fakeGL() {
  let serial = 1, activeUnit = 0, framebuffer = null, currentProgram = null;
  const textures = new Map(), framebuffers = new Map(), units = new Map();
  const gl = { calls: [], drawFeedbackChecks: 0 };
  const constants = ['MAX_TEXTURE_SIZE','MAX_DRAW_BUFFERS','MAX_COLOR_ATTACHMENTS','MAX_TEXTURE_IMAGE_UNITS','VERTEX_SHADER','FRAGMENT_SHADER','COMPILE_STATUS','LINK_STATUS','TEXTURE_2D','TEXTURE_MIN_FILTER','TEXTURE_MAG_FILTER','TEXTURE_WRAP_S','TEXTURE_WRAP_T','NEAREST','CLAMP_TO_EDGE','RGBA32F','RGBA','FLOAT','FRAMEBUFFER','FRAMEBUFFER_COMPLETE','RENDERBUFFER','DEPTH_COMPONENT24','DEPTH_ATTACHMENT','BLEND','CULL_FACE','DITHER','SCISSOR_TEST','DEPTH_TEST','LESS','POINTS','TRIANGLES','NO_ERROR'];
  constants.forEach((name, i) => gl[name] = i + 1);
  gl.COLOR_ATTACHMENT0 = 1000; gl.TEXTURE0 = 2000; gl.COLOR_BUFFER_BIT = 0x4000; gl.DEPTH_BUFFER_BIT = 0x0100;
  const object = kind => ({ kind, id: serial++ });
  gl.getExtension = name => name === 'EXT_color_buffer_float' ? {} : null;
  gl.getParameter = param => param === gl.MAX_TEXTURE_SIZE ? 4096 : param === gl.MAX_TEXTURE_IMAGE_UNITS ? 16 : 4;
  gl.createProgram = () => ({ ...object('program'), samplers: new Map(), shaders: [] });
  gl.createShader = type => ({ ...object('shader'), type });
  gl.shaderSource = (s, source) => s.source = source;
  gl.compileShader = () => {};
  gl.getShaderParameter = () => true;
  gl.getShaderInfoLog = () => '';
  gl.attachShader = (p, s) => p.shaders.push(s);
  gl.linkProgram = () => {};
  gl.getProgramParameter = () => true;
  gl.getProgramInfoLog = () => '';
  gl.createTexture = () => { const t = object('texture'); textures.set(t, {}); return t; };
  gl.activeTexture = unit => activeUnit = unit - gl.TEXTURE0;
  gl.bindTexture = (_, t) => units.set(activeUnit, t);
  gl.texParameteri = () => {};
  gl.texStorage2D = (_, __, ___, w, h) => Object.assign(textures.get(units.get(activeUnit)), { w, h });
  gl.texSubImage2D = (_, __, ___, ____, w, h, _____, ______, data) => textures.get(units.get(activeUnit)).data = data.slice();
  gl.createFramebuffer = () => { const f = object('framebuffer'); framebuffers.set(f, new Map()); return f; };
  gl.bindFramebuffer = (_, f) => framebuffer = f;
  gl.framebufferTexture2D = (_, at, __, texture) => framebuffers.get(framebuffer).set(at, texture);
  gl.createRenderbuffer = () => object('renderbuffer');
  gl.bindRenderbuffer = gl.renderbufferStorage = gl.framebufferRenderbuffer = () => {};
  gl.checkFramebufferStatus = () => gl.FRAMEBUFFER_COMPLETE;
  gl.createVertexArray = () => object('vao');
  gl.bindVertexArray = () => {};
  for (const name of ['disable','enable','colorMask','drawBuffers','viewport','depthFunc','depthMask','clearColor','clearDepth','scissor','clear']) gl[name] = (...args) => gl.calls.push([name, ...args]);
  gl.getUniformLocation = (p, name) => ({ program: p, name });
  gl.useProgram = p => currentProgram = p;
  gl.uniform1i = (location, value) => { if (/sampler2D\s+/.test(currentProgram.shaders.map(s => s.source).join('\n')) && currentProgram.shaders.some(s => s.source.includes(`sampler2D ${location.name};`))) currentProgram.samplers.set(location.name, value); gl.calls.push(['uniform1i', location.name, value]); };
  for (const name of ['uniform1f','uniform2i','uniform2f']) gl[name] = (location, ...args) => gl.calls.push([name, location.name, ...args]);
  gl.drawArrays = (kind, first, count) => {
    const targets = [...framebuffers.get(framebuffer).values()].filter(Boolean);
    for (const unit of currentProgram.samplers.values()) assert.ok(!targets.includes(units.get(unit)), 'Framebuffer feedback detected');
    gl.drawFeedbackChecks++;
    gl.calls.push(['drawArrays', kind, first, count]);
  };
  gl.isContextLost = () => false;
  gl.readBuffer = () => {};
  gl.readPixels = (_, __, ___, ____, _____, ______, data) => {
    const t = framebuffers.get(framebuffer).get(gl.COLOR_ATTACHMENT0);
    data.set(textures.get(t).data);
    gl.calls.push(['readPixels']);
  };
  gl.getError = () => gl.NO_ERROR;
  gl.finish = () => gl.calls.push(['finish']);
  for (const name of ['deleteShader','deleteProgram','deleteTexture','deleteFramebuffer','deleteRenderbuffer','deleteVertexArray']) gl[name] = () => {};
  return gl;
}
const particles = [{ id: 19, x: 100, y: 300, vx: 1, vy: 0, color: 4 }, { id: 2, x: 102, y: 300, color: 1 }];
assert.equal(GPU_CONTRACT.gridOriginY, -16);
assert.equal(GPU_CONTRACT.gridRows, 110);
assert.equal(GPU_CONTRACT.contactActivationDepth, 0.001);
assert.equal(GPU_CONTRACT.positionEncoding, POSITION_ENCODING);
assert.equal(GPU_CONTRACT.fixedDt / GPU_CONTRACT.substeps, GPU_CONTRACT.subDt);
assert.ok(GPU_CONTRACT.cell - 2 * GPU_CONTRACT.driftLimit > GPU_CONTRACT.diameter + GPU_CONTRACT.contactSkin, 'fixed-grid 3x3 proof margin');
for (const passes of [16, 32, 64]) {
  const gl = fakeGL();
  const world = new GPUWorld(gl, particles, { passes, sources });
  assert.equal(world.diagnostics.invalid, null);
  const before = gl.calls.length;
  const submitted = world.step(2);
  const stepCalls = gl.calls.slice(before);
  assert.equal(submitted.gpuCompletionVerified, false);
  assert.equal(world.steps, 2);
  assert.equal(world.substeps, 4);
  assert.equal(world.drawCalls, 4 * (19 + passes));
  assert.equal(stepCalls.filter(c => c[0] === 'drawArrays' && c[1] === gl.POINTS).length, 4 * 17);
  assert.equal(stepCalls.filter(c => c[0] === 'readPixels' || c[0] === 'finish').length, 0);
  assert.equal(stepCalls.filter(c => c[0] === 'uniform1i' && c[1] === 'uLayer' && c[2] === 16).length, 4);
  assert.equal(stepCalls.filter(c => c[0] === 'uniform1i' && c[1] === 'uShock' && c[2] === 0).length, 4 * 8);
  assert.equal(stepCalls.filter(c => c[0] === 'uniform1i' && c[1] === 'uShock' && c[2] === 1).length, 4 * (passes - 8));
  assert.equal(gl.drawFeedbackChecks, world.drawCalls);
  assert.equal(world.getGPUState().count, 2);
  assert.equal(world.getGPUState().positionEncoding, POSITION_ENCODING);
  assert.ok(world.getGPUState().previousPositionTexture);
  assert.equal(world._textures.length, 11, 'precision repair must not allocate another texture');
  assert.equal(stepCalls.filter(c => c[0] === 'uniform1f' && c[1] === 'uContactActivationDepth' && c[2] === .001).length, 4 * passes);
  const removeStart = gl.calls.length;
  const removed = world.remove([19]);
  assert.deepEqual(removed.removedIds, [19]);
  assert.equal(world.count, 2);
  assert.equal(gl.calls.slice(removeStart).filter(c => c[0] === 'readPixels' || c[0] === 'finish').length, 0);
  assert.equal(gl.calls.slice(removeStart).filter(c => c[0] === 'drawArrays').length, 1);
  assert.deepEqual(world.remove([19]).removedIds, []);
  assert.throws(() => world.remove([123456]), /Unknown/);
  world.finish();
  assert.equal(gl.calls.at(-1)[0], 'finish');
  // Fake does not execute shaders: reading it checks API/data layout only.
  const read = world.readback({ raw: true, includeBuckets: true });
  assert.equal(read.particles[0].id, 19);
  assert.equal(read.particles[1].id, 2);
  assert.equal(read.particles[0].color, 4);
  assert.equal(read.diagnostics.sleepImplemented, false);
  assert.equal(read.buckets.length, 2);
  assert.ok(read.raw.positions instanceof Float64Array);
  assert.ok(read.raw.gridPositions instanceof Float64Array);
  assert.ok(read.raw.previousPositions instanceof Float64Array);
  assert.ok(read.rawEncoded.positions instanceof Float32Array);
  assert.equal(read.raw.positionEncoding, 'decoded-world-xy-alive-strength');
  assert.equal(read.rawEncoded.positionEncoding, POSITION_ENCODING);
  assert.equal(typeof read.particles[0].contactStrength, 'number');
  assert.equal(typeof read.particles[0].touched, 'boolean');
  assert.equal(world.diagnostics.pendingGPUReadback, false);
  world.step();
  assert.equal(world.diagnostics.pendingGPUReadback, true);
  world.dispose();
  assert.throws(() => world.step(), /disposed/);
}
// Initial texture uploads and readback decode are real typed-array operations even in this mock.
const inputCases = [
  { id: 'high-y', x: 140.123456, y: 419.123456, vx: 2, vy: -1 },
  { id: 'negative-cell', x: 20, y: -20.123456, alive: false },
  { id: 'floor', x: 259.125, y: 419.125 },
];
const encodedWorld = new GPUWorld(fakeGL(), inputCases, { sources });
const initial = encodedWorld.readback({ raw: true });
for (let i = 0; i < inputCases.length; i++) {
  const p = inputCases[i], out = initial.particles[i], at = i * 4;
  assert.ok(Math.abs(out.x - p.x) < 1.3e-7 && Math.abs(out.y - p.y) < 1.3e-7);
  assert.equal(out.alive, p.alive !== false);
  assert.deepEqual(initial.rawEncoded.positions.slice(at, at + 4), encodeGPUPosition(p.x, p.y, p.alive !== false));
}
assert.equal(initial.rawEncoded.positions[6] < 0, true);
const justEncoded = encodedWorld.readback({ rawEncoded: true });
assert.equal(justEncoded.raw, undefined);
assert.ok(justEncoded.rawEncoded);
encodedWorld.dispose();
for (const p of [{x:-484.01,y:0},{x:540,y:0},{x:28,y:-4112.01},{x:28,y:258032},{x:536,y:258028}]) {
  assert.throws(() => new GPUWorld(fakeGL(), [p], { sources }), /packing range/);
}
for (const [p, error] of [[[{ x: NaN, y: 300 }], /finite/], [[{ x: 100, y: 300, vx: 600 }], /60/], [[{ x: 100, y: 300, vy: -60.01 }], /60/], [[{ id: 1, x: 100, y: 300 }, { id: 1, x: 102, y: 300 }], /Duplicate/]]) assert.throws(() => new GPUWorld(fakeGL(), p, { sources }), error);
assert.throws(() => new GPUWorld(fakeGL(), particles, { sources, passes: 8 }), /16, 32, or 64/);
const equalGL = fakeGL();
const equalWorld = new GPUWorld(equalGL, particles, { sources, shock: false });
equalWorld.step();
assert.equal(equalGL.calls.filter(c => c[0] === 'uniform1i' && c[1] === 'uShock' && c[2] === 1).length, 0);
assert.equal(equalWorld.diagnostics.shock, false);
equalWorld.dispose();
const empty = await createGPUWorld(fakeGL(), [], { sources });
empty.step();
assert.equal(empty.drawCalls, 0);
assert.equal(empty.substeps, 2);
empty.dispose();
assert.match(sources['project.frag.glsl'], /texelFetch\(uGridPosition/);
assert.match(sources['project.frag.glsl'], /encodedIdAt\(cell, 16\)/);
assert.match(sources['project.frag.glsl'], /max\(diagnostic.x, length\(positionDifference\(next, grid\)\)\)/);
assert.match(sources['project.frag.glsl'], /distanceSquared >= target \* target/);
assert.match(sources['project.frag.glsl'], /1.0 \/ \(1.0 \+ exp\(separation.y \* uShockHeightBias\)\)/);
assert.match(sources['bucket.vert.glsl'], /vEncodedId <= previousId/);
assert.match(sources['velocity.frag.glsl'], /vec4\(v, 0.0, 0.0\)/);
console.log(JSON.stringify({ passed: true, kind: 'mock GL API and shader source contract only', realShaderCompile: false, realGPUNumerics: false, passes: [16, 32, 64], stableArraySlots: true, noReadbackDuringStep: true, noFramebufferFeedback: true }));
