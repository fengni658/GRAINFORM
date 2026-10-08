import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { encodeGPUPosition, decodeGPUPositions, GPU_CONTRACT as C, POSITION_ENCODING as E } from '../gpu-solver.mjs';

const roundTrip = (x, y, alive = true, strength = .25) => {
  const encoded = encodeGPUPosition(x, y, alive, strength), decoded = decodeGPUPositions(encoded);
  assert.ok(encoded[0] >= 0 && encoded[0] < 4 && encoded[1] >= 0 && encoded[1] < 4, 'canonical local coordinates');
  assert.equal(Math.trunc(encoded[2]), encoded[2], 'exact integer cell code');
  assert.ok(Math.abs(encoded[2]) < 2 ** 24 && encoded[2] !== 0);
  assert.ok(Math.abs(decoded[0] - x) < 2.5e-7, `${x} x precision`);
  assert.ok(Math.abs(decoded[1] - y) < 2.5e-7, `${y} y precision`);
  assert.equal(decoded[2], alive ? 1 : 0);
  assert.equal(decoded[3], Math.fround(strength));
  return { encoded, decoded };
};

test('every normal grid cell roundtrips without world-F32 loss', () => {
  for (let cy = 0; cy < C.gridRows; cy++) for (let cx = 0; cx < C.gridCols; cx++) {
    roundTrip(C.gridOriginX + cx * 4 + 1.123456789, C.gridOriginY + cy * 4 + 2.234567891);
  }
  const { decoded } = roundTrip(140.123456789, 419.123456789);
  assert.ok(Math.abs(decoded[1] - 419.123456789) < Math.abs(Math.fround(419.123456789) - 419.123456789) / 10);
});

test('signed codes retain dead positions and exact range endpoints', () => {
  assert.equal(roundTrip(-484, -4112).encoded[2], 1);
  assert.equal(roundTrip(532, 258028).encoded[2], 2 ** 24 - 1);
  assert.equal(roundTrip(532, 258028, false).encoded[2], -(2 ** 24 - 1));
  roundTrip(20, 300); // Intentional out-of-grid fixture is packable, not aliased.
  roundTrip(-480.00000001, -4108.00000001);
  assert.deepEqual(Array.from(decodeGPUPositions(new Float32Array(4))), [0, 0, 0, 0]);
  for (const [x,y] of [[-484.01,0],[540,0],[28,-4112.01],[28,258032],[536,258028],[1e99,1e99]]) {
    assert.throws(() => encodeGPUPosition(x,y), /packing range/);
  }
  assert.throws(() => encodeGPUPosition(540 - 1e-10,0), /packing range/, 'F32 carry beyond range must reject, not alias');
});

test('invalid packed code decodes as unusable rather than another cell', () => {
  for (const code of [2 ** 24, -(2 ** 24), 1.5, NaN, Infinity]) {
    const out = decodeGPUPositions(new Float32Array([0,0,code,0]));
    assert.ok(Number.isNaN(out[0]) && Number.isNaN(out[1]));
  }
  assert.equal(E.maxCodeExclusive, 2 ** 24);
});

test('GLSL positions stay local and contact strength is continuous', async () => {
  const shader = async n => readFile(new URL(`../shaders/${n}`, import.meta.url), 'utf8');
  const project = await shader('project.frag.glsl'), predict = await shader('predict.frag.glsl'), velocity = await shader('velocity.frag.glsl'), bucket = await shader('bucket.vert.glsl'), remove = await shader('remove.frag.glsl');
  for (const source of [project,predict,velocity,bucket,remove]) assert.match(source, /precision highp sampler2D;/);
  for (const source of [project,predict,velocity,bucket]) {
    assert.match(source, /positionCell/);
    assert.doesNotMatch(source, /uGridOrigin\b|uLeft\b|uRight\b|uFloor\b|p\.xy\s*-\s*q\.xy/);
    assert.match(source, /INVALID_CELL_CODE = 16777216\.0/);
  }
  assert.match(project, /separation = positionDifference\(p, q\)/);
  assert.match(project, /positionDifference\(p, texelFetch\(uPrevious/);
  assert.match(project, /length\(positionDifference\(next, grid\)\)/);
  assert.match(project, /smoothstep\(0\.0, uContactActivationDepth, error\)/);
  assert.match(project, /contactCount \+= contactStrength/);
  assert.match(project, /strength = max\(strength, contactStrength\)/);
  assert.match(project, /cell\.x == 57 && next\.x > 3\.125/);
  assert.match(project, /cell\.y == 108 && next\.y >= 3\.125/);
  assert.match(predict, /normalizedPosition\(p\.xy \+ velocity \* uDt, positionCell\(p\), 0\.0\)/);
  assert.match(velocity, /positionDifference\(p, old\) \/ uDt/);
  assert.match(velocity, /1\.0 - \(1\.0 - uContactDamping\) \* p\.w/);
  assert.match(bucket, /ivec2 cell = positionCell\(p\)/);
  assert.match(remove, /vec4\(p\.xy, -abs\(p\.z\), p\.w\)/);
  assert.match(remove, /outVelocity = v;/);
});
